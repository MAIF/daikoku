package storage.graphql

import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.domain.{Tenant, User, UserId, UserWithPermission}
import play.api.Logger
import play.api.libs.json.JsValue
import sangria.execution.{BeforeFieldResult, FieldTag, Middleware, MiddlewareBeforeField, MiddlewareQueryContext}
import sangria.schema.Context
import storage.DataStore

import scala.concurrent.ExecutionContext

object GraphQLImplicits {

  implicit class DaikokuContextOps(
      ctx: (DataStore, DaikokuActionContext[JsValue])
  ) {
    def dataStore: DataStore = ctx._1

    def actionContext: DaikokuActionContext[JsValue] = ctx._2

    def user: User = actionContext.user

    def tenant: Tenant = actionContext.tenant

    def isTenantAdmin: Boolean = actionContext.isTenantAdmin || user.isDaikokuAdmin

    def isDaikokuAdmin: Boolean = user.isDaikokuAdmin

    def isGuest: Boolean = user.isGuest


    def requireTenantAdmin(): Unit = {
      if (!isTenantAdmin || !isDaikokuAdmin) {
        throw AuthorizationException("Tenant admin access required")
      }
    }

    def requireDaikokuAdmin(): Unit = {
      if (!isDaikokuAdmin) {
        throw AuthorizationException("Admin access required")
      }
    }


  }
}

case class AuthorizationException(message: String) extends Exception(message)

case object RequiresTenantAdmin extends FieldTag
case object RequiresDaikokuAdmin extends FieldTag

class DaikokuAuthMiddleware(implicit ec: ExecutionContext)
    extends Middleware[(DataStore, DaikokuActionContext[JsValue])]
    with MiddlewareBeforeField[(DataStore, DaikokuActionContext[JsValue])] {

  import GraphQLImplicits._

  lazy val logger: Logger = Logger("graphql-auth-middleware")

  type QueryVal = Unit
  type FieldVal = Unit
  type DaikokuContext = (DataStore, DaikokuActionContext[JsValue])

  def beforeQuery(
      context: MiddlewareQueryContext[DaikokuContext, _, _]
  ): QueryVal = ()
  def afterQuery(
      queryVal: QueryVal,
      context: MiddlewareQueryContext[DaikokuContext, _, _]
  ): Unit = ()

  def beforeField(
      queryVal: QueryVal,
      mctx: MiddlewareQueryContext[DaikokuContext, _, _],
      ctx: Context[DaikokuContext, _]
  ): BeforeFieldResult[DaikokuContext, Unit] = {

    val daikokuCtx = ctx.ctx
    try {
      ctx.field.tags.foreach {
        case RequiresTenantAdmin =>
          daikokuCtx.requireTenantAdmin()

        case RequiresDaikokuAdmin =>
          daikokuCtx.requireDaikokuAdmin()

        case _ =>
      }

      continue
    } catch {
      case e: AuthorizationException =>
        logger.warn(
          s"[${daikokuCtx.user.id}@${daikokuCtx.tenant.id}] Authorization failed on field '${ctx.field.name}': ${e.getMessage}"
        )
        throw e
    }
  }

//  def afterField(
//      queryVal: QueryVal,
//      fieldVal: FieldVal,
//      value: Any,
//      mctx: MiddlewareQueryContext[DaikokuContext, _, _],
//      ctx: Context[DaikokuContext, _]
//  ): Option[Any] = None
//
//  // Extraire l'ID utilisateur selon le type d'objet
//  private def extractUserIdFromValue(value: Any): UserId = {
//    value match {
//      case user: User                             => user.id
//      case userWithPermission: UserWithPermission => userWithPermission.userId
//      case _ =>
//        throw new RuntimeException(s"Cannot extract user ID from value: $value")
//    }
//  }
}
