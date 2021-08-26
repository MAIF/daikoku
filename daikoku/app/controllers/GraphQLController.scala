package fr.maif.otoroshi.daikoku.ctrls

import domain.SchemaDefinition
import domain.SchemaDefinition.NotAuthorizedError
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionContext}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.Logger
import play.api.i18n.I18nSupport
import play.api.libs.json.{JsObject, JsValue, Json}
import sangria.execution.{ExceptionHandler, Executor, HandledException, MaxQueryDepthReachedError, QueryReducer}
import storage.{DataStore, Repo, UserRepo}
import play.api.mvc._
import sangria.execution._
import sangria.parser.{QueryParser, SyntaxError}
import sangria.marshalling.playJson._
import sangria.renderer.SchemaRenderer
import sangria.schema.Context

import scala.concurrent.Future
import scala.util.{Failure, Success}

object AuthMiddleware extends Middleware[(DataStore,DaikokuActionContext[JsValue])] with MiddlewareBeforeField[(DataStore,DaikokuActionContext[JsValue])] {
  override type QueryVal = Unit
  override type FieldVal = Unit

  override def beforeQuery(context: MiddlewareQueryContext[(DataStore,DaikokuActionContext[JsValue]), _, _]) = ()

  override def afterQuery(queryVal: QueryVal, context: MiddlewareQueryContext[(DataStore,DaikokuActionContext[JsValue]), _, _]) = ()

  override def beforeField(queryVal: QueryVal,
                           mctx: MiddlewareQueryContext[(DataStore,DaikokuActionContext[JsValue]), _, _],
                           ctx: Context[(DataStore,DaikokuActionContext[JsValue]), _]) = {

    /*ctx.field.tags match {
      case tags if (tags contains SchemaDefinition.UberPublicUserAccessTag) &&
    }*/

   /* if(requireAuth) {
      println(ctx.field.tags)
      throw NotAuthorizedError("coucou")
    }*/

    continue
  }
}

class GraphQLController(DaikokuAction: DaikokuAction,
                        env: Env,
                        cc: ControllerComponents)
  extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  lazy val schema = SchemaDefinition.getSchema(env)

  val logger = Logger("GraphQLController")

  def search() = DaikokuAction.async(parse.json) { ctx =>
  // query: String, variables: Option[String], operation: Option[String]
    val query = (ctx.request.body \ "query").as[String]
    val variables = (ctx.request.body \ "variables").asOpt[String]
    val operation = (ctx.request.body \ "operation").asOpt[String]
    executeQuery(ctx, query, variables map parseVariables, operation)
  }

  def renderSchema = DaikokuAction {
    Ok(SchemaRenderer.renderSchema(schema))
  }

  private def parseVariables(variables: String) =
    if (variables.trim == "" || variables.trim == "null") Json.obj() else Json.parse(variables).as[JsObject]

  case object TooComplexQueryError extends Exception("Query is too expensive.")

  lazy val exceptionHandler = ExceptionHandler {
    case (_, error @ NotAuthorizedError(_)) => HandledException(error.getMessage)
    case (_, error @ TooComplexQueryError) => HandledException(error.getMessage)
    case (_, error @ MaxQueryDepthReachedError(_)) => HandledException(error.getMessage)
  }

  private def executeQuery(ctx: DaikokuActionContext[JsValue], query: String, variables: Option[JsObject], operation: Option[String]) =
    QueryParser.parse(query) match {
      case Success(queryAst) =>
        Executor.execute(schema, queryAst, (env.dataStore, ctx),
          operationName = operation,
          variables = variables getOrElse Json.obj(),
          exceptionHandler = exceptionHandler,
          middleware = AuthMiddleware :: Nil,
          queryReducers = List(
            QueryReducer.rejectMaxDepth[(DataStore,DaikokuActionContext[JsValue])](15),
            QueryReducer.rejectComplexQueries[(DataStore,DaikokuActionContext[JsValue])](4000, (_, _) => TooComplexQueryError)))
          .map(Ok(_))
          .recover {
            case error: QueryAnalysisError => BadRequest(error.resolveError)
            case error: ErrorWithResolver => InternalServerError(error.resolveError)
          }

      // can't parse GraphQL query, return error
      case Failure(error: SyntaxError) =>
        Future.successful(BadRequest(Json.obj(
          "syntaxError" -> error.getMessage,
          "locations" -> Json.arr(Json.obj(
            "line" -> error.originalError.position.line,
            "column" -> error.originalError.position.column)))))

      case Failure(error) =>
        throw error
    }
}



