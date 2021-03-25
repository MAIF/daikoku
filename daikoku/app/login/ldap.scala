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

import javax.naming.CommunicationException
import javax.naming.ldap.{Control, InitialLdapContext}
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.EnumerationHasAsScala
import scala.util.{Failure, Success, Try}

object LdapConfig {

  lazy val logger: Logger = Logger("ldap-config")

  def fromJsons(value: JsValue): LdapConfig =
    try {
      _fmt.reads(value).get
    } catch {
      case e: Throwable =>
        logger.error(s"Try to deserialize ${Json.prettyPrint(value)}")
        throw e
    }

  val _fmt: Format[LdapConfig] = new Format[LdapConfig] {

    override def reads(json: JsValue): JsResult[LdapConfig] =
      fromJson(json) match {
        case Left(e)  => JsError(e.getMessage)
        case Right(v) => JsSuccess(v.asInstanceOf[LdapConfig])
      }

    override def writes(o: LdapConfig): JsObject = o.asJson
  }

  def fromJson(json: JsValue): Either[Throwable, LdapConfig] =
    Try {
      Right(
        LdapConfig(
          sessionMaxAge = (json \ "sessionMaxAge").asOpt[Int].getOrElse(86400),
          serverUrls = (json \ "serverUrl").asOpt[String] match {
            case Some(url) => Seq(url)
            case None => (json \ "serverUrls").asOpt[Seq[String]].getOrElse(Seq.empty[String])
          },
          searchBase = (json \ "searchBase").as[String],
          userBase = (json \ "userBase").asOpt[String].filterNot(_.trim.isEmpty),
          groupFilter =
            (json \ "groupFilter").asOpt[String].filterNot(_.trim.isEmpty),
          adminGroupFilter =
            (json \ "adminGroupFilter").asOpt[String].filterNot(_.trim.isEmpty),
          searchFilter = (json \ "searchFilter").as[String],
          adminUsername =
            (json \ "adminUsername").asOpt[String].filterNot(_.trim.isEmpty),
          adminPassword =
            (json \ "adminPassword").asOpt[String].filterNot(_.trim.isEmpty),
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
    serverUrls: Seq[String] = Seq.empty[String],
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
  def asJson: JsObject = Json.obj(
    "type" -> "ldap",
    "sessionMaxAge" -> this.sessionMaxAge,
    "serverUrls" -> this.serverUrls,
    "searchBase" -> this.searchBase,
    "userBase" -> this.userBase
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
    "groupFilter" -> this.groupFilter
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
    "adminGroupFilter" -> this.adminGroupFilter
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
    "searchFilter" -> this.searchFilter,
    "adminUsername" -> this.adminUsername
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
    "adminPassword" -> this.adminPassword
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
    "nameField" -> this.nameField,
    "emailField" -> this.emailField,
    "pictureField" -> this.pictureField
      .map(JsString.apply)
      .getOrElse(JsNull)
      .as[JsValue],
  )
}

object LdapSupport {

  import java.util

  import javax.naming._
  import javax.naming.directory._

  private def getLdapContext(principal: String, password: String, url: String): util.Hashtable[String, AnyRef] = {
    val env = new util.Hashtable[String, AnyRef]
    env.put(Context.SECURITY_AUTHENTICATION, "simple")
    env.put(Context.SECURITY_PRINCIPAL, principal)
    env.put(Context.SECURITY_CREDENTIALS, password)
    env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
    env.put(Context.PROVIDER_URL, url)
    env
  }

  private def getInitialLdapContext(principal: String, password: String, url: String) = {
    new InitialLdapContext(getLdapContext(principal, password, url), Array.empty[Control])
  }

  private def getInitialDirContext(principal: String, password: String, url: String) =
    new InitialDirContext(getLdapContext(principal, password, url))

  private def getUsersInGroup(
                               optFilter: Option[String], ctx: InitialLdapContext, searchBase: String,
                               searchControls: SearchControls): Seq[String] = {
    Try {
      optFilter.map { filter =>
        val groupSearch = ctx.search(searchBase, filter, searchControls)
        val uids = if (groupSearch.hasMore) {
          val item = groupSearch.next()
          val attrs = item.getAttributes
          attrs.getAll.asScala.toSeq
            .filter(a => a.getID == "uniqueMember" || a.getID == "member")
            .flatMap { attr =>
              attr.getAll.asScala.toSeq.map(_.toString)
            }
        } else
          Seq.empty[String]
        groupSearch.close()
        uids
      }
        .getOrElse(Seq.empty[String])
    } recover {
      case e => Seq.empty[String]
    } get
  }

  private def getDefaultSearchControls() = {
    val searchControls = new SearchControls()
    searchControls.setSearchScope(SearchControls.SUBTREE_SCOPE)
    searchControls
  }

  private def getPersonalTeam(tenantId: TenantId, name: String, userId: UserId) =
    Team(
      id = TeamId(BSONObjectID.generate().stringify),
      tenant = tenantId,
      `type` = TeamType.Personal,
      name = s"$name",
      description = s"The personal team of $name",
      users = Set(UserWithPermission(userId, Administrator)),
      subscriptions = Seq.empty,
      authorizedOtoroshiGroups = Set.empty
    )

  private def getUser(
                       userId: UserId, tenantId: TenantId, name: String, email: String, pictureField: Option[String],
                       attrs: Attributes, isDaikokuAdmin: Boolean = true
                     ) =
    User(
      id = userId,
      tenants = Set(tenantId),
      origins = Set(AuthProvider.LDAP),
      name = name,
      email = email,
      picture = pictureField
        .map(f => attrs.get(f).toString.split(":").last.trim)
        .getOrElse(email.gravatar),
      isDaikokuAdmin = isDaikokuAdmin,
      lastTenant = Some(tenantId),
      personalToken = Some(IdGenerator.token(32)),
      defaultLanguage = None
    )

  def _bindUser(urls: Seq[String], username: String, password: String, ldapConfig: LdapConfig, tenant: Tenant, _env: Env)(
    implicit ec: ExecutionContext
  ): Either[String, Future[User]] = {
    if (urls.isEmpty)
      Left(s"Missing LDAP server URLs or all down")
    else {
      Try {
        val url = urls.head

        val ctx = getInitialLdapContext(
          ldapConfig.adminUsername.map(u => u).getOrElse(""),
          ldapConfig.adminPassword.map(p => p).getOrElse(""),
          url
        )

        val searchControls = getDefaultSearchControls()

        val usersInGroup: Seq[String] =
          getUsersInGroup(ldapConfig.groupFilter, ctx, ldapConfig.searchBase, searchControls)
        val usersInAdminGroup: Seq[String] =
          getUsersInGroup(ldapConfig.adminGroupFilter, ctx, ldapConfig.searchBase, searchControls)

        val res = ctx.search(
          ldapConfig.userBase.map(_ + ",").getOrElse("") + ldapConfig.searchBase,
          ldapConfig.searchFilter.replace("${username}", username),
          searchControls)

        val boundUser = if (res.hasMore) {
          val item = res.next()

          val dn = item.getNameInNamespace
          val attrs = item.getAttributes
          val email = attrs.get(ldapConfig.emailField).toString.split(":").last.trim
          val name = attrs.get(ldapConfig.nameField).toString.split(":").last.trim

          if (ldapConfig.adminGroupFilter.exists(_ => usersInAdminGroup.contains(dn))) {
              getInitialDirContext(dn, password, url)
                .close()

              Right(_env.dataStore.userRepo.findOne(
                  Json.obj(
                    "_deleted" -> false,
                    "email" -> email
                  ))
                .flatMap {
                  case Some(user) =>
                    val newUser = user.copy(
                      name = name,
                      email = email,
                      tenants = user.tenants + tenant.id,
                      origins = user.origins + AuthProvider.LDAP,
                      picture = ldapConfig.pictureField
                        .map(f => attrs.get(f).toString.split(":").last.trim)
                        .getOrElse(email.gravatar),
                      isDaikokuAdmin = true,
                      lastTenant = Some(tenant.id),
                      personalToken = Some(IdGenerator.token(32))
                    )
                    for {
                      _ <- _env.dataStore.userRepo.save(newUser)
                    } yield {
                      newUser
                    }
                  case None =>
                    val userId = UserId(BSONObjectID.generate().stringify)
                    val team = getPersonalTeam(tenant.id, name, userId)
                    val user = getUser(userId, tenant.id, name, email, ldapConfig.pictureField, attrs)
                    for {
                      _ <- _env.dataStore.teamRepo.forTenant(tenant.id).save(team)
                      _ <- _env.dataStore.userRepo.save(user)
                    } yield {
                      user
                    }
                })
          }
          else if (ldapConfig.groupFilter.forall(_ => usersInGroup.contains(dn))) {
              getInitialDirContext(dn, password, url)
                .close()

              Right(_env.dataStore.userRepo.findOne(
                  Json.obj(
                    "_deleted" -> false,
                    "email" -> email
                  ))
                .flatMap {
                  case Some(user) =>
                    val newUser = user.copy(
                      name = name,
                      email = email,
                      tenants = user.tenants + tenant.id,
                      origins = user.origins + AuthProvider.LDAP,
                      isDaikokuAdmin = false,
                      picture = ldapConfig.pictureField
                        .map(f => attrs.get(f).toString.split(":").last.trim)
                        .getOrElse(email.gravatar),
                      lastTenant = Some(tenant.id)
                    )
                    for {
                      _ <- _env.dataStore.userRepo.save(newUser)
                    } yield {
                      newUser
                    }
                  case None =>
                    val userId = UserId(BSONObjectID.generate().stringify)
                    val team = getPersonalTeam(tenant.id, name, userId)
                    val user = getUser(userId, tenant.id, name, email, ldapConfig.pictureField, attrs)
                    for {
                      _ <- _env.dataStore.teamRepo.forTenant(tenant.id).save(team)
                      _ <- _env.dataStore.userRepo.save(user)
                    } yield {
                      user
                    }
                })
          }
          else {
            Left(s"no user found")
          }
        } else {
          Left(s"no user found")
        }

        res.close()
        ctx.close()
        boundUser
      } recover {
        case _: ServiceUnavailableException | _: CommunicationException =>
          _bindUser(urls.tail, username, password, ldapConfig, tenant, _env)
        case e =>
          println(e.getMessage)
          Left(s"bind failed ${e.getMessage}")
      } get
    }
  }

  def bindUser(username: String, password: String, tenant: Tenant, _env: Env, config: Option[LdapConfig] = None)(
      implicit ec: ExecutionContext
  ): Either[String, Future[User]] = {
    val ldapConfig = config match {
      case Some(l) => l
      case None => LdapConfig.fromJsons(tenant.authProviderSettings)
    }

    _bindUser(ldapConfig.serverUrls.filter(_ => true), username, password, ldapConfig, tenant, _env)
  }

  def checkConnection(config: LdapConfig): Future[(Boolean, String)] = {
    if (config.adminUsername.isEmpty || config.adminUsername.get.trim.isEmpty) {
      FastFuture.successful((false, "Empty admin username are not allowed for this LDAP auth. module"))
    } else  if (config.adminPassword.isEmpty || config.adminPassword.get.trim.isEmpty) {
      FastFuture.successful((false, "Empty admin password are not allowed for this LDAP auth. module"))
    }

    val env = new util.Hashtable[String, AnyRef]
    env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
    env.put(Context.SECURITY_AUTHENTICATION, "simple")
    config.adminUsername.foreach(u => env.put(Context.SECURITY_PRINCIPAL, u))
    config.adminPassword.foreach(p => env.put(Context.SECURITY_CREDENTIALS, p))

    Try {
      for (url <- config.serverUrls) {
        env.put(Context.PROVIDER_URL, url)
        scala.util.Try {
          val ctx2 = new InitialDirContext(env)
          ctx2.close()
        } match {
          case Success(_) => return FastFuture.successful((true, "--"))
          case Failure(_: ServiceUnavailableException | _: CommunicationException) =>
          case Failure(e) => throw e
        }
      }
      FastFuture.successful((false, "Missing LDAP server URLs or all down"))
    } recover {
      case e: Exception => FastFuture.successful((false, e.getMessage))
    } get
  }

  def getUser(email: String, tenant: Tenant) (implicit ec: ExecutionContext): Future[(Boolean, String)] = {
    val ldapConfig = LdapConfig.fromJsons(tenant.authProviderSettings)

    if (ldapConfig.serverUrls.isEmpty) {
      FastFuture.successful((false,"Missing LDAP URLs server"))
    } else {
      FastFuture.successful(
        ldapConfig.serverUrls.find { url =>
          Try {
            val ctx = getInitialLdapContext(
              ldapConfig.adminUsername.map(u => u).getOrElse(""),
              ldapConfig.adminPassword.map(p => p).getOrElse(""),
              url
            )

            val res = ctx.search(
                ldapConfig.userBase.map(_ + ",").getOrElse("") + ldapConfig.searchBase,
                ldapConfig.searchFilter.replace("${username}", email),
                getDefaultSearchControls()
              )

            ctx.close()
            res.asScala.nonEmpty
          } recover {
            case e =>
              println(e)
              false
          } get
        }
          .map(_  => (true, "user found"))
          .getOrElse((false, "Unknown user"))
      )
    }
  }

  def createUser(email: String, urls: Seq[String], ldapConfig: LdapConfig, tenantId: TenantId, env: Env)(
                implicit ec: ExecutionContext
  ): Future[Option[User]] = {
    if (urls.isEmpty)
      FastFuture.successful(None)
    else {
      try {
        val url = urls.head

        val ctx = getInitialLdapContext(
          ldapConfig.adminUsername.map(u => u).getOrElse(""),
          ldapConfig.adminPassword.map(p => p).getOrElse(""),
          url
        )

        val searchControls = getDefaultSearchControls()

        val usersInAdminGroup: Seq[String] =
          getUsersInGroup(ldapConfig.adminGroupFilter, ctx, ldapConfig.searchBase, searchControls)

        val res = ctx.search(
          ldapConfig.userBase.map(_ + ",").getOrElse("") + ldapConfig.searchBase,
          ldapConfig.searchFilter.replace("${username}", email),
          searchControls)

        ctx.close()

        if(res.hasMore) {
          val item = res.next()

          val dn = item.getNameInNamespace
          val attrs = item.getAttributes
          val email = attrs.get(ldapConfig.emailField).toString.split(":").last.trim
          val name = attrs.get(ldapConfig.nameField).toString.split(":").last.trim

          val userId = UserId(BSONObjectID.generate().stringify)
          val user = getUser(userId, tenantId, name, email, ldapConfig.pictureField, attrs,
            ldapConfig.adminGroupFilter.exists(_ => usersInAdminGroup.contains(dn)))
          for {
            _ <- env.dataStore.userRepo.save(user)
          } yield {
            res.close()
            Some(user)
          }
        } else
          FastFuture.successful(None)
      } catch {
        case _: ServiceUnavailableException | _: CommunicationException =>
          createUser(email, urls.tail, ldapConfig, tenantId, env)
        case _ : Throwable => FastFuture.successful(None)
      }
    }
  }
}










