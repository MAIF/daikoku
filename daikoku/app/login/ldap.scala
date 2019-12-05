package fr.maif.otoroshi.daikoku.login

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import play.api.Logger
import play.api.libs.json._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

object LdapConfig {

  lazy val logger = Logger("ldap-config")

  def fromJsons(value: JsValue): LdapConfig =
    try {
      _fmt.reads(value).get
    } catch {
      case e: Throwable => {
        logger.error(s"Try to deserialize ${Json.prettyPrint(value)}")
        throw e
      }
    }

  val _fmt = new Format[LdapConfig] {

    override def reads(json: JsValue) = fromJson(json) match {
      case Left(e)  => JsError(e.getMessage)
      case Right(v) => JsSuccess(v.asInstanceOf[LdapConfig])
    }

    override def writes(o: LdapConfig) = o.asJson
  }

  def fromJson(json: JsValue): Either[Throwable, LdapConfig] =
    Try {
      Right(
        LdapConfig(
          sessionMaxAge = (json \ "sessionMaxAge").asOpt[Int].getOrElse(86400),
          serverUrl = (json \ "serverUrl").as[String],
          searchBase = (json \ "searchBase").as[String],
          userBase = (json \ "userBase").asOpt[String].filterNot(_.trim.isEmpty),
          groupFilter = (json \ "groupFilter").asOpt[String].filterNot(_.trim.isEmpty),
          adminGroupFilter = (json \ "adminGroupFilter").asOpt[String].filterNot(_.trim.isEmpty),
          searchFilter = (json \ "searchFilter").as[String],
          adminUsername = (json \ "adminUsername").asOpt[String].filterNot(_.trim.isEmpty),
          adminPassword = (json \ "adminPassword").asOpt[String].filterNot(_.trim.isEmpty),
          nameField = (json \ "nameField").as[String],
          emailField = (json \ "emailField").as[String],
          pictureField = (json \ "pictureField").asOpt[String],
        )
      )
    } recover {
      case e => Left(e)
    } get
}

case class LdapConfig(
    sessionMaxAge: Int = 86400,
    serverUrl: String,
    searchBase: String,
    userBase: Option[String] = None,
    groupFilter: Option[String] = None,
    adminGroupFilter: Option[String] = None,
    searchFilter: String = "(mail=${username})",
    adminUsername: Option[String] = None,
    adminPassword: Option[String] = None,
    nameField: String = "cn",
    emailField: String = "mail",
    pictureField: Option[String] = None
) {
  def asJson = Json.obj(
    "type"    -> "ldap",
    "sessionMaxAge"    -> this.sessionMaxAge,
    "serverUrl"        -> this.serverUrl,
    "searchBase"       -> this.searchBase,
    "userBase"         -> this.userBase.map(JsString.apply).getOrElse(JsNull).as[JsValue],
    "groupFilter"      -> this.groupFilter.map(JsString.apply).getOrElse(JsNull).as[JsValue],
    "adminGroupFilter" -> this.adminGroupFilter.map(JsString.apply).getOrElse(JsNull).as[JsValue],
    "searchFilter"     -> this.searchFilter,
    "adminUsername"    -> this.adminUsername.map(JsString.apply).getOrElse(JsNull).as[JsValue],
    "adminPassword"    -> this.adminPassword.map(JsString.apply).getOrElse(JsNull).as[JsValue],
    "nameField"        -> this.nameField,
    "emailField"       -> this.emailField,
    "pictureField"     -> this.pictureField.map(JsString.apply).getOrElse(JsNull).as[JsValue],
  )
}

object LdapSupport {

