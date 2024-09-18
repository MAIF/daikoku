package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.toBifunctorOps
import controllers.{AppError, Assets}
import fr.maif.otoroshi.daikoku.actions.{
  ApiActionContext,
  CmsApiAction,
  DaikokuActionMaybeWithoutUser
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.TenantAdminOnly
import fr.maif.otoroshi.daikoku.domain.json.{CmsFileFormat, CmsPageFormat}
import fr.maif.otoroshi.daikoku.domain.{
  CmsPage,
  CmsPageId,
  Tenant,
  TenantMode,
  User,
  UserSession
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider.{OAuth2, Otoroshi}
import fr.maif.otoroshi.daikoku.login.{IdentityAttrs, OAuth2Config}
import fr.maif.otoroshi.daikoku.services.TranslationsService
import fr.maif.otoroshi.daikoku.utils.ApiService
import fr.maif.otoroshi.daikoku.utils.Cypher.encrypt
import fr.maif.otoroshi.daikoku.utils.admin.UpdateOrCreate
import fr.maif.otoroshi.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.Logger
import play.api.libs.json._
import play.api.mvc._
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

  def synchronizeWithLocalBundle() =
    CmsApiAction.async { ctx =>
      Ok(Json.obj("message" -> "synchronization done")).future
    }

  def sync() = CmsApiAction.async(parse.json) { ctx =>
    for {
      _ <- env.dataStore.cmsRepo.forTenant(ctx.tenant).deleteAll()
      _ <- Future.sequence(
          ctx.request.body
            .as(Reads.seq(CmsFileFormat.reads))
            .map(page => {
              env.dataStore.cmsRepo
                .forTenant(ctx.tenant)
                .save(page.toCmsPage(ctx.tenant.id))
            })
        )
    } yield {
      NoContent
    }
  }

//  def sync() =
//    CmsApiAction.async(parse.json) { ctx =>
//      val body = ctx.request.body
//
//      Future
//        .sequence(
//          body
//            .as(Reads.seq(CmsFileFormat.reads))
//            .map(page => {
//              env.dataStore.cmsRepo
//                .forTenant(ctx.tenant)
//                .save(page.toCmsPage(ctx.tenant.id))
//            })
//        )
//        .map(_ => NoContent)
//        .recover {
//          case e: Throwable =>
//            BadRequest(Json.obj("error" -> e.getMessage))
//        }
//    }

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

//  def findById(id: String): Action[AnyContent] =
//    DaikokuApiAction.async { ctx =>
//      val notDeleted: Boolean =
//        ctx.request.queryString.get("notDeleted").exists(_.contains("true"))
//      if (notDeleted) {
//        entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id).flatMap {
//          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
//          case None =>
//            Errors.craftResponseResult(
//              s"$entityName not found",
//              Results.NotFound,
//              ctx.request,
//              None,
//              env
//            )
//        }
//      } else {
//        entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
//          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
//          case None =>
//            Errors.craftResponseResult(
//              s"$entityName not found",
//              Results.NotFound,
//              ctx.request,
//              None,
//              env
//            )
//        }
//      }
//    }
//
//  def createEntity(): Action[JsValue] =
//    DaikokuApiAction.async(parse.json) { ctx =>
//      fromJson(ctx.request.body) match {
//        case Left(e) =>
//          logger.error(s"Bad $entityName format", new RuntimeException(e))
//          Errors.craftResponseResult(
//            s"Bad $entityName format",
//            Results.BadRequest,
//            ctx.request,
//            None,
//            env
//          )
//        case Right(newEntity) =>
//          entityStore(ctx.tenant, env.dataStore)
//            .findByIdNotDeleted(getId(newEntity).value)
//            .flatMap {
//              case Some(_) =>
//                AppError
//                  .EntityConflict("entity with same id already exists")
//                  .renderF()
//              case None =>
//                validate(newEntity, UpdateOrCreate.Create)
//                  .map(entity =>
//                    entityStore(ctx.tenant, env.dataStore)
//                      .save(entity)
//                      .map(_ => Created(toJson(entity)))
//                  )
//                  .leftMap(_.renderF())
//                  .merge
//                  .flatten
//            }
//
//      }
//    }
//
//  def updateEntity(id: String): Action[JsValue] =
//    DaikokuApiAction.async(parse.json) { ctx =>
//      entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
//        case None =>
//          Errors.craftResponseResult(
//            s"Entity $entityName not found",
//            Results.NotFound,
//            ctx.request,
//            None,
//            env
//          )
//        case Some(_) =>
//          fromJson(ctx.request.body) match {
//            case Left(e) =>
//              logger.error(s"Bad $entityName format", new RuntimeException(e))
//              Errors.craftResponseResult(
//                s"Bad $entityName format",
//                Results.BadRequest,
//                ctx.request,
//                None,
//                env
//              )
//            case Right(newEntity) =>
//              validate(newEntity, UpdateOrCreate.Update)
//                .map(entity =>
//                  entityStore(ctx.tenant, env.dataStore)
//                    .save(entity)
//                    .map(_ => NoContent)
//                )
//                .leftMap(_.renderF())
//                .merge
//                .flatten
//          }
//      }
//    }
//
//  def patchEntity(id: String): Action[JsValue] =
//    DaikokuApiAction.async(parse.json) { ctx =>
//      object JsonPatchHelpers {
//        import diffson.jsonpatch._
//        import diffson.jsonpatch.lcsdiff.remembering.JsonDiffDiff
//        import diffson.lcs._
//        import diffson.playJson.DiffsonProtocol._
//        import diffson.playJson._
//
//        private def patchResponse(
//            patchJson: JsonPatch[JsValue],
//            document: JsValue
//        ): Either[AppError, JsValue] = {
//          patchJson.apply(document) match {
//            case JsSuccess(value, path) => Right(value)
//            case JsError(errors) =>
//              logger.error(s"error during patch entity : $errors")
//              val formattedErrors = errors.toVector.flatMap {
//                case (JsPath(nodes), es) =>
//                  es.map(e => e.message)
//              }
//              Left(AppError.EntityConflict(formattedErrors.mkString(",")))
//          }
//        }
//
//        def patchJson(
//            patchOps: JsValue,
//            document: JsValue
//        ): Either[AppError, JsValue] = {
//          val patch =
//            diffson.playJson.DiffsonProtocol.JsonPatchFormat.reads(patchOps).get
//          patchResponse(patch, document)
//        }
//
//        def diffJson(
//            sourceJson: JsValue,
//            targetJson: JsValue
//        ): Either[AppError, JsValue] = {
//          implicit val lcs = new Patience[JsValue]
//          val diff = diffson.diff(sourceJson, targetJson)
//          patchResponse(diff, targetJson)
//        }
//
//      }
//
//      val fu: Future[Option[CmsPage]] =
//        if (
//          ctx.request.queryString
//            .get("notDeleted")
//            .exists(_.contains("true"))
//        ) {
//          entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id)
//        } else {
//          entityStore(ctx.tenant, env.dataStore).findById(id)
//        }
//
//      def finalizePatch(patchedJson: JsValue): Future[Result] = {
//        fromJson(patchedJson) match {
//          case Left(e) =>
//            logger.error(s"Bad $entityName format", new RuntimeException(e))
//            Errors.craftResponseResult(
//              s"Bad $entityName format",
//              Results.BadRequest,
//              ctx.request,
//              None,
//              env
//            )
//          case Right(patchedEntity) =>
//            validate(patchedEntity, UpdateOrCreate.Update)
//              .map(entity =>
//                entityStore(ctx.tenant, env.dataStore)
//                  .save(entity)
//                  .map(_ => NoContent)
//              )
//              .leftMap(_.renderF())
//              .merge
//              .flatten
//        }
//      }
//
//      val value: Future[Result] = fu.flatMap {
//        case None =>
//          Errors.craftResponseResult(
//            s"Entity $entityName not found",
//            Results.NotFound,
//            ctx.request,
//            None,
//            env
//          )
//        case Some(entity) =>
//          val currentJson = toJson(entity)
//          ctx.request.body match {
//            case JsArray(_) =>
//              val patchedJson =
//                JsonPatchHelpers.patchJson(ctx.request.body, currentJson)
//              patchedJson.fold(
//                error => error.renderF(),
//                json => finalizePatch(json)
//              )
//            case JsObject(_) =>
//              val newJson =
//                currentJson
//                  .as[JsObject]
//                  .deepMerge(ctx.request.body.as[JsObject])
//              fromJson(newJson) match {
//                case Left(e) =>
//                  logger.error(
//                    s"Bad $entityName format",
//                    new RuntimeException(e)
//                  )
//                  Errors.craftResponseResult(
//                    s"Bad $entityName format",
//                    Results.BadRequest,
//                    ctx.request,
//                    None,
//                    env
//                  )
//                case Right(patchedEntity) =>
//                  val patchedJson =
//                    JsonPatchHelpers.diffJson(newJson, toJson(patchedEntity))
//                  patchedJson.fold(
//                    error => error.renderF(),
//                    json => finalizePatch(json)
//                  )
//
//              }
//
//            case _ =>
//              FastFuture.successful(
//                BadRequest(
//                  Json.obj("error" -> "[patch error] wrong patch format")
//                )
//              )
//          }
//
//      }
//      value
//    }
//
//  def deleteEntity(id: String): Action[AnyContent] =
//    DaikokuApiAction.async { ctx =>
//      if (ctx.request.queryString.get("logically").exists(_.contains("true"))) {
//        entityStore(ctx.tenant, env.dataStore)
//          .deleteByIdLogically(id)
//          .map(_ => Ok(Json.obj("done" -> true)))
//      } else {
//        entityStore(ctx.tenant, env.dataStore)
//          .deleteById(id)
//          .map(_ => Ok(Json.obj("done" -> true)))
//      }
//    }
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
