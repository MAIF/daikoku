package fr.maif.controllers

import cats.data.EitherT
import cats.implicits.toBifunctorOps
import fr.maif.controllers.AppError
import fr.maif.actions.{
  ApiActionContext,
  CmsApiAction,
  DaikokuActionMaybeWithoutUser
}
import fr.maif.domain.Tenant.getCustomizationCmsPage
import fr.maif.domain.json.{CmsFileFormat, CmsPageFormat}
import fr.maif.domain.{CmsPageId, Tenant, TenantMode, User}
import fr.maif.env.Env
import fr.maif.logger.AppLogger
import fr.maif.login.AuthProvider.{OAuth2, Otoroshi}
import fr.maif.login.OAuth2Config
import fr.maif.services.{ApiService, AssetsService, CmsPage, TranslationsService}
import fr.maif.storage.{DataStore, Repo}
import fr.maif.utils.Cypher.encrypt
import fr.maif.utils.future.EnhancedObject
import fr.maif.utils.UpdateOrCreate
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.Logger
import play.api.libs.json.*
import play.api.mvc.*

import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Using}

case class CmsApiActionContext[A](
    request: Request[A],
    tenant: Tenant,
    override val ctx: TrieMap[String, String] = TrieMap.empty[String, String],
    override val user: User = null
) extends ApiActionContext[A]

