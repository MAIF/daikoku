package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.*
import org.joda.time.DateTime
import org.scalatestplus.play.PlaySpec

/** Pure unit tests for the api key rotation decision. No datastore, no
  * Otoroshi, no container: the decision is a function of the Daikoku-side
  * keyring state and the Otoroshi-side api key state.
  */
class RotationStateMachineSpec extends PlaySpec {

  private val currentSecret = "current-secret"
  private val currentBearer = "current-bearer"
  private val nextSecret = "next-secret"
  private val nextBearer = "next-bearer"

  private def keyring(
      rotation: Option[ApiSubscriptionRotation],
      clientSecret: String = currentSecret,
      bearerToken: Option[String] = Some(currentBearer)
  ): Keyring =
    Keyring(
      id = KeyringId("keyring-1"),
      tenant = TenantId("tenant-1"),
      team = TeamId("team-1"),
      apiKey = OtoroshiApiKey(
        clientName = "client-name",
        clientId = "client-id",
        clientSecret = clientSecret
      ),
      otoroshiSettings =
        KeyringOtoroshiBinding.Otoroshi(OtoroshiSettingsId("oto-1")),
      createdAt = DateTime.now(),
      rotation = rotation,
      integrationToken = "integration-token",
      bearerToken = bearerToken
    )

  private def apk(
      rotation: Option[ApiKeyRotation],
      clientSecret: String = currentSecret,
      bearer: Option[String] = Some(currentBearer)
  ): ActualOtoroshiApiKey =
    ActualOtoroshiApiKey(
      clientId = "client-id",
      clientSecret = clientSecret,
      clientName = "client-name",
      authorizedEntities = AuthorizedEntities(),
      rotation = rotation,
      bearer = bearer
    )

  private def dkRotation(
      enabled: Boolean = true,
      pendingRotation: Boolean = false,
      nextSecret: Option[String] = None,
      nextBearer: Option[String] = None
  ): Option[ApiSubscriptionRotation] =
    Some(
      ApiSubscriptionRotation(
        enabled = enabled,
        pendingRotation = pendingRotation,
        nextSecret = nextSecret,
        nextBearer = nextBearer
      )
    )

  private def otoRotation(
      enabled: Boolean = true,
      nextSecret: Option[String] = None,
      bearer: Option[String] = None
  ): Option[ApiKeyRotation] =
    Some(
      ApiKeyRotation(enabled = enabled, nextSecret = nextSecret, bearer = bearer)
    )

