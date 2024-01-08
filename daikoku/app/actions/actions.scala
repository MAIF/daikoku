package fr.maif.otoroshi.daikoku.actions

import org.apache.pekko.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.{IdentityAttrs, TenantHelper}
import fr.maif.otoroshi.daikoku.utils.Errors
import play.api.Logger
import play.api.libs.json.{JsString, JsValue, Json}
import play.api.mvc._

import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}

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

case class DaikokuActionContext[A](
    request: Request[A],
    user: User,
    tenant: Tenant,
    session: UserSession,
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
          env,
          tenant
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
            Results.Redirect("/")
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
          env,
          tenant
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
            Results.Redirect("/")
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
          env,
          tenant
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
            Results.Redirect("/")
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
