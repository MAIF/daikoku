package fr.maif.otoroshi.daikoku.domain

import cats.syntax.option._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import org.joda.time.DateTime
import play.api.libs.json._

object Team {
  val Default: TeamId = TeamId("none")
}

sealed trait TeamType {
  def name: String
}

object TeamType {
  case object Personal extends TeamType {
    def name: String = "Personal"
  }
  case object Organization extends TeamType {
    def name: String = "Organization"
  }
  case object Admin extends TeamType {
    def name: String = "Admin"
  }
  val values: Seq[TeamType] =
    Seq(Personal, Organization, Admin)
  def apply(name: String): Option[TeamType] = name match {
    case "Organization" => Organization.some
    case "Personal"     => Personal.some
    case "Admin"        => Admin.some
    case _              => None
  }
}

sealed trait TeamPermission {
  def name: String
}

object TeamPermission {
  case object Administrator extends TeamPermission {
    def name: String = "Administrator"
  }
  case object ApiEditor extends TeamPermission {
    def name: String = "ApiEditor"
  }
  case object TeamUser extends TeamPermission {
    def name: String = "User"
  }
  val values: Seq[TeamPermission] =
    Seq(Administrator, ApiEditor, TeamUser)
  def apply(name: String): Option[TeamPermission] = name match {
    case "Administrator" => Administrator.some
    case "ApiEditor"     => ApiEditor.some
    case "User"          => TeamUser.some
    case _               => None
  }
}

case class UserWithPermission(
    userId: UserId,
    teamPermission: TeamPermission
) extends CanJson[UserWithPermission] {
  override def asJson: JsValue = json.UserWithPermissionFormat.writes(this)
}

sealed trait TeamApiKeyVisibility extends CanJson[TeamApiKeyVisibility] {
  def name: String
  def asJson: JsValue = JsString(name)
}

object TeamApiKeyVisibility {
  case object Administrator extends TeamApiKeyVisibility {
    def name: String = "Administrator"
  }
  case object ApiEditor extends TeamApiKeyVisibility {
    def name: String = "ApiEditor"
  }
  case object User extends TeamApiKeyVisibility {
    def name: String = "User"
  }
  val values: Seq[TeamApiKeyVisibility] =
    Seq(Administrator, ApiEditor, User)
  def apply(name: String): Option[TeamApiKeyVisibility] =
    name.toLowerCase() match {
      case "administrator" => Administrator.some
      case "apieditor"     => ApiEditor.some
      case "user"          => User.some
      case _               => None
    }
}

case class Team(
    id: TeamId,
    tenant: TenantId,
    deleted: Boolean = false,
    `type`: TeamType,
    name: String,
    description: String,
    contact: String = "contact@foo.bar",
    avatar: Option[String] = Some("/assets/images/daikoku.svg"),
    users: Set[UserWithPermission] = Set.empty,
    authorizedOtoroshiGroups: Set[OtoroshiGroup] = Set.empty,
    apiKeyVisibility: Option[TeamApiKeyVisibility] = Some(
      TeamApiKeyVisibility.User),
    metadata: Map[String, String] = Map.empty,
    apisCreationPermission: Option[Boolean] = None
) extends CanJson[User] {
  override def asJson: JsValue = json.TeamFormat.writes(this)
  def humanReadableId = name.urlPathSegmentSanitized
  def asSimpleJson(implicit env: Env): JsValue = toUiPayload()
  def toUiPayload()(implicit env: Env): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> humanReadableId,
      "_tenant" -> json.TenantIdFormat.writes(tenant),
      "tenant" -> json.TenantIdFormat.writes(tenant),
      "type" -> json.TeamTypeFormat.writes(`type`),
      "name" -> name,
      "description" -> description,
      "avatar" -> JsString(avatar.getOrElse("/assets/images/daikoku.svg")),
      "contact" -> contact,
      "users" -> json.SetUserWithPermissionFormat.writes(users),
      "apiKeyVisibility" -> apiKeyVisibility
        .getOrElse(env.config.defaultApiKeyVisibility)
        .asJson,
      "apisCreationPermission" -> apisCreationPermission
        .map(JsBoolean)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def includeUser(userId: UserId): Boolean = {
    users.exists(_.userId == userId)
  }
  def admins(): Set[UserId] =
    users
      .filter(u => u.teamPermission == TeamPermission.Administrator)
      .map(_.userId)
}

