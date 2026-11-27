package fr.maif.daikoku.utils

import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import play.api.libs.json.JsObject

object SubscriptionDemandPreparation {
  def fromBatch(
      batch: SubscriptionBatchDemand,
      itemId: SubscriptionBatchItemId
  ): Either[AppError, SubscriptionDemand] = {
    for {
      _ <- batch.validateSelection()
      item <- batch.items.find(_.id == itemId)
        .toRight(AppError.EntityNotFound("Subscription batch item"))
      _ <- Either.cond(
        item.state == SubscriptionBatchItemState.Pending && item.demand.isEmpty,
        (),
        AppError.EntityConflict("Subscription batch item state")
      )
      target <- item.keyringChoice match {
        case SubscriptionBatchKeyringChoice.Existing(keyring) =>
          Right((keyring, Option.empty[String]))
        case SubscriptionBatchKeyringChoice.New(creationId) =>
          for {
            creation <- batch.newKeyrings.find(_.id == creationId)
              .toRight(AppError.EntityNotFound("Subscription batch keyring creation"))
            keyring <- creation.keyring
              .toRight(AppError.EntityConflict("Subscription batch keyring is not ready"))
          } yield (keyring, Some(creation.customName))
      }
    } yield prepare(
      SubscriptionDemand(
        id = DemandId(IdGenerator.token(32)),
        tenant = batch.tenant,
        api = item.api,
        plan = item.plan,
        steps = Seq.empty,
        team = batch.team,
        from = batch.from,
        motivation = batch.motivation,
        keyring = Some(target._1),
        keyringCustomName = target._2,
        batch = Some(SubscriptionBatchReference(batch.id, item.id))
      ),
      item.process
    )
  }

  /** Prepare a new demand only; never rebuild the steps of a progressing demand. */
  def prepare(
      demand: SubscriptionDemand,
      process: SubscriptionProcess
  ): SubscriptionDemand = {
    val formKeysToMetadata = process.steps
      .collectFirst { case step: ValidationStep.Form => step }
      .flatMap(_.formKeysToMetadata)
    val metadataFromMotivation = for {
      motivation <- demand.motivation
      keys <- formKeysToMetadata
    } yield JsObject(motivation.fields.collect {
      case (key, value) if keys.contains(key) => key -> value
    })

    demand.copy(
      steps = process.steps.map { step =>
        SubscriptionDemandStep(
          id = SubscriptionDemandStepId(IdGenerator.token),
          state = step match {
            case _: ValidationStep.Form => SubscriptionDemandState.Accepted
            case _                     => SubscriptionDemandState.Waiting
          },
          step = step
        )
      },
      customMetadata = JsonOperationsHelper.mergeOptJson(
        demand.customMetadata,
        metadataFromMotivation
      )
    )
  }
}
