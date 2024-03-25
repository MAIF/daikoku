package fr.maif.otoroshi.daikoku.utils.admin

import cats.data.EitherT
import com.auth0.jwt.JWT
import com.google.common.base.Charsets
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.{CanJson, Tenant, ValueType}
import fr.maif.otoroshi.daikoku.env.{Env, LocalAdminApiConfig, OtoroshiAdminApiConfig}
import fr.maif.otoroshi.daikoku.login.TenantHelper
import fr.maif.otoroshi.daikoku.utils.Errors
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.Logger
import play.api.http.HttpEntity
import play.api.libs.json._
import play.api.mvc._
import storage.{DataStore, Repo}

import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

case class DaikokuApiActionContext[A](request: Request[A], tenant: Tenant)

class DaikokuApiAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuApiActionContext, AnyContent]
    with ActionFunction[Request, DaikokuApiActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext

  def decodeBase64(encoded: String): String =
    new String(Base64.getUrlDecoder.decode(encoded), Charsets.UTF_8)
  private def extractUsernamePassword(
      header: String
  ): Option[(String, String)] = {
    val base64 = header.replace("Basic ", "").replace("basic ", "")
    Option(base64)
      .map(decodeBase64)
      .map(_.split(":").toSeq)
      .flatMap(a =>
        a.headOption.flatMap(head => a.lastOption.map(last => (head, last)))
      )
  }

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuApiActionContext[A] => Future[Result]
  ): Future[Result] = {
    TenantHelper.withTenant(request, env) { tenant =>
      env.config.adminApiConfig match {
        case OtoroshiAdminApiConfig(headerName, algo) =>
          request.headers.get(headerName) match {
            case Some(value) =>
              Try(JWT.require(algo).build().verify(value)) match {
                case Success(decoded) if !decoded.getClaim("apikey").isNull =>
                  block(DaikokuApiActionContext[A](request, tenant))
                case _ =>
                  Errors.craftResponseResult(
                    "No api key provided",
                    Results.Unauthorized,
                    request,
                    None,
                    env
                  )
              }
            case _ =>
              Errors.craftResponseResult(
                "No api key provided",
                Results.Unauthorized,
                request,
                None,
                env
              )
          }
        case LocalAdminApiConfig(_) =>
          request.headers.get("Authorization") match {
            case Some(auth) if auth.startsWith("Basic ") =>
              extractUsernamePassword(auth) match {
                case None =>
                  Errors.craftResponseResult(
                    "No api key provided",
                    Results.Unauthorized,
                    request,
                    None,
                    env
                  )
                case Some((clientId, clientSecret)) =>
                  env.dataStore.apiSubscriptionRepo
                    .forTenant(tenant)
                    .findNotDeleted(
                      Json.obj(
                        "apiKey.clientId" -> clientId,
                        "apiKey.clientSecret" -> clientSecret
                      )
                    )
                    .map(_.length == 1)
                    .flatMap({
                      case done if done =>
                        block(DaikokuApiActionContext[A](request, tenant))
                      case _ =>
                        Errors.craftResponseResult(
                          "No api key provided",
                          Results.Unauthorized,
                          request,
                          None,
                          env
                        )
                    })
              }
            case _ =>
              Errors.craftResponseResult(
                "No api key provided",
                Results.Unauthorized,
                request,
                None,
                env
              )
          }
      }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuApiActionWithoutTenant(
    val parser: BodyParser[AnyContent],
    env: Env
) extends ActionBuilder[Request, AnyContent]
    with ActionFunction[Request, Request] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext

  override def invokeBlock[A](
      request: Request[A],
      block: Request[A] => Future[Result]
  ): Future[Result] = {
    env.config.adminApiConfig match {
      case OtoroshiAdminApiConfig(headerName, algo) =>
        request.headers.get(headerName) match {
          case Some(value) =>
            Try(JWT.require(algo).build().verify(value)) match {
              case Success(decoded) if !decoded.getClaim("apikey").isNull =>
                block(request)
              case _ =>
                Errors.craftResponseResult(
                  "No api key provided",
                  Results.Unauthorized,
                  request,
                  None,
                  env
                )
            }
          case _ =>
            Errors.craftResponseResult(
              "No api key provided",
              Results.Unauthorized,
              request,
              None,
              env
            )
        }
      case LocalAdminApiConfig(keyValue) =>
        request
          .getQueryString("key")
          .orElse(request.headers.get("X-Api-Key")) match {
          case Some(key) if key == keyValue => block(request)
          case _ =>
            Errors.craftResponseResult(
              "No api key provided",
              Results.Unauthorized,
              request,
              None,
              env
            )
        }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

abstract class AdminApiController[Of, Id <: ValueType](
    DaikokuApiAction: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val logger: Logger = Logger(s"admin-controller-$entityName")

  def description: String = entityClass.getName
  def pathRoot: String
  def entityName: String
  def entityStore(tenant: Tenant, ds: DataStore): Repo[Of, Id]
  def toJson(entity: Of): JsValue
  def fromJson(entity: JsValue): Either[String, Of]
  def entityClass: Class[Of]
  def validate(entity: Of): EitherT[Future, AppError, Of]
  def getId(entity: Of): Id

  def findAll(): Action[AnyContent] =
    DaikokuApiAction.async { ctx =>
      val paginationPage: Int = ctx.request.queryString
        .get("page")
        .flatMap(_.headOption)
        .map(_.toInt)
        .getOrElse(1)
      val paginationPageSize: Int =
        ctx.request.queryString
          .get("pageSize")
          .flatMap(_.headOption)
          .map(_.toInt)
          .getOrElse(Int.MaxValue)
      val paginationPosition = (paginationPage - 1) * paginationPageSize
      val allEntities =
        if (
          ctx.request.queryString.get("notDeleted").exists(_.contains("true"))
        ) {
          entityStore(ctx.tenant, env.dataStore).findAllNotDeleted()
        } else {
          entityStore(ctx.tenant, env.dataStore).findAll()
        }
      allEntities
        .map(all =>
          all
            .slice(paginationPosition, paginationPosition + paginationPageSize)
            .map(entity => toJson(entity))
        )
        .map { all =>
          if (
            ctx.request.queryString.get("stream").exists(_.contains("true"))
          ) {
            Ok.sendEntity(
              HttpEntity.Streamed(
                Source(all.map(a => ByteString(Json.stringify(a))).toList),
                None,
                Some("application/x-ndjson")
              )
            )
          } else {
            Ok(JsArray(all))
          }
        }
    }

  def findById(id: String): Action[AnyContent] =
    DaikokuApiAction.async { ctx =>
      val notDeleted: Boolean =
        ctx.request.queryString.get("notDeleted").exists(_.contains("true"))
      if (notDeleted) {
        entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id).flatMap {
          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
          case None =>
            Errors.craftResponseResult(
              s"$entityName not found",
              Results.NotFound,
              ctx.request,
              None,
              env
            )
        }
      } else {
        entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
          case None =>
            Errors.craftResponseResult(
              s"$entityName not found",
              Results.NotFound,
              ctx.request,
              None,
              env
            )
        }
      }
    }

  def createEntity(): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      fromJson(ctx.request.body) match {
        case Left(e) =>
          logger.error(s"Bad $entityName format", new RuntimeException(e))
          Errors.craftResponseResult(
            s"Bad $entityName format",
            Results.BadRequest,
            ctx.request,
            None,
            env
          )
        case Right(newEntity) =>
          entityStore(ctx.tenant, env.dataStore)
            .findByIdNotDeleted(getId(newEntity).value)
            .flatMap {
              case Some(_) =>
                AppError
                  .EntityConflict("entity with same id already exists")
                  .renderF()
              case None =>
                validate(newEntity)
                  .map(entity =>
                    entityStore(ctx.tenant, env.dataStore)
                      .save(entity)
                      .map(_ => Created(toJson(entity)))
                  )
                  .leftMap(_.renderF())
                  .merge
                  .flatten
            }

      }
    }

  def updateEntity(id: String): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
        case None =>
          Errors.craftResponseResult(
            s"Entity $entityName not found",
            Results.NotFound,
            ctx.request,
            None,
            env
          )
        case Some(_) =>
          fromJson(ctx.request.body) match {
            case Left(e) =>
              logger.error(s"Bad $entityName format", new RuntimeException(e))
              Errors.craftResponseResult(
                s"Bad $entityName format",
                Results.BadRequest,
                ctx.request,
                None,
                env
              )
            case Right(newEntity) =>
              validate(newEntity)
                .map(entity =>
                  entityStore(ctx.tenant, env.dataStore)
                    .save(entity)
                    .map(_ => NoContent)
                )
                .leftMap(_.renderF())
                .merge
                .flatten
          }
      }
    }

  def patchEntity(id: String): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      object JsonPatchHelpers {
        import diffson.jsonpatch._
        import diffson.playJson.DiffsonProtocol._
        import diffson.lcs._
        import diffson.playJson._
        import diffson.jsonpatch.lcsdiff.remembering.JsonDiffDiff

        private def patchResponse(patchJson: JsonPatch[JsValue], document: JsValue): Either[AppError, JsValue] = {
          patchJson.apply(document) match {
            case JsSuccess(value, path) => Right(value)
            case JsError(errors) =>
              logger.error(s"error during patch entity : $errors")
              val formattedErrors = errors.toVector.flatMap {
                case (JsPath(nodes), es) =>
                  es.map(e => e.message)
              }
              Left(AppError.EntityConflict(formattedErrors.mkString(",")))
          }
        }

        def patchJson(patchOps: JsValue, document: JsValue): Either[AppError, JsValue] = {
          val patch = diffson.playJson.DiffsonProtocol.JsonPatchFormat.reads(patchOps).get
          patchResponse(patch, document)
        }

        def diffJson(sourceJson: JsValue,targetJson: JsValue): Either[AppError, JsValue] = {
          implicit val lcs = new Patience[JsValue]
          val diff = diffson.diff(sourceJson, targetJson)
          patchResponse(diff, targetJson)
        }

      }

      val fu: Future[Option[Of]] =
        if (
          ctx.request.queryString
            .get("notDeleted")
            .exists(_.contains("true"))
        ) {
          entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id)
        } else {
          entityStore(ctx.tenant, env.dataStore).findById(id)
        }

      def finalizePatch(patchedJson: JsValue): Future[Result] = {
        fromJson(patchedJson) match {
          case Left(e) =>
            logger.error(s"Bad $entityName format", new RuntimeException(e))
            Errors.craftResponseResult(
              s"Bad $entityName format",
              Results.BadRequest,
              ctx.request,
              None,
              env
            )
          case Right(patchedEntity) =>
            validate(patchedEntity)
              .map(entity =>
                entityStore(ctx.tenant, env.dataStore)
                  .save(entity)
                  .map(_ => NoContent)
              )
              .leftMap(_.renderF())
              .merge
              .flatten
        }
      }

      val value: Future[Result] = fu.flatMap {
        case None =>
          Errors.craftResponseResult(
            s"Entity $entityName not found",
            Results.NotFound,
            ctx.request,
            None,
            env
          )
        case Some(entity) =>
          val currentJson = toJson(entity)
          ctx.request.body match {
            case JsArray(_) =>
              val patchedJson = JsonPatchHelpers.patchJson(ctx.request.body, currentJson)
              patchedJson.fold(error => error.renderF(), json => finalizePatch(json))
            case JsObject(_) =>
              val newJson =
                currentJson
                  .as[JsObject]
                  .deepMerge(ctx.request.body.as[JsObject])
              fromJson(newJson) match {
                case Left(e) =>
                  logger.error(s"Bad $entityName format", new RuntimeException(e))
                  Errors.craftResponseResult(
                    s"Bad $entityName format",
                    Results.BadRequest,
                    ctx.request,
                    None,
                    env
                  )
                case Right(patchedEntity) =>
                  val patchedJson = JsonPatchHelpers.diffJson(newJson, toJson(patchedEntity))
                  patchedJson.fold(error => error.renderF(), json => finalizePatch(json))

              }

            case _ =>
              FastFuture.successful(
                BadRequest(
                  Json.obj("error" -> "[patch error] wrong patch format")
                )
              )
          }

      }
      value
    }

  def deleteEntity(id: String): Action[AnyContent] =
    DaikokuApiAction.async { ctx =>
      if (ctx.request.queryString.get("logically").exists(_.contains("true"))) {
        entityStore(ctx.tenant, env.dataStore)
          .deleteByIdLogically(id)
          .map(_ => Ok(Json.obj("done" -> true)))
      } else {
        entityStore(ctx.tenant, env.dataStore)
          .deleteById(id)
          .map(_ => Ok(Json.obj("done" -> true)))
      }
    }

}