// ############# Notifications ###########

sealed trait NotificationStatus

object NotificationStatus {
  case class Pending() extends NotificationStatus with Product with Serializable
  case class Accepted(date: DateTime = DateTime.now())
      extends NotificationStatus
      with Product
      with Serializable
  case class Rejected(date: DateTime = DateTime.now())
      extends NotificationStatus
      with Product
      with Serializable
}

sealed trait NotificationAction
sealed trait OtoroshiSyncNotificationAction extends NotificationAction {
  def message: String
  def json: JsValue
}

object NotificationAction {
  case class ApiAccess(api: ApiId, team: TeamId) extends NotificationAction

  case class TeamAccess(team: TeamId) extends NotificationAction

  case class TeamInvitation(team: TeamId, user: UserId)
      extends NotificationAction

  case class ApiSubscriptionAccept(api: ApiId, plan: UsagePlanId, team: TeamId)
      extends NotificationAction

  case class ApiSubscriptionReject(message: Option[String],
                                   api: ApiId,
                                   plan: UsagePlanId,
                                   team: TeamId)
      extends NotificationAction

  case class ApiSubscriptionDemand(
      api: ApiId,
      plan: UsagePlanId,
      team: TeamId,
      demand: SubscriptionDemandId,
      step: SubscriptionDemandStepId,
      parentSubscriptionId: Option[ApiSubscriptionId] = None,
      motivation: Option[String])
      extends NotificationAction

  case class OtoroshiSyncSubscriptionError(subscription: ApiSubscription,
                                           message: String)
      extends OtoroshiSyncNotificationAction {
    def json: JsValue =
      Json.obj("errType" -> "OtoroshiSyncSubscriptionError",
               "errMessage" -> message,
               "subscription" -> subscription.asJson)
  }
  case class OtoroshiSyncApiError(api: Api, message: String)
      extends OtoroshiSyncNotificationAction {
    def json: JsValue =
      Json.obj("errType" -> "OtoroshiSyncApiError",
               "errMessage" -> message,
               "api" -> api.asJson)
  }
  case class ApiKeyDeletionInformation(api: String, clientId: String)
      extends NotificationAction

  case class ApiKeyRotationInProgress(clientId: String,
                                      api: String,
                                      plan: String)
      extends NotificationAction

  case class ApiKeyRotationEnded(clientId: String, api: String, plan: String)
      extends NotificationAction

  case class ApiKeyRefresh(subscription: String, api: String, plan: String)
      extends NotificationAction

  case class NewPostPublished(teamId: String, apiName: String)
      extends NotificationAction

  case class NewIssueOpen(teamId: String, apiName: String, linkTo: String)
      extends NotificationAction

  case class NewCommentOnIssue(teamId: String, apiName: String, linkTo: String)
      extends NotificationAction

  case class TransferApiOwnership(team: TeamId, api: ApiId)
      extends NotificationAction
}

sealed trait NotificationType {
  def value: String
}

object NotificationType {
  case object AcceptOrReject extends NotificationType {
    override def value: String = "AcceptOrReject"
  }
  case object AcceptOnly extends NotificationType {
    override def value: String = "AcceptOnly"
  }
}

case class Notification(
    id: NotificationId,
    tenant: TenantId,
    deleted: Boolean = false,
    team: Option[TeamId],
    sender: User,
    date: DateTime = DateTime.now(),
    notificationType: NotificationType = NotificationType.AcceptOrReject,
    status: NotificationStatus = NotificationStatus.Pending(),
    action: NotificationAction
) extends CanJson[Notification] {
  override def asJson: JsValue = json.NotificationFormat.writes(this)
}
