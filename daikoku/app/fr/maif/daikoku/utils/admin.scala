package fr.maif.daikoku.utils

import cats.data.EitherT
import com.auth0.jwt.JWT
import com.google.common.base.Charsets
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.{TeamType, Tenant, User, ValueType}
import fr.maif.daikoku.env.{Env, LocalAdminApiConfig, OtoroshiAdminApiConfig}
import fr.maif.daikoku.login.TenantHelper
import fr.maif.daikoku.utils.Errors
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.Logger
import play.api.http.HttpEntity
import play.api.libs.json.*
import play.api.mvc.*
import fr.maif.daikoku.storage.{DataStore, Repo}
import fr.maif.daikoku.storage.drivers.postgres.{Col, PostgresDataStore}

import java.nio.charset.StandardCharsets
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

case class DaikokuApiActionContext[A](
    request: Request[A],
    tenant: Tenant,
    clientId: Option[String] = None
)

class DaikokuApiAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuApiActionContext, AnyContent]
    with ActionFunction[Request, DaikokuApiActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext

  def decodeBase64(encoded: String): String =
    new String(Base64.getUrlDecoder.decode(encoded), StandardCharsets.UTF_8)
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
                  block(
                    DaikokuApiActionContext[A](
                      request,
                      tenant,
                      Option(decoded.getClaim("apikey").asString())
                    )
                  )
                case _ =>
                  Errors.craftResponseResultF(
                    "No api key provided",
                    Results.Unauthorized
                  )
              }
            case _ =>
              Errors.craftResponseResultF(
                "No api key provided",
                Results.Unauthorized
              )
          }
        case LocalAdminApiConfig(_) =>
          request.headers.get("Authorization") match {
            case Some(auth) if auth.startsWith("Basic ") =>
              extractUsernamePassword(auth) match {
                case None =>
                  Errors.craftResponseResultF(
                    "No api key provided",
                    Results.Unauthorized
                  )
                case Some((clientId, clientSecret)) =>
                  // the otoroshi api key now lives on the Keyring entity, not on
                  // the subscription (see the keyring migration)
                  env.dataStore.keyringRepo
                    .findByApiKey(tenant.id, clientId, clientSecret)
                    .map(_.length == 1)
                    .flatMap({
                      case done if done =>
                        block(
                          DaikokuApiActionContext[A](
                            request,
                            tenant,
                            Some(clientId)
                          )
                        )
                      case _ =>
                        Errors.craftResponseResultF(
                          "No api key provided",
                          Results.Unauthorized
                        )
                    })
              }
            case _ =>
              Errors.craftResponseResultF(
                "No api key provided",
                Results.Unauthorized
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
                Errors.craftResponseResultF(
                  "No api key provided",
                  Results.Unauthorized
                )
            }
          case _ =>
            Errors.craftResponseResultF(
              "No api key provided",
              Results.Unauthorized
            )
        }
      case LocalAdminApiConfig(keyValue) =>
        request
          .getQueryString("key")
          .orElse(request.headers.get("X-Api-Key")) match {
          case Some(key) if key == keyValue => block(request)
          case _ =>
            Errors.craftResponseResultF(
              "No api key provided",
              Results.Unauthorized
            )
        }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

sealed trait UpdateOrCreate {
  def name: String
}

object UpdateOrCreate {
  case object Update extends UpdateOrCreate {
    def name: String = "Update"
  }
  case object Create extends UpdateOrCreate {
    def name: String = "Create"
  }
}

trait ReadEntitiesFrom {
  def exists(kind: String, id: String)(
      inDb: => Future[Option[?]]
  ): Future[Boolean]
}

object ReadEntitiesFrom {
  val inDatabase: ReadEntitiesFrom = new ReadEntitiesFrom {
    def exists(kind: String, id: String)(
        inDb: => Future[Option[?]]
    ): Future[Boolean] =
      inDb.map(_.isDefined)(using ExecutionContext.parasitic)
  }
}

