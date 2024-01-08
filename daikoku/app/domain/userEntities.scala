package fr.maif.otoroshi.daikoku.domain

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import org.joda.time.DateTime
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}

object User {
  val DEFAULT_IMAGE = "/assets/images/anonymous.jpg"
}

case class User(
    id: UserId,
    deleted: Boolean = false,
    tenants: Set[TenantId],
    origins: Set[AuthProvider],
    name: String,
    email: String,
    picture: String = User.DEFAULT_IMAGE,
    pictureFromProvider: Boolean = true,
    personalToken: Option[String],
    isDaikokuAdmin: Boolean = false,
    password: Option[String] = None,
    hardwareKeyRegistrations: Seq[JsObject] = Seq.empty,
    lastTenant: Option[TenantId],
    metadata: Map[String, String] = Map.empty,
    defaultLanguage: Option[String],
    isGuest: Boolean = false,
    starredApis: Set[ApiId] = Set.empty[ApiId],
    twoFactorAuthentication: Option[TwoFactorAuthentication] = None,
    invitation: Option[UserInvitation] = None
) extends CanJson[User] {
  override def asJson: JsValue = json.UserFormat.writes(this)
  def humanReadableId = email.urlPathSegmentSanitized
  def asSimpleJson: JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> email.urlPathSegmentSanitized,
      "name" -> name,
      "email" -> email,
      "picture" -> picture,
      "isDaikokuAdmin" -> isDaikokuAdmin,
      "starredApis" -> starredApis.map(_.value),
      "twoFactorAuthentication" -> twoFactorAuthentication
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def toUiPayload(): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> email.urlPathSegmentSanitized,
      "name" -> name,
      "email" -> email,
      "picture" -> picture,
      "isDaikokuAdmin" -> isDaikokuAdmin,
      "defaultLanguage" -> defaultLanguage
        .fold(JsNull.as[JsValue])(JsString.apply),
      "isGuest" -> isGuest,
      "starredApis" -> starredApis.map(_.value),
      "twoFactorAuthentication" -> twoFactorAuthentication
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def asNotificationSender: NotificationSender = {
    NotificationSender(this.name, this.email, this.id.some)
  }
}

object GuestUser {
  def apply(tenantId: TenantId): User =
    User(
      id = UserId("anonymous"),
      tenants = Set(tenantId),
      origins = Set.empty,
      name = "anonymous",
      email = "",
      lastTenant = None,
      defaultLanguage = None,
      personalToken = None,
      isGuest = true
    )
}

object GuestUserSession {
  def apply(user: User, tenant: Tenant): UserSession = {
    val sessionMaxAge =
      tenant.authProviderSettings.\("sessionMaxAge").asOpt[Int].getOrElse(86400)
    UserSession(
      id = DatastoreId(IdGenerator.token(32)),
      userId = user.id,
      userName = user.name,
      userEmail = user.email,
      impersonatorId = None,
      impersonatorName = None,
      impersonatorEmail = None,
      impersonatorSessionId = None,
      sessionId = UserSessionId(IdGenerator.token),
      created = DateTime.now(),
      expires = DateTime.now().plusSeconds(sessionMaxAge),
      ttl = FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
    )
  }
}

case class UserSession(
    id: DatastoreId,
    sessionId: UserSessionId,
    userId: UserId,
    userName: String,
    userEmail: String,
    impersonatorId: Option[UserId],
    impersonatorName: Option[String],
    impersonatorEmail: Option[String],
    impersonatorSessionId: Option[UserSessionId],
    created: DateTime,
    ttl: FiniteDuration,
    expires: DateTime
) extends CanJson[UserSession] {
  override def asJson: JsValue = json.UserSessionFormat.writes(this)
  def invalidate()(implicit ec: ExecutionContext, env: Env): Future[Unit] = {
    env.dataStore.userSessionRepo.deleteById(id).map(_ => ())
  }
  def asSimpleJson: JsValue =
    Json.obj(
      "created" -> created.toDate.getTime,
      "expires" -> expires.toDate.getTime,
      "ttl" -> ttl.toMillis
    )
  def impersonatorJson(): JsValue = {
    impersonatorId.map { _ =>
      Json.obj(
        "_id" -> impersonatorId.get.value,
        "name" -> impersonatorName.get,
        "email" -> impersonatorEmail.get
      )
    } getOrElse {
      JsNull
    }
  }
}

case class TwoFactorAuthentication(
    enabled: Boolean = false,
    secret: String,
    token: String,
    backupCodes: String
) extends CanJson[TwoFactorAuthentication] {
  override def asJson: JsValue = json.TwoFactorAuthenticationFormat.writes(this)
}

case class UserInvitation(
    registered: Boolean,
    token: String,
    createdAt: DateTime,
    team: String,
    notificationId: String
) extends CanJson[UserInvitation] {
  override def asJson: JsValue = json.UserInvitationFormat.writes(this)
}

case class PasswordReset(
    id: DatastoreId,
    deleted: Boolean = false,
    randomId: String,
    email: String,
    password: String,
    user: UserId,
    creationDate: DateTime,
    validUntil: DateTime
) extends CanJson[PasswordReset] {
  override def asJson: JsValue = json.PasswordResetFormat.writes(this)
}

case class AccountCreation(
    id: DatastoreId,
    deleted: Boolean = false,
    randomId: String,
    email: String,
    name: String,
    avatar: String,
    password: String,
    creationDate: DateTime,
    validUntil: DateTime
) extends CanJson[AccountCreation] {
  override def asJson: JsValue = json.AccountCreationFormat.writes(this)
}

sealed trait MessageType {
  def value: ValueType
}
object MessageType {
  case class Tenant(value: TenantId) extends MessageType
}

case class Message(
    id: DatastoreId,
    tenant: TenantId,
    messageType: MessageType,
    participants: Set[UserId],
    readBy: Set[UserId],
    chat: UserId,
    date: DateTime,
    sender: UserId,
    message: String,
    closed: Option[DateTime] = None,
    send: Boolean = false
) extends CanJson[Message] {
  override def asJson: JsValue = json.MessageFormat.writes(this)
}
