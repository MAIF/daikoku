package fr.maif.daikoku.domain

import cats.data.EitherT
import cats.implicits._
import fr.maif.daikoku.controllers.AppError
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

sealed trait WorkflowState {
  def name: String
  def isClosed: Boolean
}

object WorkflowState {
  case object Accepted extends WorkflowState {
    def name: String = "accepted"
    def isClosed: Boolean = true
  }
  case object Refused extends WorkflowState {
    def name: String = "refused"
    def isClosed: Boolean = true
  }
  case object Canceled extends WorkflowState {
    def name: String = "canceled"
    def isClosed: Boolean = true
  }
  case object InProgress extends WorkflowState {
    def name: String = "inProgress"
    def isClosed: Boolean = false
  }
  case object Waiting extends WorkflowState {
    def name: String = "waiting"
    def isClosed: Boolean = false
  }
  case object Blocked extends WorkflowState {
    def name: String = "blocked"
    def isClosed: Boolean = true
  }

  val values: Seq[WorkflowState] =
    Seq(Accepted, Refused, Canceled, InProgress)

  def merge(states: Seq[WorkflowState]): WorkflowState = {
    if (states.exists(_.name === InProgress.name)) {
      InProgress
    } else if (states.forall(_.name === Accepted.name)) {
      Accepted
    } else if (states.exists(_.name === Refused.name)) {
      Refused
    } else if (states.exists(_.name === Canceled.name)) {
      Canceled
    } else if (states.exists(_.name === Blocked.name)) {
      Blocked
    } else {
      Waiting
    }
  }

  def apply(name: String): Option[WorkflowState] =
    name match {
      case "accepted"   => Accepted.some
      case "refused"    => Refused.some
      case "canceled"   => Canceled.some
      case "inProgress" => InProgress.some
      case "waiting"    => Waiting.some
      case _            => None
    }
}

case class WorkflowStep(
    id: WorkflowStepId,
    state: WorkflowState,
    step: ValidationStep,
    metadata: JsObject = Json.obj()
) extends CanJson[WorkflowStep] {
  override def asJson: JsValue = json.WorkflowStepFormat.writes(this)
  def check(): EitherT[Future, AppError, Unit] = {
    state match {
      case WorkflowState.InProgress | WorkflowState.Waiting =>
        EitherT.pure[Future, AppError](())
      case _ =>
        EitherT.leftT[Future, Unit](
          AppError.EntityConflict("Workflow step state")
        )
    }
  }
}

case class StepValidator(
    id: DatastoreId,
    tenant: TenantId,
    token: String,
    step: WorkflowStepId,
    demandId: DemandId,
    metadata: JsObject = Json.obj()
) extends CanJson[StepValidator] {
  override def asJson: JsValue = json.StepValidatorFormat.writes(this)
}
