package fr.maif.daikoku.usages

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.TeamPermission.TeamUser
import fr.maif.daikoku.domain.{
  ApiId,
  OtoroshiSettings,
  Team,
  TeamId,
  TeamType,
  TenantMode,
  UserWithPermission
}
import fr.maif.daikoku.login.{AuthProvider, LdapConfig}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.JsObject

class MaintenanceSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with ForAllTestContainer {

  val pwd: String = System.getProperty("user.dir")
  override val container: GenericContainer = GenericContainer(
    "osixia/openldap:latest",
    exposedPorts = Seq(389),
    env = Map(
      "LDAP_BASE_DN" -> "dc=dundermifflin,dc=com",
      "LDAP_ORGANISATION" -> "Dunder Mifflin Organization",
      "LDAP_DOMAIN" -> "dundermifflin.com",
      "LDAP_ADMIN_PASSWORD" -> "adminpassword",
      "LDAP_TLS" -> "false"
    ),
    command = Seq("--copy-service"),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/javascript/tests/config/ldap/bootstrap.ldif",
        "/container/service/slapd/assets/config/bootstrap/ldif/custom/50-bootstrap.ldif",
        BindMode.READ_ONLY
      )
    )
  )

  lazy val authProviderSettings: JsObject = LdapConfig(
    serverUrls = Seq(
      s"ldap://localhost:${container.mappedPort(389)}"
    ),
    searchBase = "dc=dundermifflin,dc=com",
    userBase = "ou=scranton".some,
    groupFilter = "ou=employees".some,
    adminGroupFilter = "ou=managers".some,
    adminUsername = "cn=admin,dc=dundermifflin,dc=com".some,
    adminPassword = "adminpassword".some,
    nameFields = Seq("cn")
  ).asJson

  "a user not administrator has 503 in tenant mode maintenance when reaching paths" can {
    "cannot pass" in {
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(tenantMode = Some(TenantMode.Maintenance))
        ),
        users = Seq(user),
        teams = Seq(
          Team(
            id = TeamId(IdGenerator.token(32)),
            tenant = tenant.id,
            `type` = TeamType.Personal,
            name = user.name,
            description = s"The personal team of ${user.name}",
            users = Set(UserWithPermission(user.id, TeamUser)),
            authorizedOtoroshiEntities = None,
            contact = user.email
          )
        ),
        apis = Seq.empty
      )

      val session = loginWithBlocking(user, tenant)

      val respActionDaikokuTenantAction = httpJsonCallBlocking(
        path = s"/auth/${tenant.authProvider}/login"
      )(using tenant, session)
      respActionDaikokuTenantAction.status mustBe 503

      val respActionDaikokuAction = httpJsonCallBlocking(
        path = "/logout"
      )(using tenant, session)
      respActionDaikokuAction.status mustBe 503

      val respActionDaikokuActionMaybeWithGuest = httpJsonCallBlocking(
        path = "/api/me/context"
      )(using tenant, session)
      respActionDaikokuActionMaybeWithGuest.status mustBe 200

    }
  }
}
