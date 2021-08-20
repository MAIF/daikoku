package fr.maif.otoroshi.daikoku.ctrls

import domain.SchemaDefinition
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.env.Env
import play.api.Logger
import play.api.i18n.I18nSupport
import play.api.libs.json.{JsObject, Json}
import sangria.execution.{ExceptionHandler, Executor, HandledException, MaxQueryDepthReachedError, QueryReducer}
import storage.UserRepo

import play.api.mvc._
import sangria.execution._
import sangria.parser.{QueryParser, SyntaxError}
import sangria.marshalling.playJson._
import sangria.renderer.SchemaRenderer

import scala.concurrent.Future
import scala.util.{Failure, Success}


class GraphQLController(DaikokuAction: DaikokuAction,
                        env: Env,
                        cc: ControllerComponents)
  extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  lazy val schema = SchemaDefinition.getSchema(env)

  val logger = Logger("GraphQLController")

  def search(query: String, variables: Option[String], operation: Option[String]) = DaikokuAction.async { ctx =>
    executeQuery(query, variables map parseVariables, operation)
  }

  def renderSchema = DaikokuAction {
    Ok(SchemaRenderer.renderSchema(schema))
  }

  private def parseVariables(variables: String) =
    if (variables.trim == "" || variables.trim == "null") Json.obj() else Json.parse(variables).as[JsObject]

  case object TooComplexQueryError extends Exception("Query is too expensive.")

  lazy val exceptionHandler = ExceptionHandler {
    case (_, error @ TooComplexQueryError) => HandledException(error.getMessage)
    case (_, error @ MaxQueryDepthReachedError(_)) => HandledException(error.getMessage)
  }

  private def executeQuery(query: String, variables: Option[JsObject], operation: Option[String]) =
    QueryParser.parse(query) match {
      case Success(queryAst) =>
        Executor.execute(schema, queryAst, env.dataStore.userRepo,
          operationName = operation,
          variables = variables getOrElse Json.obj(),
          exceptionHandler = exceptionHandler,
          queryReducers = List(
            QueryReducer.rejectMaxDepth[UserRepo](15),
            QueryReducer.rejectComplexQueries[UserRepo](4000, (_, _) => TooComplexQueryError)))
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



