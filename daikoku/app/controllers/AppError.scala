package controllers

import akka.http.scaladsl.util.FastFuture
import controllers.AppError.toJson
import play.api.libs.json.{JsObject, Json}
import play.api.mvc
import play.api.mvc.Results._

import scala.concurrent.Future

sealed trait AppError {
  def render() = AppError.render(this)
  def renderF() = AppError.renderF(this)
  def toJson() = AppError.toJson(this)
  def future() = FastFuture.successful(this)
  def getErrorMessage() = AppError.getErrorMessage(this)
}

object AppError {
  case object ApiVersionConflict extends AppError
  case object TeamNameAlreadyExists extends AppError
  case object ApiNotFound extends AppError
  case object ApiNotPublished extends AppError
  case object PageNotFound extends AppError
  case object ApiGroupNotFound extends AppError
  case object TenantNotFound extends AppError
  case object TeamNotFound extends AppError
  case object UserNotFound extends AppError
  case class EntityNotFound(entityName: String) extends AppError
  case object ForbiddenAction extends AppError
  case object OtoroshiSettingsNotFound extends AppError
  case object NotificationNotFound extends AppError
  case object SubscriptionDemandNotFound extends AppError
  case object SubscriptionDemandClosed extends AppError
  case object TeamUnauthorized extends AppError
  case object TeamNotVerified extends AppError
  case object ApiUnauthorized extends AppError
  case object PlanUnauthorized extends AppError
  case object PlanNotFound extends AppError
  case object ApiNotLinked extends AppError
  case class UserNotTeamAdmin(userId: String, teamId: String) extends AppError
  case class OtoroshiError(message: JsObject) extends AppError
  case class PaymentError(message: JsObject) extends AppError
  case object SubscriptionConflict extends AppError
  case object ApiKeyRotationConflict extends AppError
  case class EntityConflict(entityName: String) extends AppError
  case class ApiKeyRotationError(message: JsObject) extends AppError
  case object ApiKeyCustomMetadataNotPrivided extends AppError
  case object SubscriptionNotFound extends AppError
  case object SubscriptionParentExisted extends AppError
  case object SubscriptionAggregationTeamConflict extends AppError
  case object SubscriptionAggregationOtoroshiConflict extends AppError
  case object SubscriptionAggregationDisabled extends AppError
  case object MissingParentSubscription extends AppError
  case object TranslationNotFound extends AppError
  case object Unauthorized extends AppError
  case object TeamForbidden extends AppError
  case class ParsingPayloadError(message: String) extends AppError
  case object NameAlreadyExists extends AppError
  case object TeamAlreadyVerified extends AppError
  case object ThirdPartyPaymentSettingsNotFound extends AppError
  case class SecurityError(security: String) extends AppError
  case object UnexpectedError extends AppError

  def renderF(error: AppError): Future[mvc.Result] =
    FastFuture.successful(render(error))

  def render(error: AppError): mvc.Result = error match {
    case ApiVersionConflict         => Conflict(toJson(ApiVersionConflict))
    case TeamNameAlreadyExists      => Conflict(toJson(TeamNameAlreadyExists))
    case ApiNotFound                => NotFound(toJson(error))
    case ApiNotPublished            => Forbidden(toJson(error))
    case PageNotFound               => NotFound(toJson(error))
    case ApiGroupNotFound           => NotFound(toJson(error))
    case TeamNotFound               => NotFound(toJson(error))
    case TenantNotFound             => NotFound(toJson(error))
    case UserNotFound               => NotFound(toJson(error))
    case EntityNotFound(_)          => NotFound(toJson(error))
    case SubscriptionDemandNotFound => NotFound(toJson(error))
    case SubscriptionDemandClosed   => Forbidden(toJson(error))
    case NotificationNotFound       => NotFound(toJson(error))
    case OtoroshiSettingsNotFound   => NotFound(toJson(error))
    case TeamUnauthorized           => play.api.mvc.Results.Unauthorized(toJson(error))
    case TeamNotVerified            => play.api.mvc.Results.Unauthorized(toJson(error))
    case TeamForbidden              => play.api.mvc.Results.Forbidden(toJson(error))
    case ApiUnauthorized =>
      play.api.mvc.Results
        .Unauthorized(toJson(error) ++ Json.obj("status" -> 403))
    case PlanUnauthorized => play.api.mvc.Results.Unauthorized(toJson(error))
    case PlanNotFound     => NotFound(toJson(error))
    case ApiNotLinked     => BadRequest(toJson(error))
    case UserNotTeamAdmin(userId, teamId) =>
      play.api.mvc.Results.Unauthorized(toJson(error))
    case OtoroshiError(e)                        => BadRequest(e)
    case PaymentError(e)                         => BadRequest(e)
    case SubscriptionConflict                    => Conflict(toJson(error))
    case ApiKeyRotationConflict                  => Conflict(toJson(error))
    case EntityConflict(_)                       => Conflict(toJson(error))
    case ApiKeyRotationError(e)                  => BadRequest(e)
    case ForbiddenAction                         => Forbidden(toJson(error))
    case ApiKeyCustomMetadataNotPrivided         => BadRequest(toJson(error))
    case SubscriptionNotFound                    => NotFound(toJson(error))
    case SubscriptionParentExisted               => Conflict(toJson(error))
    case SubscriptionAggregationDisabled         => BadRequest(toJson(error))
    case SubscriptionAggregationTeamConflict     => Conflict(toJson(error))
    case SubscriptionAggregationOtoroshiConflict => Conflict(toJson(error))
    case MissingParentSubscription               => NotFound(toJson(error))
    case TranslationNotFound                     => NotFound(toJson(error))
    case Unauthorized                            => play.api.mvc.Results.Unauthorized(toJson(error))
    case ParsingPayloadError(message)            => BadRequest(toJson(error))
    case NameAlreadyExists                       => Conflict(toJson(error))
    case ThirdPartyPaymentSettingsNotFound       => NotFound(toJson(error))
    case SecurityError(security) =>
      play.api.mvc.Results.Unauthorized(toJson(error))
    case TeamAlreadyVerified => Conflict(toJson(error))
    case UnexpectedError     => BadRequest(toJson(error))
  }

