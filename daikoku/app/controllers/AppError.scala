package controllers

import play.api.libs.json.{JsObject, Json}
import play.api.mvc
import play.api.mvc.Results._

sealed trait AppError

object AppError {
  case object ApiNotFound extends AppError
  case object TeamNotFound extends AppError
  case object UserNotFound extends AppError
  case object ForbiddenAction extends AppError
  case object OtoroshiSettingsNotFound extends AppError
  case object NotificationNotFound extends AppError
  case object TeamUnauthorized extends AppError
  case object ApiUnauthorized extends AppError with Product with Serializable
  case object PlanUnauthorized extends AppError with Product with Serializable
  case object PlanNotFound extends AppError with Product with Serializable
  case object ApiNotLinked extends AppError
  case class UserNotTeamAdmin(userId: String, teamId: String) extends AppError
  case class OtoroshiError(message: JsObject) extends AppError
  case object SubscriptionConflict extends AppError
  case object ApiKeyRotationConflict extends AppError
  case class ApiKeyRotationError(message: JsObject) extends AppError

  def render(error: AppError): mvc.Result = error match {
    case ApiNotFound  => NotFound(Json.obj("error" -> "Api not found"))
    case TeamNotFound => NotFound(Json.obj("error" -> "Team not found"))
    case UserNotFound => NotFound(Json.obj("error" -> "User not found"))
    case NotificationNotFound =>
      NotFound(Json.obj("error" -> "Notification not found"))
    case OtoroshiSettingsNotFound =>
      NotFound(Json.obj("error" -> "Otoroshi settings not found"))
    case TeamUnauthorized =>
      Unauthorized(Json.obj("error" -> "You're not authorized on this team"))
    case ApiUnauthorized =>
      Unauthorized(Json.obj("error" -> "You're not authorized on this api"))
    case PlanUnauthorized =>
      Unauthorized(Json.obj("error" -> "You're not authorized on this plan"))
    case PlanNotFound =>
      NotFound(Json.obj("error" -> "Plan not found"))
    case ApiNotLinked =>
      BadRequest(
        Json.obj("error" -> "Api is not linked to an Otoroshi descriptor"))
    case UserNotTeamAdmin(userId, teamId) =>
      Unauthorized(
        Json.obj("error" -> s"User $userId is not an admin for team $teamId"))
    case OtoroshiError(e) => BadRequest(e)
    case SubscriptionConflict =>
      Conflict(Json.obj("error" -> "conflict with subscription request"))
    case ApiKeyRotationConflict => Conflict(Json.obj("error" -> "Api have already setup apikey rotation"))
    case ApiKeyRotationError(e) => BadRequest(e)
    case ForbiddenAction => Forbidden(Json.obj("error" -> "You're not authorized to do this action"))

  }

  def toJson(error: AppError) = error match {
    case ApiNotFound          => Json.obj("error" -> "Api not found")
    case TeamNotFound         => Json.obj("error" -> "Team not found")
    case UserNotFound         => Json.obj("error" -> "User not found")
    case NotificationNotFound => Json.obj("error" -> "Notification not found")
    case OtoroshiSettingsNotFound =>
      Json.obj("error" -> "Otoroshi settings not found")
    case TeamUnauthorized =>
      Json.obj("error" -> "You're not authorized on this team")
    case ApiUnauthorized =>
      Json.obj("error" -> "You're not authorized on this api")
    case PlanUnauthorized =>
      Json.obj("error" -> "You're not authorized on this plan")
    case PlanNotFound =>
      Json.obj("error" -> "Plan not found")
    case ApiNotLinked =>
      Json.obj("error" -> "Api is not linked to an Otoroshi descriptor")
    case UserNotTeamAdmin(userId, teamId) =>
      Json.obj("error" -> s"User $userId is not an admin for team $teamId")
    case OtoroshiError(e) => e
    case SubscriptionConflict =>
      Json.obj("error" -> "conflict with subscription request")
    case ApiKeyRotationConflict => Json.obj("error" -> "conflict, Api have already setup apikey rotation")
    case ApiKeyRotationError(e) => e
    case ForbiddenAction => Json.obj("error" -> "You're not authorized to do this action")
  }
}
