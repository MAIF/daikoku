package fr.maif.daikoku.login

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.{Tenant, User}
import fr.maif.daikoku.env.Env
import org.mindrot.jbcrypt.BCrypt
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

object LocalLoginConfig {

  lazy val logger = Logger("ldap-config")

  def fromJsons(value: JsValue): LocalLoginConfig =
    try {
      _fmt.reads(value).get
    } catch {
      case e: Throwable => {
        logger.error(s"Try to deserialize ${Json.prettyPrint(value)}", e)
        throw e
      }
    }

  val _fmt = new Format[LocalLoginConfig] {

    override def reads(json: JsValue): JsResult[LocalLoginConfig] =
      fromJson(json) match {
        case Left(e)  => JsError(e.getMessage)
        case Right(v) => JsSuccess(v.asInstanceOf[LocalLoginConfig])
      }

    override def writes(o: LocalLoginConfig): JsValue = o.asJson
  }

  def fromJson(json: JsValue): Either[Throwable, LocalLoginConfig] =
    Try {
      Right(
        LocalLoginConfig(
          sessionMaxAge = (json \ "sessionMaxAge").asOpt[Int].getOrElse(86400)
        )
      )
    } recover { case e =>
      Left(e)
    } get
}

case class LocalLoginConfig(sessionMaxAge: Int = 86400) {
  def asJson =
    Json.obj(
      "sessionMaxAge" -> this.sessionMaxAge
    )
}

object LocalLoginSupport {
  def bindUser(username: String, password: String, tenant: Tenant, _env: Env)(
      implicit ec: ExecutionContext
  ): Future[Option[User]] = {
    _env.dataStore.userRepo
      .findOne(
        Json.obj(
          "_deleted" -> false,
          "email" -> username.trim
        )
      )
      .map {
        case Some(user)
            if user.password.isDefined && BCrypt.checkpw(
              password,
              user.password.get
            ) =>
          Some(user)
        case _ => None
      }
  }

  def checkConnection()(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Unit] = {
    EitherT.pure[Future, AppError](())
  }
}
