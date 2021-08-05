package controllers

import play.api.libs.json.{JsObject, Json}
import play.api.mvc
import play.api.mvc.Results._

sealed trait AppError

object AppError {
  case object ApiVersionConflict extends AppError
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
  case object ApiKeyCustomMetadataNotPrivided extends AppError
  case object SubscriptionNotFound extends AppError
  case object SubscriptionParentExisted extends AppError
  case object SubscriptionAggregationDisabled extends AppError
  case object MissingParentSubscription extends AppError
  case object TranslationNotFound extends AppError

  def render(error: AppError): mvc.Result = error match {
    case ApiVersionConflict => Conflict(toJson(ApiVersionConflict))
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
      Unauthorized(Json.obj("error" -> "You're not authorized on this api", "status" -> 403))
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
    case ApiKeyRotationConflict =>
      Conflict(Json.obj("error" -> "Api have already setup apikey rotation"))
    case ApiKeyRotationError(e) => BadRequest(e)
    case ForbiddenAction =>
      Forbidden(Json.obj("error" -> "You're not authorized to do this action"))
    case ApiKeyCustomMetadataNotPrivided =>
      BadRequest(Json.obj("error" -> "You need to provide custom metadata"))
    case SubscriptionNotFound => NotFound(toJson(SubscriptionNotFound))
    case SubscriptionParentExisted => Conflict(toJson(SubscriptionParentExisted))
    case SubscriptionAggregationDisabled => BadRequest(toJson(SubscriptionAggregationDisabled))
    case MissingParentSubscription => NotFound(toJson(MissingParentSubscription))
    case TranslationNotFound => NotFound(toJson(TranslationNotFound))
  }

  def toJson(error: AppError) = {
    error match {
      case OtoroshiError(e) => e
      case ApiKeyRotationError(e) => e
      case err =>
        Json.obj("error" -> (err match {
          case ApiVersionConflict   => "This version already existed"
          case ApiNotFound          => "Api not found"
          case TeamNotFound         => "Team not found"
          case UserNotFound         => "User not found"
          case NotificationNotFound => "Notification not found"
          case OtoroshiSettingsNotFound => "Otoroshi settings not found"
          case TeamUnauthorized => "You're not authorized on this team"
          case ApiUnauthorized  =>"You're not authorized on this api"
          case PlanUnauthorized =>"You're not authorized on this plan"
          case PlanNotFound     =>"Plan not found"
          case ApiNotLinked     =>"Api is not linked to an Otoroshi descriptor"
          case UserNotTeamAdmin(userId, teamId) => s"User $userId is not an admin for team $teamId"
          case SubscriptionConflict   => "conflict with subscription request"
          case ApiKeyRotationConflict => "conflict, Api have already setup apikey rotation"
          case ForbiddenAction        => "You're not authorized to do this action"
          case ApiKeyCustomMetadataNotPrivided  =>"You need to provide custom metadata"
          case SubscriptionNotFound             => "Subscription not found"
          case SubscriptionParentExisted        => "The subscription already has a subscription parent - it cannot be extended any further"
          case SubscriptionAggregationDisabled  => "Aggregation of api keys is disabled on plan or on tenant"
          case MissingParentSubscription        => "The parent of this subscription is missing"
          case TranslationNotFound              => "Translation not found"
          case _ => ""
        }))
      }
  }
}