class CmsApiController(
    CmsApiAction: CmsApiAction,
    env: Env,
    cc: ControllerComponents,
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    translationsService: TranslationsService,
    apiService: ApiService,
    assetsService: AssetsService,
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val logger: Logger = Logger(s"cms-controller-$entityName")

//  def description: String = entityClass.getName
//  def pathRoot: String = "/cms-api"
  def entityName: String = "api-cms-page"
  def entityStore(tenant: Tenant, ds: DataStore): Repo[CmsPage, CmsPageId] =
    ds.cmsRepo.forTenant(tenant)
  def toJson(entity: CmsPage): JsValue = entity.asJson

  def fromJson(entity: JsValue): Either[String, CmsPage] =
    CmsPageFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  def validate(
      entity: CmsPage,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, CmsPage] = EitherT.pure[Future, AppError](entity)

  def getId(entity: CmsPage): CmsPageId = entity.id

  private def bodyToSource[A](body: A): Source[ByteString, _] = {
    body match {
      case raw: AnyContentAsRaw =>
        Source.single(raw.raw.asBytes().getOrElse(ByteString.empty))
      case e =>
        throw new IllegalArgumentException("Request body is not raw data")
    }
  }

  def storeAssets() =
    CmsApiAction.async { ctx =>
      assetsService.storeAssets(ctx, bodyToSource(ctx.request.body))
    }

  def storeAsset() =
    CmsApiAction.async { ctx =>
      assetsService.storeAsset(ctx, bodyToSource(ctx.request.body))
    }

  def listAssets() =
    CmsApiAction.async { ctx =>
      assetsService.listAssets(ctx)
    }

  def slugifiedAssets() =
    CmsApiAction.async { ctx =>
      assetsService.slugifiedAssets(ctx)
    }

  def deleteAsset(assetId: String) =
    CmsApiAction.async { ctx =>
      assetsService.deleteAsset(assetId, ctx)
    }

  def doesAssetExists(slug: String) = {
    CmsApiAction.async { ctx =>
      assetsService.doesAssetExists(slug, ctx)
    }
  }

  def getAsset(assetId: String) = {
    CmsApiAction.async { ctx =>
      assetsService.getAsset(assetId, ctx)
    }
  }

  def getCmsPage(id: String) =
    CmsApiAction.async { ctx =>
      env.dataStore.cmsRepo
        .forTenant(ctx.tenant)
        .findById(id)
        .map {
          case None       => NotFound(Json.obj("error" -> "cms page not found"))
          case Some(page) => Ok(page.asJson)
        }
    }

  def sync() =
    CmsApiAction.async(parse.json) { ctx =>
      for {
        _ <- Future.sequence(
          ctx.request.body
            .as(Reads.seq(CmsFileFormat))
            .map(page => {
              val path = page.path()
              if (path.startsWith("/customization/")) {
                env.dataStore.cmsRepo
                  .forTenant(ctx.tenant)
                  .delete(Json.obj("path" -> page.path()))
                  .map(_ =>
                    env.dataStore.cmsRepo
                      .forTenant(ctx.tenant)
                      .save(
                        page
                          .toCmsPage(ctx.tenant.id)
                          .copy(id =
                            CmsPageId(
                              s"${ctx.tenant.id.value}-${page.name.split("\\.").head}"
                            )
                          )
                      )
                  )
              } else {
                env.dataStore.cmsRepo
                  .forTenant(ctx.tenant)
                  .deleteById(page.id())
                  .map(_ =>
                    env.dataStore.cmsRepo
                      .forTenant(ctx.tenant)
                      .save(page.toCmsPage(ctx.tenant.id))
                  )
              }
              FastFuture.successful(())
            })
        )
      } yield {
        NoContent
      }
    }

  def health() =
    CmsApiAction.async { ctx =>
      ctx.request.headers.get("Otoroshi-Health-Check-Logic-Test") match {
        // todo: better health check
        case Some(value) =>
          Ok.withHeaders(
            "Otoroshi-Health-Check-Logic-Test-Result" -> (value.toLong + 42L).toString
          ).future
        case None =>
          Ok(
            Json.obj(
              "tenantMode" -> ctx.tenant.tenantMode
                .getOrElse(TenantMode.Default)
                .name
            )
          ).future
      }
    }

  def version() =
    CmsApiAction.async { ctx =>
      entityStore(ctx.tenant, env.dataStore)
        .exists(Json.obj("_id" -> "daikoku_metadata"))
        .map {
          case true  => Ok(Json.obj())
          case false => NotFound
        }
    }

  private def readFile(path: String): EitherT[Future, AppError, String] = {
    env.environment.resourceAsStream(path) match {
      case Some(stream) =>
        try {
          val content = scala.io.Source.fromInputStream(stream).mkString
          stream.close()
          EitherT.pure[Future, AppError](content)
        } catch {
          case e: Throwable =>
            AppLogger.error(e.getLocalizedMessage, e)
            EitherT.leftT[Future, String](
              AppError.InternalServerError(e.getLocalizedMessage)
            )
        }
      case None =>
        EitherT.leftT[Future, String](
          AppError.BadRequestError(s"File not found at $path")
        )
    }
  }
  def tenantCustomization() =
    CmsApiAction.async { ctx =>
      (for {
        tenantStyle <- EitherT.fromOption[Future](
          ctx.tenant.style,
          AppError.EntityNotFound("Tenant customization")
        )
        cssPage <- EitherT.right[AppError](
          env.dataStore.cmsRepo
            .forTenant(ctx.tenant)
            .findById(tenantStyle.cssCmsPage)
            .map(
              _.getOrElse(
                getCustomizationCmsPage(
                  ctx.tenant.id,
                  "style",
                  "text/css",
                  ""
                )
              )
            )
        )
        themeBody <- readFile("public/themes/default.css")
        colorThemePage <- EitherT.right[AppError](
          env.dataStore.cmsRepo
            .forTenant(ctx.tenant)
            .findById(tenantStyle.colorThemeCmsPage)
            .map(
              _.getOrElse(
                getCustomizationCmsPage(
                  ctx.tenant.id,
                  "color-theme",
                  "text/css",
                  themeBody
                )
              )
            )
        )
        jsPage <- EitherT.right[AppError](
          env.dataStore.cmsRepo
            .forTenant(ctx.tenant)
            .findById(tenantStyle.jsCmsPage)
            .map(
              _.getOrElse(
                getCustomizationCmsPage(
                  ctx.tenant.id,
                  "script",
                  "text/javascript",
                  ""
                )
              )
            )
        )
      } yield Ok(
        Json.arr(
          cssPage.asJson,
          colorThemePage.asJson,
          jsPage.asJson
        )
      ))
        .leftMap(error => {
          AppLogger.error(error.getErrorMessage())
          error.render()
        })
        .merge
    }

  def findAll(): Action[AnyContent] =
    CmsApiAction.async { ctx =>
      entityStore(ctx.tenant, env.dataStore)
        .findAllNotDeleted()
        .map(entities => Ok(JsArray(entities.map(_.asJson))))
    }

  def getMailTranslations(domain: Option[String]) =
    CmsApiAction.async { ctx =>
      translationsService.getMailTranslations(
        ctx,
        domain,
        messagesApi,
        supportedLangs
      )
    }

  def getAllApis() =
    CmsApiAction.async { ctx =>
      apiService.getApis(ctx, true)
    }

  def getLoginToken() =
    CmsApiAction.async { ctx =>
      {
        Ok(
          Json.obj(
            "token" -> encrypt(
              env.config.cypherSecret,
              "daikoku-cli-login",
              ctx.tenant
            )
          )
        ).future
      }
    }

  def redirectToLoginPage() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      ctx.request.queryString.get("redirect").flatMap(_.headOption) match {
        case Some(redirect: String) =>
          ctx.tenant.authProvider match {
            case Otoroshi => FastFuture.successful(Redirect(redirect))
            case OAuth2 =>
              val authConfig = OAuth2Config
                .fromJson(ctx.tenant.authProviderSettings)
                .toOption
                .get
              val clientId = authConfig.clientId
              val responseType = "code"
              val scope = authConfig.scope // "openid profile email name"
              val redirectUri = authConfig.callbackUrl

              FastFuture.successful(
                Redirect(
                  s"${authConfig.loginUrl}?scope=${scope}&client_id=$clientId&response_type=$responseType&redirect_uri=$redirectUri"
                ).addingToSession(
                  s"redirect" -> redirect
                )(ctx.request)
              )
            case _ =>
              FastFuture.successful(Redirect(s"/?redirect=$redirect"))
          }
        case None =>
          NotFound(Json.obj("error" -> "redirect param is missing")).future
      }
    }
}

class CmsApiSwaggerController(cc: ControllerComponents)
    extends AbstractController(cc) {

  def swagger() =
    Action {
      Using(
        scala.io.Source.fromResource("public/swaggers/cms-api-openapi.json")
      ) { source =>
        source.mkString
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          BadRequest(Json.obj("error" -> e.getMessage))
        case Success(value) =>
          Ok(Json.parse(value)).withHeaders(
            "Access-Control-Allow-Origin" -> "*"
          )
      }
    }
}
