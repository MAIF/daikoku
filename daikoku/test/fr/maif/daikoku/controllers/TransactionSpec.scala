package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec

import scala.concurrent.Await
import scala.concurrent.duration.*

class TransactionSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  "withTransaction" should {

    "commit both saves when everything succeeds" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      // flushBlocking()

      val ds = daikokuComponents.env.dataStore
      val userId = UserId(IdGenerator.token(32))
      val teamId = TeamId(IdGenerator.token(32))

      val testUser = User(
        id = userId,
        tenants = Set(Tenant.Default),
        origins = Set(AuthProvider.Local),
        name = "Tx-User",
        email = s"tx-user-${userId.value}@test.io",
        lastTenant = None,
        personalToken = Some(IdGenerator.token(32)),
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )

      val testTeam = Team(
        id = teamId,
        tenant = Tenant.Default,
        `type` = TeamType.Organization,
        name = "Tx-Team",
        description = "team for transaction test",
        users = Set(UserWithPermission(userId, TeamPermission.Administrator)),
        contact = "tx@test.io"
      )

      Await.result(
        ds.withTransaction {
          for {
            _ <- ds.userRepo.save(testUser)
            _ <- ds.teamRepo.forAllTenant().save(testTeam)
          } yield ()
        },
        10.second
      )

      val savedUser = Await.result(ds.userRepo.findById(userId), 5.second)
      val savedTeam =
        Await.result(ds.teamRepo.forAllTenant().findById(teamId), 5.second)

      savedUser mustBe defined
      savedTeam mustBe defined
    }

    "rollback the first save when the second write fails" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val ds = daikokuComponents.env.dataStore

      // The transaction saves the user then fails — the user must not be persisted.
      val failed = Await.result(
        ds.withTransaction {
          for {
            _ <- ds.userRepo.save(user.copy(name = "fifou_rollback"))
            _ <- scala.concurrent.Future.failed[Unit](
              new RuntimeException("simulated failure after first write")
            )
          } yield ()
        }.map(_ => false)
          .recover(_ => true),
        10.second
      )

      failed mustBe true

      val rolledBackUser = Await.result(ds.userRepo.findById(user.id), 5.second)
      rolledBackUser mustBe defined
      rolledBackUser.get.name mustBe user.name
    }
  }
}