  def bindUser(username: String, password: String, tenant: Tenant, _env: Env)(
      implicit ec: ExecutionContext
  ): Future[Option[User]] = {

    import java.util

    import javax.naming._
    import javax.naming.directory._
    import javax.naming.ldap._

    import collection.JavaConverters._

    val ldapConfig = LdapConfig.fromJsons(tenant.authProviderSettings)

    val env = new util.Hashtable[String, AnyRef]
    env.put(Context.SECURITY_AUTHENTICATION, "simple")
    ldapConfig.adminUsername.foreach(u => env.put(Context.SECURITY_PRINCIPAL, u))
    ldapConfig.adminPassword.foreach(p => env.put(Context.SECURITY_CREDENTIALS, p))
    env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
    env.put(Context.PROVIDER_URL, ldapConfig.serverUrl)

    val ctx = new InitialLdapContext(env, Array.empty[Control])

    val searchControls = new SearchControls()
    searchControls.setSearchScope(SearchControls.SUBTREE_SCOPE)

    val usersInGroup: Seq[String] = ldapConfig.groupFilter
      .map { filter =>
        val groupSearch = ctx.search(ldapConfig.searchBase, filter, searchControls)
        val uids = if (groupSearch.hasMore) {
          val item  = groupSearch.next()
          val attrs = item.getAttributes
          attrs.getAll.asScala.toSeq.filter(a => a.getID == "uniqueMember" || a.getID == "member").flatMap { attr =>
            attr.getAll.asScala.toSeq.map(_.toString)
          }
        } else {
          Seq.empty[String]
        }
        groupSearch.close()
        uids
      }
      .getOrElse(Seq.empty[String])
    val usersInAdminGroup: Seq[String] = ldapConfig.adminGroupFilter
      .map { filter =>
        val groupSearch = ctx.search(ldapConfig.searchBase, filter, searchControls)
        val uids = if (groupSearch.hasMore) {
          val item  = groupSearch.next()
          val attrs = item.getAttributes
          attrs.getAll.asScala.toSeq.filter(a => a.getID == "uniqueMember" || a.getID == "member").flatMap { attr =>
            attr.getAll.asScala.toSeq.map(_.toString)
          }
        } else {
          Seq.empty[String]
        }
        groupSearch.close()
        uids
      }
      .getOrElse(Seq.empty[String])
    val res = ctx.search(ldapConfig.userBase.map(_ + ",").getOrElse("") + ldapConfig.searchBase,
                         ldapConfig.searchFilter.replace("${username}", username),
                         searchControls)
    val boundUser: Future[Option[User]] = if (res.hasMore) {
      val item = res.next()
      val dn   = item.getNameInNamespace
      if (ldapConfig.adminGroupFilter.map(_ => usersInAdminGroup.contains(dn)).getOrElse(false)) {
        val attrs = item.getAttributes
        val env2  = new util.Hashtable[String, AnyRef]
        env2.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
        env2.put(Context.PROVIDER_URL, ldapConfig.serverUrl)
        env2.put(Context.SECURITY_AUTHENTICATION, "simple")
        env2.put(Context.SECURITY_PRINCIPAL, dn)
        env2.put(Context.SECURITY_CREDENTIALS, password)
        scala.util.Try {
          val ctx2 = new InitialDirContext(env2)
          ctx2.close()
          // Auth passed
          val email = attrs.get(ldapConfig.emailField).toString.split(":").last.trim
          val name = attrs.get(ldapConfig.nameField).toString.split(":").last.trim
          _env.dataStore.userRepo
            .findOne(
              Json.obj(
                "_delete" -> false,
                "email" -> email
              )
            )
            .flatMap {
              case Some(user) => {
                val newUser = user.copy(
                  name = name,
                  email = email,
                  tenants = user.tenants + tenant.id,
                  origins = user.origins + AuthProvider.LDAP,
                  picture = ldapConfig.pictureField
                    .map(f => attrs.get(f).toString.split(":").last.trim)
                    .getOrElse(email.gravatar),
                  // TODO: handle isDaikokuAdmin
                  isDaikokuAdmin = true,
                  lastTenant = Some(tenant.id),
                  personalToken = Some(IdGenerator.token(32))
                )
                for {
                  _ <- _env.dataStore.userRepo.save(newUser)
                } yield {
                  Some(newUser)
                }
              }
              case None => {
                val userId = UserId(BSONObjectID.generate().stringify)
                val team = Team(
                  id = TeamId(BSONObjectID.generate().stringify),
                  tenant = tenant.id,
                  `type` = TeamType.Personal,
                  name = s"$name",
                  description = s"The personal team of $name",
                  users = Set(UserWithPermission(userId, Administrator)),
                  subscriptions = Seq.empty,
                  authorizedOtoroshiGroups = Set.empty
                )
                val user = User(
                  id = userId,
                  tenants = Set(tenant.id),
                  origins = Set(AuthProvider.LDAP),
                  name = name,
                  email = email,
                  picture = ldapConfig.pictureField
                    .map(f => attrs.get(f).toString.split(":").last.trim)
                    .getOrElse(email.gravatar),
                  // TODO: handle isDaikokuAdmin
                  isDaikokuAdmin = true,
                  lastTenant = Some(tenant.id),
                  personalToken = Some(IdGenerator.token(32)),
                  defaultLanguage = None
                  // lastTeams = Map((tenant.id, team.id))
                )
                for {
                  _ <- _env.dataStore.teamRepo.forTenant(tenant.id).save(team)
                  _ <- _env.dataStore.userRepo.save(user)
                } yield {
                  Some(user)
                }
              }
            }
        } recover {
          case _ => FastFuture.successful(None)
        } get
      } else if (ldapConfig.groupFilter.map(_ => usersInGroup.contains(dn)).getOrElse(true)) {
        val attrs = item.getAttributes
        val env2  = new util.Hashtable[String, AnyRef]
        env2.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
        env2.put(Context.PROVIDER_URL, ldapConfig.serverUrl)
        env2.put(Context.SECURITY_AUTHENTICATION, "simple")
        env2.put(Context.SECURITY_PRINCIPAL, dn)
        env2.put(Context.SECURITY_CREDENTIALS, password)
        scala.util.Try {
          val ctx2 = new InitialDirContext(env2)
          ctx2.close()
          // Auth passed
          val email = attrs.get(ldapConfig.emailField).toString.split(":").last.trim
          val name = attrs.get(ldapConfig.nameField).toString.split(":").last.trim
          _env.dataStore.userRepo
            .findOne(
              Json.obj(
                "_deleted" -> false,
                "email" -> email
              )
            )
            .flatMap {
              case Some(user) => {
                val newUser = user.copy(
                  name = name,
                  email = email,
                  tenants = user.tenants + tenant.id,
                  origins = user.origins + AuthProvider.LDAP,
                  picture = ldapConfig.pictureField
                    .map(f => attrs.get(f).toString.split(":").last.trim)
                    .getOrElse(email.gravatar),
                  lastTenant = Some(tenant.id)
                )
                for {
                  _ <- _env.dataStore.userRepo.save(newUser)
                } yield {
                  Some(newUser)
                }
              }
              case None => {
                val userId = UserId(BSONObjectID.generate().stringify)
                val team = Team(
                  id = TeamId(BSONObjectID.generate().stringify),
                  tenant = tenant.id,
                  `type` = TeamType.Personal,
                  name = s"$name",
                  description = s"The personal team of $name",
                  users = Set(UserWithPermission(userId, Administrator)),
                  subscriptions = Seq.empty,
                  authorizedOtoroshiGroups = Set.empty
                )
                val user = User(
                  id = userId,
                  tenants = Set(tenant.id),
                  origins = Set(AuthProvider.LDAP),
                  name = name,
                  email = email,
                  picture = ldapConfig.pictureField
                    .map(f => attrs.get(f).toString.split(":").last.trim)
                    .getOrElse(email.gravatar),
                  isDaikokuAdmin = false,
                  lastTenant = Some(tenant.id),
                  personalToken = Some(IdGenerator.token(32)),
                  defaultLanguage = None
                  // lastTeams = Map((tenant.id, team.id))
                )
                for {
                  _ <- _env.dataStore.teamRepo.forTenant(tenant.id).save(team)
                  _ <- _env.dataStore.userRepo.save(user)
                } yield {
                  Some(user)
                }
              }
            }
        } recover {
          case _ => FastFuture.successful(None)
        } get
      } else {
        FastFuture.successful(None)
      }
    } else {
      FastFuture.successful(None)
    }
    res.close()
    ctx.close()
    boundUser
  }
}