  def getErrorMessage(error: AppError) =
    error match {
      case OtoroshiError(e)           => Json.stringify(e) //todo: ???
      case PaymentError(e)            => Json.stringify(e) //todo: ???
      case ApiKeyRotationError(e)     => Json.stringify(e) //todo: ???
      case ParsingPayloadError(msg)   => s"Error while parsing payload: $msg"
      case ApiVersionConflict         => "This version already existed"
      case TeamNameAlreadyExists      => "The name of this team already exists"
      case ApiNotFound                => "API not found"
      case ApiNotPublished            => "API not published"
      case PageNotFound               => "Page not found"
      case ApiGroupNotFound           => "API group not found"
      case TeamNotFound               => "Team not found"
      case TenantNotFound             => "Tenant not found"
      case UserNotFound               => "User not found"
      case EntityNotFound(name)       => s"$name not found"
      case NotificationNotFound       => "Notification not found"
      case SubscriptionDemandNotFound => "SubscriptionDemand not found"
      case SubscriptionDemandClosed   => "SubscriptionDemand is closed"
      case OtoroshiSettingsNotFound   => "Otoroshi settings not found"
      case TeamUnauthorized           => "You're not authorized on this team"
      case TeamNotVerified            => "team email is not verified"
      case ApiUnauthorized            => "You're not authorized on this api"
      case PlanUnauthorized           => "You're not authorized on this plan"
      case PlanNotFound               => "Plan not found"
      case ApiNotLinked               => "Api is not linked to an Otoroshi descriptor"
      case UserNotTeamAdmin(userId, teamId) =>
        s"User $userId is not an admin for team $teamId"
      case SubscriptionConflict => "conflict with subscription request"
      case ApiKeyRotationConflict =>
        "conflict, Api have already setup apikey rotation"
      case EntityConflict(entityName) =>
        s"Conflict with $entityName"
      case ForbiddenAction => "You're not authorized to do this action"
      case TeamForbidden   => "You're not part of this team"
      case ApiKeyCustomMetadataNotPrivided =>
        "You need to provide custom metadata"
      case SubscriptionNotFound => "Subscription not found"
      case SubscriptionParentExisted =>
        "The subscription already has a subscription parent - it cannot be extended any further"
      case SubscriptionAggregationDisabled =>
        "Aggregation of api keys is disabled on plan or on tenant"
      case SubscriptionAggregationTeamConflict =>
        "The new subscription has another team of the parent subscription"
      case SubscriptionAggregationOtoroshiConflict =>
        "The subscribed plan has another otoroshi of the parent plan"
      case MissingParentSubscription =>
        "The parent of this subscription is missing"
      case TranslationNotFound => "Translation not found"
      case Unauthorized        => "You're not authorized here"
      case NameAlreadyExists   => "Resource with same name already exists"
      case ThirdPartyPaymentSettingsNotFound =>
        "Third-party payment settings not found"
      case SecurityError(s)    => s"Forbidden action due to security : $s"
      case TeamAlreadyVerified => "This team is already verified"
      case UnexpectedError     => "Oops, an unexpected error occured ¯\\_(ツ)_/¯"
      case _                   => ""
    }

  def toJson(error: AppError) = {
    error match {
      case OtoroshiError(e)       => e
      case PaymentError(e)        => e
      case ApiKeyRotationError(e) => e
      case ParsingPayloadError(msg) =>
        Json.obj("error" -> "Error while parsing payload", "msg" -> msg)
      case _ => Json.obj("error" -> error.getErrorMessage())
    }
  }
}
