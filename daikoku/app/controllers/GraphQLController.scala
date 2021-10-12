package fr.maif.otoroshi.daikoku.ctrls

import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.domain.SchemaDefinition.NotAuthorizedError
import fr.maif.otoroshi.daikoku.domain.{
  DatastoreId,
  SchemaDefinition,
  User,
  UserId,
  UserSession,
  UserSessionId
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.admin.DaikokuApiAction
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.I18nSupport
import play.api.libs.json.{JsObject, JsValue, Json}
import sangria.execution.{
  ExceptionHandler,
  Executor,
  HandledException,
  MaxQueryDepthReachedError,
  QueryReducer
}
import storage.DataStore
import play.api.mvc._
import reactivemongo.bson.BSONObjectID
import sangria.execution._
import sangria.parser.{QueryParser, SyntaxError}
import sangria.marshalling.playJson._
import sangria.renderer.SchemaRenderer

import java.util.concurrent.TimeUnit
import scala.concurrent.Future
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success}

class GraphQLController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuApiAction: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  lazy val (schema, resolver) = SchemaDefinition.getSchema(env)

  val logger = Logger("GraphQLController")

  def adminApiSearch() = DaikokuApiAction.async(parse.json) { ctx =>
    val query = (ctx.request.body \ "query").as[String]
    val variables = (ctx.request.body \ "variables").asOpt[String]
    val operation = (ctx.request.body \ "operation").asOpt[String]

    val user = User(
      id = UserId(BSONObjectID.generate().stringify),
      tenants = Set(ctx.tenant.id),
      origins = Set(ctx.tenant.authProvider),
      name = "generated-user",
      email = "generated-user@foo.bar",
      isDaikokuAdmin = true,
      password = Some("password"),
      lastTenant = Some(ctx.tenant.id),
      personalToken = Some(IdGenerator.token(32)),
      defaultLanguage = None
    )
    val generatedContext = DaikokuActionContext(
      ctx.request,
      user,
      tenant = ctx.tenant,
      session = UserSession(
        id = DatastoreId(BSONObjectID.generate().stringify),
        userId = user.id,
        userName = user.name,
        userEmail = user.email,
        impersonatorId = None,
        impersonatorName = None,
        impersonatorEmail = None,
        impersonatorSessionId = None,
        sessionId = UserSessionId(IdGenerator.token),
        created = DateTime.now(),
        expires = DateTime.now().plusSeconds(10),
        ttl = FiniteDuration(10, TimeUnit.SECONDS)
      ),
      None,
      isTenantAdmin = true,
      apiCreationPermitted = true
    )

    executeQuery(generatedContext,
                 query,
                 variables map parseVariables,
                 operation)
  }

  def adminApiSchema = DaikokuApiAction {
    Ok(SchemaRenderer.renderSchema(schema))
  }

  def search() = DaikokuActionMaybeWithGuest.async(parse.json) { ctx =>
    val query = (ctx.request.body \ "query").as[String]
    val variables = (ctx.request.body \ "variables").asOpt[String]
    val operation = (ctx.request.body \ "operation").asOpt[String]
    executeQuery(ctx, query, variables map parseVariables, operation)
  }

  def renderSchema = DaikokuAction {
    Ok(SchemaRenderer.renderSchema(schema))
  }

  private def parseVariables(variables: String) =
    if (variables.trim == "" || variables.trim == "null") Json.obj()
    else Json.parse(variables).as[JsObject]

  case object TooComplexQueryError extends Exception("Query is too expensive.")

  lazy val exceptionHandler = ExceptionHandler {
    case (_, error @ NotAuthorizedError(_)) =>
      HandledException(error.getMessage)
    case (_, error @ TooComplexQueryError) => HandledException(error.getMessage)
    case (_, error @ MaxQueryDepthReachedError(_)) =>
      HandledException(error.getMessage)
  }

  private def executeQuery(ctx: DaikokuActionContext[JsValue],
                           query: String,
                           variables: Option[JsObject],
                           operation: Option[String]) =
    QueryParser.parse(query) match {
      case Success(queryAst) =>
        Executor
          .execute(
            schema,
            queryAst,
            (env.dataStore, ctx),
            operationName = operation,
            variables = variables getOrElse Json.obj(),
            deferredResolver = resolver,
            exceptionHandler = exceptionHandler,
            queryReducers = List(
              QueryReducer
                .rejectMaxDepth[(DataStore, DaikokuActionContext[JsValue])](15),
              QueryReducer.rejectComplexQueries[
                (DataStore, DaikokuActionContext[JsValue])](
                4000,
                (_, _) => TooComplexQueryError)
            )
          )
          .map(Ok(_))
          .recover {
            case error: QueryAnalysisError => BadRequest(error.resolveError)
            case error: ErrorWithResolver =>
              InternalServerError(error.resolveError)
          }

      // can't parse GraphQL query, return error
      case Failure(error: SyntaxError) =>
        Future.successful(
          BadRequest(
            Json.obj(
              "syntaxError" -> error.getMessage,
              "locations" -> Json.arr(
                Json.obj("line" -> error.originalError.position.line,
                         "column" -> error.originalError.position.column))
            )))

      case Failure(error) =>
        throw error
    }
}