  "RotationStateMachine" should {

    // row 1
    "do nothing when the keyring has no rotation configured" in {
      RotationStateMachine.decide(
        keyring(rotation = None),
        apk(rotation = otoRotation())
      ) mustBe a[RotationDecision.NoOp]
    }

    // row 2
    "do nothing when rotation is disabled on both sides" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation(enabled = false)),
        apk(rotation = None)
      ) mustBe a[RotationDecision.NoOp]
    }

    // row 3
    "propagate the disabling to Otoroshi when armed there but disabled in Daikoku" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation(enabled = false)),
        apk(rotation = otoRotation(enabled = true))
      ) match {
        case RotationDecision.ArmOtoroshi(rotation) =>
          rotation.enabled mustBe false
        case other => fail(s"expected ArmOtoroshi, got $other")
      }
    }

    // row 3, in-flight guard
    "not disarm Otoroshi in the middle of a rotation" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation(enabled = false, pendingRotation = true)),
        apk(rotation = otoRotation(nextSecret = Some(nextSecret)))
      ) must not be a[RotationDecision.ArmOtoroshi]
    }

    // row 4
    "arm rotation in Otoroshi when enabled in Daikoku but not in Otoroshi" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation(enabled = true)),
        apk(rotation = None)
      ) match {
        case RotationDecision.ArmOtoroshi(rotation) =>
          rotation.enabled mustBe true
          // Otoroshi owns the next credentials, we must never push ours back
          rotation.nextSecret mustBe None
          rotation.bearer mustBe None
        case other => fail(s"expected ArmOtoroshi, got $other")
      }
    }

    // row 5
    "do nothing when armed on both sides and no rotation is in flight" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation()),
        apk(rotation = otoRotation())
      ) mustBe a[RotationDecision.NoOp]
    }

    // row 6 — the core semantic fix
    "expose the next credentials without touching the current ones when a rotation starts" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation()),
        apk(rotation =
          otoRotation(nextSecret = Some(nextSecret), bearer = Some(nextBearer))
        )
      ) match {
        case RotationDecision.UpdateKeyring(updated, event) =>
          event mustBe Some(RotationEvent.Started)
          updated.rotation.map(_.pendingRotation) mustBe Some(true)
          updated.rotation.flatMap(_.nextSecret) mustBe Some(nextSecret)
          updated.rotation.flatMap(_.nextBearer) mustBe Some(nextBearer)
          // the current credentials stay authoritative for the whole grace period
          updated.apiKey.clientSecret mustBe currentSecret
          updated.bearerToken mustBe Some(currentBearer)
        case other => fail(s"expected UpdateKeyring, got $other")
      }
    }

    // row 7
    "not re-notify while a rotation stays in flight" in {
      RotationStateMachine.decide(
        keyring(rotation =
          dkRotation(
            pendingRotation = true,
            nextSecret = Some(nextSecret),
            nextBearer = Some(nextBearer)
          )
        ),
        apk(rotation =
          otoRotation(nextSecret = Some(nextSecret), bearer = Some(nextBearer))
        )
      ) mustBe a[RotationDecision.NoOp]
    }

    // row 7, refresh
    "refresh the next credentials without an event when Otoroshi changed them" in {
      RotationStateMachine.decide(
        keyring(rotation =
          dkRotation(pendingRotation = true, nextSecret = Some("stale"))
        ),
        apk(rotation = otoRotation(nextSecret = Some(nextSecret)))
      ) match {
        case RotationDecision.UpdateKeyring(updated, event) =>
          event mustBe None
          updated.rotation.flatMap(_.nextSecret) mustBe Some(nextSecret)
        case other => fail(s"expected UpdateKeyring, got $other")
      }
    }

    // row 8
    "apply the next credentials when the rotation ends" in {
      RotationStateMachine.decide(
        keyring(rotation =
          dkRotation(
            pendingRotation = true,
            nextSecret = Some(nextSecret),
            nextBearer = Some(nextBearer)
          )
        ),
        apk(
          rotation = otoRotation(nextSecret = None),
          clientSecret = nextSecret,
          bearer = Some(nextBearer)
        )
      ) match {
        case RotationDecision.UpdateKeyring(updated, event) =>
          event mustBe Some(RotationEvent.Ended)
          updated.apiKey.clientSecret mustBe nextSecret
          updated.bearerToken mustBe Some(nextBearer)
          updated.rotation.map(_.pendingRotation) mustBe Some(false)
          updated.rotation.flatMap(_.nextSecret) mustBe None
          updated.rotation.flatMap(_.nextBearer) mustBe None
        case other => fail(s"expected UpdateKeyring, got $other")
      }
    }

    // row 9 — the state the previous implementation could not leave
    "adopt the Otoroshi secret when it diverged outside of a rotation" in {
      RotationStateMachine.decide(
        keyring(rotation = dkRotation(), clientSecret = "stale-secret"),
        apk(rotation = otoRotation(), clientSecret = currentSecret)
      ) match {
        case RotationDecision.UpdateKeyring(updated, _) =>
          updated.apiKey.clientSecret mustBe currentSecret
          updated.rotation.map(_.pendingRotation) mustBe Some(false)
        case other => fail(s"expected UpdateKeyring, got $other")
      }
    }

    "be idempotent: applying a decision twice yields no further change" in {
      val cases = Seq(
        keyring(rotation = dkRotation()) -> apk(rotation =
          otoRotation(nextSecret = Some(nextSecret), bearer = Some(nextBearer))
        ),
        keyring(rotation =
          dkRotation(pendingRotation = true, nextSecret = Some(nextSecret))
        ) -> apk(rotation = otoRotation(), clientSecret = nextSecret),
        keyring(rotation = dkRotation(), clientSecret = "stale-secret") -> apk(
          rotation = otoRotation()
        )
      )

      cases.foreach { case (initial, otoroshiKey) =>
        RotationStateMachine.decide(initial, otoroshiKey) match {
          case RotationDecision.UpdateKeyring(updated, _) =>
            RotationStateMachine.decide(
              updated,
              otoroshiKey
            ) mustBe a[RotationDecision.NoOp]
          case other => fail(s"expected UpdateKeyring, got $other")
        }
      }
    }

    "never leave a keyring holding a secret Otoroshi does not know about" in {
      val states = for {
        pending <- Seq(true, false)
        dkNext <- Seq(None, Some(nextSecret))
        otoNext <- Seq(None, Some(nextSecret))
        secret <- Seq(currentSecret, "stale-secret")
      } yield keyring(
        rotation = dkRotation(pendingRotation = pending, nextSecret = dkNext),
        clientSecret = secret
      ) -> apk(rotation = otoRotation(nextSecret = otoNext))

      states.foreach { case (initial, otoroshiKey) =>
        RotationStateMachine.decide(initial, otoroshiKey) match {
          case RotationDecision.UpdateKeyring(updated, _)
              if !updated.rotation.exists(_.pendingRotation) =>
            updated.apiKey.clientSecret mustBe otoroshiKey.clientSecret
          case _ => succeed
        }
      }
    }
  }
}
