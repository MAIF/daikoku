package fr.maif.daikoku.controllers

import ch.qos.logback.classic.{Level, LoggerContext}
import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async.DaikokuAdminOnly
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.future.EnhancedObject
import org.slf4j.LoggerFactory
import play.api.libs.json.{JsArray, Json}
import play.api.mvc._

import scala.concurrent.ExecutionContext
import scala.jdk.CollectionConverters._

class LoggersController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  private def loggerContext: LoggerContext =
    LoggerFactory.getILoggerFactory.asInstanceOf[LoggerContext]

  private def levelStr(logger: ch.qos.logback.classic.Logger): String =
    Option(logger.getLevel).map(_.levelStr).getOrElse(Level.OFF.levelStr)

  def getAllLoggers() =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent("@{user.name} has accessed all loggers")
      )(ctx) {
        val loggers = JsArray(
          loggerContext.getLoggerList.asScala.toSeq.map { logger =>
            Json.obj("name" -> logger.getName, "level" -> levelStr(logger))
          }
        )
        Ok(loggers).future
      }
    }

  def getLogLevel(name: String) =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has accessed log level of $name")
      )(ctx) {
        val logger = loggerContext.getLogger(name)
        Ok(Json.obj("name" -> name, "level" -> levelStr(logger))).future
      }
    }

  def changeLogLevel(name: String, newLevel: Option[String]) =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has changed log level of $name")
      )(ctx) {
        val logger = loggerContext.getLogger(name)
        val oldLevel = levelStr(logger)
        logger.setLevel(newLevel.map(Level.valueOf).getOrElse(Level.ERROR))
        Ok(
          Json.obj(
            "name" -> name,
            "oldLevel" -> oldLevel,
            "newLevel" -> levelStr(logger)
          )
        ).future
      }
    }
}
