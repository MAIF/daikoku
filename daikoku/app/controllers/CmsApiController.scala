package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.toBifunctorOps
import controllers.{AppError, Assets}
import fr.maif.otoroshi.daikoku.actions.{
  ApiActionContext,
  CmsApiAction,
  DaikokuActionMaybeWithoutUser
}
import fr.maif.otoroshi.daikoku.domain.json.{CmsFileFormat, CmsPageFormat}
import fr.maif.otoroshi.daikoku.domain.{CmsPageId, Tenant, TenantMode, User}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider.{OAuth2, Otoroshi}
import fr.maif.otoroshi.daikoku.login.{IdentityAttrs, OAuth2Config}
import fr.maif.otoroshi.daikoku.services.{AssetsService, TranslationsService}
import fr.maif.otoroshi.daikoku.utils.ApiService
import fr.maif.otoroshi.daikoku.utils.Cypher.encrypt
import fr.maif.otoroshi.daikoku.utils.admin.UpdateOrCreate
import fr.maif.otoroshi.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.Logger
import play.api.libs.json._
import play.api.mvc._
import services.CmsPage
import storage.{DataStore, Repo}

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
    assets: Assets
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val logger: Logger = Logger(s"cms-controller-$entityName")

  private def entityClass = classOf[CmsPage]
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
            .as(Reads.seq(CmsFileFormat.reads))
            .map(page => {
              env.dataStore.cmsRepo
                .forTenant(ctx.tenant)
                .deleteById(page.id())
                .map(_ =>
                  env.dataStore.cmsRepo
                    .forTenant(ctx.tenant)
                    .save(page.toCmsPage(ctx.tenant.id))
                )
            })
        )
      } yield {
        NoContent
      }
    }

  def health() =
    CmsApiAction.async { ctx =>
      ctx.request.headers.get("Otoroshi-Health-Check-Logic-Test") match {
        //todo: better health check
        case Some(value) =>
          Ok.withHeaders(
              "Otoroshi-Health-Check-Logic-Test-Result" -> (value.toLong + 42L).toString
            )
            .future
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

  def defaultTenant() =
    CmsApiAction.async { ctx =>
      env.dataStore.translationRepo
        .forTenant(ctx.tenant)
        .find(Json.obj("element.id" -> ctx.tenant.id.asJson))
        .map(translations => {
          val translationAsJsObject = translations
            .groupBy(t => t.language)
            .map {
              case (k, v) =>
                Json
                  .obj(k -> JsObject(v.map(t => t.key -> JsString(t.value))))
            }
            .fold(Json.obj())(_ deepMerge _)
          val translation = Json.obj("translation" -> translationAsJsObject)
          Ok(ctx.tenant.asJsonWithJwt.as[JsObject] ++ translation)
        })
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
