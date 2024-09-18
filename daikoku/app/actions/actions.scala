package fr.maif.otoroshi.daikoku.actions

import org.apache.pekko.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import com.auth0.jwt.JWT
import com.google.common.base.Charsets
import fr.maif.otoroshi.daikoku.ctrls.CmsApiActionContext
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.{
  Env,
  LocalCmsApiConfig,
  OtoroshiCmsApiConfig
}
import fr.maif.otoroshi.daikoku.login.{IdentityAttrs, TenantHelper}
import fr.maif.otoroshi.daikoku.utils.Errors
import fr.maif.otoroshi.daikoku.utils.RequestImplicits.EnhancedRequestHeader
import play.api.Logger
import play.api.libs.json.{JsString, JsValue, Json}
import play.api.mvc._

import java.util.Base64
import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

object tenantSecurity {
  def userCanCreateApi(tenant: Tenant, user: User)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Boolean] = {
    if (user.isDaikokuAdmin) {
      FastFuture.successful(true)
    } else {
      tenant.creationSecurity
        .map {
          case true =>
            env.dataStore.teamRepo
              .forTenant(tenant)
              .find(Json.obj("apisCreationPermission" -> true))
              .map { teams =>
                if (teams.isEmpty)
                  false
                else
                  teams.exists { team =>
                    team.users.exists { u: UserWithPermission =>
                      user.id == u.userId && (
                        u.teamPermission.name == Administrator.name ||
                        u.teamPermission.name == ApiEditor.name
                      )
                    }
                  }
              }
          case false => FastFuture.successful(true)
        }
        .getOrElse(FastFuture.successful(true))
    }
  }

  def isDefaultMode(
      tenant: Tenant,
      user: Option[User],
      isTenantAdmin: Option[Boolean]
  ): Boolean = {
    tenant.tenantMode match {
      case None => true
      case Some(value) =>
        value match {
          case TenantMode.Maintenance | TenantMode.Construction =>
            user.exists(_.isDaikokuAdmin) || isTenantAdmin.getOrElse(false)
          case _ => true
        }
    }
  }

}

case class DaikokuTenantActionContext[A](
    request: Request[A],
    tenant: Tenant,
    ctx: TrieMap[String, String] = new TrieMap[String, String]()
) {
  def setCtxValue(key: String, value: Any): Unit = {
    if (value != null) {
      ctx.put(key, value.toString)
    }
  }
}

case class DaikokuActionMaybeWithoutUserContext[A](
    request: Request[A],
    user: Option[User],
    tenant: Tenant,
    session: Option[UserSession],
    impersonator: Option[User],
    isTenantAdmin: Boolean,
    apiCreationPermitted: Boolean = false,
    ctx: TrieMap[String, String] = new TrieMap[String, String]()
) {
  def setCtxValue(key: String, value: Any): Unit = {
    if (value != null) {
      ctx.put(key, value.toString)
    }
  }
}

trait ApiActionContext[A] {
  def request: Request[A]
  def user: User
  def tenant: Tenant
  def ctx: TrieMap[String, String] = new TrieMap[String, String]()
}

case class DaikokuActionContext[A](
                                    request: Request[A],
                                    user: User,
                                    tenant: Tenant,
                                    session: UserSession,
                                    impersonator: Option[User],
                                    isTenantAdmin: Boolean,
                                    apiCreationPermitted: Boolean = false,
                                    override val ctx: TrieMap[String, String] = new TrieMap[String, String]()
                                  ) extends ApiActionContext[A] {
  def setCtxValue(key: String, value: Any): Unit = {
    if (value != null) {
      ctx.put(key, value.toString)
    }
  }
}

class CmsApiAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[CmsApiActionContext, AnyContent]
    with ActionFunction[Request, CmsApiActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext

  def decodeBase64(encoded: String): String =
    new String(Base64.getUrlDecoder.decode(encoded), Charsets.UTF_8)
  private def extractUsernamePassword(
      header: String
  ): Option[(String, String)] = {
    val base64 = header.replace("Basic ", "").replace("basic ", "")
    Option(base64)
      .map(decodeBase64)
      .map(_.split(":").toSeq)
      .flatMap(a =>
        a.headOption.flatMap(head => a.lastOption.map(last => (head, last)))
      )
  }

  override def invokeBlock[A](
      request: Request[A],
      block: CmsApiActionContext[A] => Future[Result]
  ): Future[Result] = {
    TenantHelper.withTenant(request, env) { tenant =>
      env.config.cmsApiConfig match {
        case OtoroshiCmsApiConfig(headerName, algo) =>
          request.headers.get(headerName) match {
            case Some(value) =>
              Try(JWT.require(algo).build().verify(value)) match {
                case Success(decoded) if !decoded.getClaim("apikey").isNull =>
                  block(CmsApiActionContext[A](request, tenant))
                case _ =>
                  Errors.craftResponseResult(
                    "No api key provided",
                    Results.Unauthorized,
                    request,
                    None,
                    env
                  )
              }
            case _ =>
              Errors.craftResponseResult(
                "No api key provided",
                Results.Unauthorized,
                request,
                None,
                env
              )
          }
        case LocalCmsApiConfig(_) =>
          request.headers.get("Authorization") match {
            case Some(auth) if auth.startsWith("Basic ") =>
              extractUsernamePassword(auth) match {
                case None =>
                  Errors.craftResponseResult(
                    "No api key provided",
                    Results.Unauthorized,
                    request,
                    None,
                    env
                  )
                case Some((clientId, clientSecret)) =>
                  env.dataStore.apiSubscriptionRepo
                    .forTenant(tenant)
                    .findNotDeleted(
                      Json.obj(
                        "apiKey.clientId" -> clientId,
                        "apiKey.clientSecret" -> clientSecret
                      )
                    )
                    .map(_.length == 1)
                    .flatMap({
                      case done if done =>
                        block(CmsApiActionContext[A](request, tenant))
                      case _ =>
                        Errors.craftResponseResult(
                          "No api key provided",
                          Results.Unauthorized,
                          request,
                          None,
                          env
                        )
                    })
              }
            case _ =>
              Errors.craftResponseResult(
                "No api key provided",
                Results.Unauthorized,
                request,
                None,
                env
              )
          }
      }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuActionContext, AnyContent]
    with ActionFunction[Request, DaikokuActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  val logger = Logger("daikoku-action")

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionContext[A] => Future[Result]
  ): Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), _, _, Some(user), isTenantAdmin)
          if !tenantSecurity.isDefaultMode(tenant, user.some, isTenantAdmin) =>
        Errors.craftResponseResult(
          s"${tenant.tenantMode.get.toString} mode enabled",
          Results.ServiceUnavailable,
          request,
          None,
          env
        )
      case (
            Some(tenant),
            Some(session),
            Some(imper),
            Some(user),
            Some(isTenantAdmin)
          ) =>
        if (user.tenants.contains(tenant.id)) {
          tenantSecurity
            .userCanCreateApi(tenant, user)(env, ec)
            .flatMap(permission =>
              block(
                DaikokuActionContext(
                  request,
                  user,
                  tenant,
                  session,
                  imper,
                  isTenantAdmin,
                  permission
                )
              )
            )
        } else {
          logger.info(
            s"User ${user.email} is not registered on tenant ${tenant.name}"
          )
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect(env.getDaikokuUrl(tenant, "/"))
          }
        }
      case _ =>
        Errors.craftResponseResult(
          "User not found :-(",
          Results.NotFound,
          request,
          None,
          env
        )
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuActionMaybeWithGuest(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuActionContext, AnyContent] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  val logger = Logger("daikoku-action-with-guest")

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionContext[A] => Future[Result]
  ): Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), _, _, Some(user), isTenantAdmin)
          if !tenantSecurity.isDefaultMode(tenant, user.some, isTenantAdmin) =>
        Errors.craftResponseResult(
          s"${tenant.tenantMode.get.toString} mode enabled",
          Results.ServiceUnavailable,
          request,
          None,
          env
        )
      case (
            Some(tenant),
            Some(session),
            Some(imper),
            Some(user),
            Some(isTenantAdmin)
          ) =>
        if (user.tenants.contains(tenant.id)) {
          tenantSecurity
            .userCanCreateApi(tenant, user)(env, ec)
            .flatMap(security =>
              block(
                DaikokuActionContext(
                  request,
                  user,
                  tenant,
                  session,
                  imper,
                  isTenantAdmin,
                  security
                )
              )
            )
        } else {
          logger.info(
            s"User ${user.email} is not registered on tenant ${tenant.name}"
          )
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect(env.getDaikokuUrl(tenant, "/"))
          }
        }
      case (Some(tenant), _, _, _, _) if tenant.isPrivate =>
        Errors.craftResponseResult(
          "This tenant is private, bye bye.",
          Results.Unauthorized,
          request,
          None,
          env
        )
      case (Some(tenant), None, _, Some(user), Some(isTenantAdmin)) =>
        block(
          DaikokuActionContext(
            request,
            user,
            tenant,
            GuestUserSession(user, tenant),
            None,
            isTenantAdmin
          )
        )
      case (Some(tenant), None, _, None, _) if !tenant.isPrivate =>
        val guestUser = GuestUser(tenant.id)
        block(
          DaikokuActionContext(
            request,
            guestUser,
            tenant,
            GuestUserSession(guestUser, tenant),
            None,
            isTenantAdmin = false
          )
        )
      case _ =>
        Errors.craftResponseResult(
          "User not found :-(",
          Results.NotFound,
          request,
          None,
          env
        )
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuActionMaybeWithoutUser(
    val parser: BodyParser[AnyContent],
    env: Env
) extends ActionBuilder[DaikokuActionMaybeWithoutUserContext, AnyContent]
    with ActionFunction[Request, DaikokuActionMaybeWithoutUserContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  val logger = Logger("daikoku-action-maybe-without-user")

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionMaybeWithoutUserContext[A] => Future[Result]
  ): Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), _, _, maybeUser, isTenantAdmin)
          if !tenantSecurity.isDefaultMode(tenant, maybeUser, isTenantAdmin) =>
        Errors.craftResponseResult(
          s"${tenant.tenantMode.get.toString} mode enabled",
          Results.ServiceUnavailable,
          request,
          None,
          env
        )
      case (
            Some(tenant),
            Some(session),
            Some(imper),
            Some(user),
            Some(isTenantAdmin)
          ) =>
        if (user.tenants.contains(tenant.id)) {
          tenantSecurity
            .userCanCreateApi(tenant, user)(env, ec)
            .flatMap(perm =>
              block(
                DaikokuActionMaybeWithoutUserContext(
                  request,
                  Some(user),
                  tenant,
                  Some(session),
                  imper,
                  isTenantAdmin,
                  perm
                )
              )
            )
        } else {
          logger.info(
            s"User ${user.email} is not registered on tenant ${tenant.name}"
          )
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect(env.getDaikokuUrl(tenant, "/"))
          }
        }
      case (Some(tenant), _, _, _, _) if tenant.isPrivate =>
        block(
          DaikokuActionMaybeWithoutUserContext(
            request,
            None,
            tenant,
            None,
            None,
            isTenantAdmin = false
          )
        )
      case (Some(tenant), _, _, _, _) =>
        val user = GuestUser(tenant.id)
        block(
          DaikokuActionMaybeWithoutUserContext(
            request,
            Some(user),
            tenant,
            Some(GuestUserSession(user, tenant)),
            None,
            isTenantAdmin = false
          )
        )
      case _ =>
        Errors.craftResponseResult(
          "Tenant not found :-(",
          Results.NotFound,
          request,
          None,
          env
        )
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuTenantAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuTenantActionContext, AnyContent]
    with ActionFunction[Request, DaikokuTenantActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuTenantActionContext[A] => Future[Result]
  ): Future[Result] = {
    request.attrs.get(IdentityAttrs.TenantKey) match {
      case Some(tenant) => block(DaikokuTenantActionContext[A](request, tenant))
      case None =>
        TenantHelper.withTenant(request, env) { tenant =>
          block(DaikokuTenantActionContext[A](request, tenant))
        }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}