// e.g. Map("usage-plan" -> Set("plan-free"), "api" -> Set("api-x", "api-legacy"))
case class ReconcileFinalIds(byKind: Map[String, Set[String]])
    extends ReadEntitiesFrom {
  def exists(kind: String, id: String)(
      inDb: => Future[Option[?]]
  ): Future[Boolean] =
    Future.successful(byKind.getOrElse(kind, Set.empty).contains(id))
}

case class PreparedWrite(
    id: String,
    action: String,
    write: () => EitherT[Future, AppError, Unit]
)

// entityId -> created_by, e.g. Map("plan-free" -> Some("remote_catalog=cat-git"), "plan-manual" -> None)
type ExistingEntities = Map[String, Option[String]]
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
  def validate(
      entity: Of,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Of]

  def validateForReconcile(
      entity: Of,
      updateOrCreate: UpdateOrCreate,
      finalIds: ReconcileFinalIds
  ): EitherT[Future, AppError, Of] =
    validate(entity, updateOrCreate)

  protected def checkReference(
      readFrom: ReadEntitiesFrom,
      kind: String,
      id: String,
      error: AppError
  )(inDb: => Future[Option[?]]): EitherT[Future, AppError, Unit] =
    EitherT(
      readFrom
        .exists(kind, id)(inDb)
        .map(found => Either.cond(found, (), error))
    )

  def getId(entity: Of): Id

  def doCreate(tenant: Tenant, entity: Of): EitherT[Future, AppError, Of] =
    EitherT.liftF[Future, AppError, Of](
      entityStore(tenant, env.dataStore)
        .save(entity)
        .map(_ => entity)
    )

  def doUpdate(
      tenant: Tenant,
      oldEntity: Of,
      newEntity: Of
  ): EitherT[Future, AppError, Of] =
    EitherT.liftF[Future, AppError, Of](
      entityStore(tenant, env.dataStore)
        .save(newEntity)
        .map(_ => newEntity)
    )

  def doDelete(
      tenant: Tenant,
      entity: Of
  ): EitherT[Future, AppError, Unit] =
    EitherT.liftF[Future, AppError, Unit] {
      entityStore(tenant, env.dataStore)
        .deleteById(getId(entity).value)
        .map(_ => ())
    }

  protected def auditAdminApiWrite(
      ctx: DaikokuApiActionContext[?],
      action: String,
      id: String
  ): Unit =
    AuditTrailEvent(
      s"Admin API ($action $entityName $id) by keyring ${ctx.clientId.getOrElse("unknown")}"
    ).logAdminApiAuditEvent(
      ctx.tenant,
      User.system,
      ctx.request,
      Json.obj(
        "adminApi" -> Json.obj(
          "action" -> action,
          "entity" -> entityName,
          "entityId" -> id,
          "clientId" -> ctx.clientId
        )
      )
    )(using env)

  def readMetadata(e: Of): Map[String, String] = Map.empty

  def mergeWithExisting(existing: Of, incoming: Of): Of = incoming

  def prepareWrites(
      tenant: Tenant,
      raws: Seq[JsValue],
      metadataKey: String,
      finalIds: ReconcileFinalIds
  ): Future[Seq[Either[String, PreparedWrite]]] = {
    val parsed = raws.map(fromJson)
    val parsedIds = parsed.collect { case Right(entity) => getId(entity) }

    readByIds(tenant, parsedIds).flatMap { existingById =>
      Future.sequence(parsed.map {
        case Left(error) => Future.successful(Left(error))
        case Right(entity) =>
          val existing = existingById.get(getId(entity).value)

          prepareWrite(tenant, entity, existing, metadataKey, finalIds)
      })
    }
  }

  // e.g. team-a absent from DB -> PreparedWrite("team-a", "created", () => doCreate(...))
  //      team-a in DB, identical -> PreparedWrite("team-a", "unchanged", no-op)
  //      team-a in DB, created by hand -> Left("team-a already exists and is not managed by this catalog")
  private def prepareWrite(
      tenant: Tenant,
      entity: Of,
      existing: Option[Of],
      metadataKey: String,
      finalIds: ReconcileFinalIds
  ): Future[Either[String, PreparedWrite]] = {
    val id = getId(entity).value
    val ownedByAnotherSource = existing.exists(old =>
      !readMetadata(old).get("created_by").contains(metadataKey)
    )
    val mode =
      if (existing.isDefined) UpdateOrCreate.Update else UpdateOrCreate.Create

    if (ownedByAnotherSource) {
      Future.successful(
        Left(s"$id already exists and is not managed by this catalog")
      )
    } else {
      validateForReconcile(entity, mode, finalIds).value.map {
        case Left(error) => Left(error.getErrorMessage())
        case Right(validated) =>
          existing match {
            case None =>
              Right(
                PreparedWrite(
                  id,
                  "created",
                  () => doCreate(tenant, validated).map(_ => ())
                )
              )
            case Some(old) =>
              val merged = mergeWithExisting(old, validated)

              if (toJson(old) == toJson(merged)) {
                Right(
                  PreparedWrite(
                    id,
                    "unchanged",
                    () => EitherT.pure[Future, AppError](())
                  )
                )
              } else {
                Right(
                  PreparedWrite(
                    id,
                    "updated",
                    () => doUpdate(tenant, old, merged).map(_ => ())
                  )
                )
              }
          }
      }
    }
  }

  def doDeleteById(tenant: Tenant, id: String): Future[Either[String, String]] =
    entityStore(tenant, env.dataStore).findById(id).flatMap {
      case None => Future.successful(Right("already-deleted"))
      case Some(entity) =>
        doDelete(tenant, entity).value.map {
          case Left(error) => Left(error.getErrorMessage())
          case Right(_)    => Right("deleted")
        }
    }

  private def readByIds(
      tenant: Tenant,
      ids: Seq[Id]
  ): Future[Map[String, Of]] =
    entityStore(tenant, env.dataStore)
      .findByIds(ids)
      .map(_.map(entity => getId(entity).value -> entity).toMap)

  // reads the id and the ownership mark only, never the whole entity
  def readExistingEntities(tenant: Tenant): Future[ExistingEntities] = {
    val table = entityStore(tenant, env.dataStore).tableName

    env.dataStore
      .asInstanceOf[PostgresDataStore]
      .queryRawMapped(
        "SELECT _id, content->'metadata'->>'created_by' AS created_by " +
          s"FROM $table WHERE content->>'_tenant' = $$1",
        Seq(Col.str("_id"), Col.str("created_by")),
        Seq(tenant.id.value)
      )
      .map(_.map { row =>
        (row \ "_id").as[String] -> (row \ "created_by").asOpt[String]
      }.toMap)
  }

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
      entityStore(ctx.tenant, env.dataStore)
        .findAll()
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
      entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
        case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
        case None =>
          Errors.craftResponseResultF(
            s"$entityName not found",
            Results.NotFound
          )
      }
    }

  def createEntity(): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      fromJson(ctx.request.body) match {
        case Left(e) =>
          logger.error(s"Bad $entityName format", new RuntimeException(e))
          Errors.craftResponseResultF(
            s"Bad $entityName format",
            Results.BadRequest
          )
        case Right(newEntity) =>
          entityStore(ctx.tenant, env.dataStore)
            .findById(getId(newEntity).value)
            .flatMap {
              case Some(_) =>
                AppError
                  .EntityConflict("entity with same id already exists")
                  .renderF()
              case None =>
                validate(newEntity, UpdateOrCreate.Create)
                  .flatMap(entity => doCreate(ctx.tenant, entity))
                  .map { entity =>
                    auditAdminApiWrite(ctx, "create", getId(entity).value)
                    Created(toJson(entity))
                  }
                  .leftMap(_.render())
                  .merge
            }

      }
    }

  def updateEntity(id: String): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
        case None =>
          Errors.craftResponseResultF(
            s"Entity $entityName not found",
            Results.NotFound
          )
        case Some(oldEntity) =>
          fromJson(ctx.request.body) match {
            case Left(e) =>
              logger.error(s"Bad $entityName format", new RuntimeException(e))
              Errors.craftResponseResultF(
                s"Bad $entityName format",
                Results.BadRequest
              )
            case Right(newEntity) =>
              validate(newEntity, UpdateOrCreate.Update)
                .flatMap(entity => doUpdate(ctx.tenant, oldEntity, entity))
                .map { _ =>
                  auditAdminApiWrite(ctx, "update", id)
                  NoContent
                }
                .leftMap(_.render())
                .merge
          }
      }
    }

  def patchEntity(id: String): Action[JsValue] =
    DaikokuApiAction.async(parse.json) { ctx =>
      object JsonPatchHelpers {
        import diffson.jsonpatch._
        import diffson.jsonpatch.lcsdiff.remembering.JsonDiffDiff
        import diffson.lcs._
        import diffson.playJson.DiffsonProtocol._
        import diffson.playJson._

        private def patchResponse(
            patchJson: JsonPatch[JsValue],
            document: JsValue
        ): Either[AppError, JsValue] = {
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

        def patchJson(
            patchOps: JsValue,
            document: JsValue
        ): Either[AppError, JsValue] = {
          val patch =
            diffson.playJson.DiffsonProtocol.JsonPatchFormat.reads(patchOps).get
          patchResponse(patch, document)
        }

        def diffJson(
            sourceJson: JsValue,
            targetJson: JsValue
        ): Either[AppError, JsValue] = {
          implicit val lcs: Patience[JsValue] = new Patience[JsValue]
          val diff = diffson.diff(sourceJson, targetJson)
          patchResponse(diff, targetJson)
        }

      }

      val fu: Future[Option[Of]] =
        entityStore(ctx.tenant, env.dataStore).findById(id)

      def finalizePatch(
          oldEntity: Of,
          patchedJson: JsValue
      ): Future[Result] = {
        fromJson(patchedJson) match {
          case Left(e) =>
            logger.error(s"Bad $entityName format", new RuntimeException(e))
            Errors.craftResponseResultF(
              s"Bad $entityName format",
              Results.BadRequest
            )
          case Right(patchedEntity) =>
            validate(patchedEntity, UpdateOrCreate.Update)
              .flatMap(entity => doUpdate(ctx.tenant, oldEntity, entity))
              .map { _ =>
                auditAdminApiWrite(ctx, "patch", id)
                NoContent
              }
              .leftMap(_.render())
              .merge
        }
      }

      val value: Future[Result] = fu.flatMap {
        case None =>
          Errors.craftResponseResultF(
            s"Entity $entityName not found",
            Results.NotFound
          )
        case Some(entity) =>
          val currentJson = toJson(entity)
          ctx.request.body match {
            case JsArray(_) =>
              val patchedJson =
                JsonPatchHelpers.patchJson(ctx.request.body, currentJson)
              patchedJson.fold(
                error => error.renderF(),
                json => finalizePatch(entity, json)
              )
            case JsObject(_) =>
              val newJson =
                currentJson
                  .as[JsObject]
                  .deepMerge(ctx.request.body.as[JsObject])
              fromJson(newJson) match {
                case Left(e) =>
                  logger.error(
                    s"Bad $entityName format",
                    new RuntimeException(e)
                  )
                  Errors.craftResponseResultF(
                    s"Bad $entityName format",
                    Results.BadRequest
                  )
                case Right(patchedEntity) =>
                  val patchedJson =
                    JsonPatchHelpers.diffJson(newJson, toJson(patchedEntity))
                  patchedJson.fold(
                    error => error.renderF(),
                    json => finalizePatch(entity, json)
                  )

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
      val logically =
        ctx.request.queryString.get("logically").exists(_.contains("true"))
      entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
        case None =>
          Errors.craftResponseResultF(
            s"$entityName not found",
            Results.NotFound
          )
        case Some(entity) =>
          doDelete(ctx.tenant, entity)
            .map { _ =>
              auditAdminApiWrite(ctx, "delete", id)
              Ok(Json.obj("done" -> true))
            }
            .leftMap(_.render())
            .merge
      }
    }

}
