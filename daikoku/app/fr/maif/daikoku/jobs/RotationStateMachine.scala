package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.{
  ActualOtoroshiApiKey,
  ApiKeyRotation,
  ApiSubscriptionRotation,
  Keyring
}

enum RotationEvent:
  case Started
  case Ended

enum RotationDecision:
  case NoOp(reason: String)
  case ArmOtoroshi(rotation: ApiKeyRotation)
  case UpdateKeyring(keyring: Keyring, event: Option[RotationEvent])

/** Decides what to do with a keyring given the state of its Otoroshi api key.
  *
  * Otoroshi drives the rotation: it is authoritative for the current secret and
  * it is the only one producing the next credentials. Daikoku mirrors that
  * state so that consumers can read the next credentials during the whole grace
  * period, the current ones staying authoritative until the rotation ends.
  *
  * Pure on purpose: no datastore, no http, so every transition is unit
  * testable.
  */
object RotationStateMachine {

  def decide(
      keyring: Keyring,
      apk: ActualOtoroshiApiKey
  ): RotationDecision = {
    keyring.rotation match {
      case None => RotationDecision.NoOp("no rotation configured")
      case Some(rotation) =>
        apk.rotation.filter(_.enabled) match {
          case None if rotation.enabled =>
            RotationDecision.ArmOtoroshi(rotation.toApiKeyRotation)
          case None =>
            RotationDecision.NoOp("rotation disabled on both sides")
          case Some(otoRotation) =>
            otoRotation.nextSecret match {
              case Some(next) => rotationInFlight(keyring, rotation, apk, next)
              case None       => rotationSettled(keyring, rotation, apk)
            }
        }
    }
  }

  /** Otoroshi published a next secret: mirror it, and adopt its current secret
    * in case we had drifted. The keyring's own credentials are left untouched.
    */
  private def rotationInFlight(
      keyring: Keyring,
      rotation: ApiSubscriptionRotation,
      apk: ActualOtoroshiApiKey,
      next: String
  ): RotationDecision = {
    val nextBearer = apk.rotation.flatMap(_.bearer)
    val alreadyMirrored = rotation.pendingRotation &&
      rotation.nextSecret.contains(next) &&
      rotation.nextBearer == nextBearer &&
      keyring.apiKey.clientSecret == apk.clientSecret

    if (alreadyMirrored) {
      RotationDecision.NoOp("rotation in progress")
    } else {
      RotationDecision.UpdateKeyring(
        keyring.copy(
          apiKey = keyring.apiKey.copy(clientSecret = apk.clientSecret),
          rotation = Some(
            rotation.copy(
              pendingRotation = true,
              nextSecret = Some(next),
              nextBearer = nextBearer
            )
          )
        ),
        // only the transition into the grace period is worth a notification,
        // later refreshes of the next credentials are not
        Option.when(!rotation.pendingRotation)(RotationEvent.Started)
      )
    }
  }

  /** No next secret in Otoroshi: either a rotation just ended, or nothing is
    * happening. Otoroshi is authoritative for the current secret.
    */
  private def rotationSettled(
      keyring: Keyring,
      rotation: ApiSubscriptionRotation,
      apk: ActualOtoroshiApiKey
  ): RotationDecision = {
    val inSync = keyring.apiKey.clientSecret == apk.clientSecret

    if (rotation.pendingRotation || !inSync) {
      RotationDecision.UpdateKeyring(
        keyring.copy(
          apiKey = keyring.apiKey.copy(clientSecret = apk.clientSecret),
          bearerToken = apk.bearer.orElse(keyring.bearerToken),
          rotation = Some(
            rotation.copy(
              pendingRotation = false,
              nextSecret = None,
              nextBearer = None
            )
          )
        ),
        Some(RotationEvent.Ended)
      )
    } else if (!rotation.enabled) {
      RotationDecision.ArmOtoroshi(rotation.toApiKeyRotation)
    } else {
      RotationDecision.NoOp("nothing to rotate")
    }
  }
}
