package fr.maif.otoroshi.daikoku.actions

import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.{IdentityAttrs, TenantHelper}
import fr.maif.otoroshi.daikoku.utils.Errors
import play.api.Logger
import play.api.mvc._

import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}

case class DaikokuTenantActionContext[A](request: Request[A], tenant: Tenant)

case class DaikokuActionMaybeWithoutUserContext[A](
    request: Request[A],
    user: Option[User],
    tenant: Tenant,
    session: Option[UserSession],
    impersonator: Option[User],
    isTenantAdmin: Boolean,
    ctx: TrieMap[String, String] = new TrieMap[String, String]()) {
  def setCtxValue(key: String, value: Any): Unit = {
    if (value != null) {
      ctx.put(key, value.toString)
    }
  }
}

case class DaikokuActionContext[A](request: Request[A],
                                   user: User,
                                   tenant: Tenant,
                                   session: UserSession,
                                   impersonator: Option[User],
                                   isTenantAdmin: Boolean,
                                   ctx: TrieMap[String, String] =
                                     new TrieMap[String, String]()) {
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
      block: DaikokuActionContext[A] => Future[Result]): Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), Some(session), Some(imper), Some(user), Some(isTenantAdmin)) =>
        if (user.tenants.contains(tenant.id)) {
          block(DaikokuActionContext(request, user, tenant, session, imper, isTenantAdmin))
        } else {
          logger.info(
            s"User ${user.email} is not registered on tenant ${tenant.name}")
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect("/")
          }
        }
      case _ =>
        Errors.craftResponseResult("User not found :-(",
                                   Results.NotFound,
                                   request,
                                   None,
                                   env)
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

//todo: maybe some refactoring
class DaikokuActionMaybeWithGuest(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuActionContext, AnyContent] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  val logger = Logger("daikoku-action-with-guest")

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionContext[A] => Future[Result]): Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), Some(session), Some(imper), Some(user), Some(isTenantAdmin)) =>
        if (user.tenants.contains(tenant.id)) {
          block(DaikokuActionContext(request, user, tenant, session, imper, isTenantAdmin))
        } else {
          logger.info(s"User ${user.email} is not registered on tenant ${tenant.name}")
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect("/")
          }
        }
      case (Some(tenant), _, _, _, _) if tenant.isPrivate =>
        Errors.craftResponseResult("This tenant is private, bye bye.",
                                   Results.Unauthorized,
                                   request,
                                   None,
                                   env)
      case (Some(tenant), None, _, Some(user), Some(isTenantAdmin)) =>
        block(
          DaikokuActionContext(request,
                               user,
                               tenant,
                               GuestUserSession(user, tenant),
                               None,
                               isTenantAdmin))
      case (Some(tenant), None, _, None, _) if !tenant.isPrivate =>
        val guestUser = GuestUser(tenant.id)
        block(
          DaikokuActionContext(request,
                               guestUser,
                               tenant,
                               GuestUserSession(guestUser, tenant),
                               None,
                               isTenantAdmin = false))
      case _ =>
        Errors.craftResponseResult("User not found :-(",
                                   Results.NotFound,
                                   request,
                                   None,
                                   env)
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuActionMaybeWithoutUser(val parser: BodyParser[AnyContent],
                                    env: Env)
    extends ActionBuilder[DaikokuActionMaybeWithoutUserContext, AnyContent]
    with ActionFunction[Request, DaikokuActionMaybeWithoutUserContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  val logger = Logger("daikoku-action-maybe-without-user")

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionMaybeWithoutUserContext[A] => Future[Result])
    : Future[Result] = {
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), Some(session), Some(imper), Some(user), Some(isTenantAdmin)) =>
        if (user.tenants.contains(tenant.id)) {
          block(
            DaikokuActionMaybeWithoutUserContext(request,
                                                 Some(user),
                                                 tenant,
                                                 Some(session),
                                                 imper,
                                                 isTenantAdmin))
        } else {
          logger.info(
            s"User ${user.email} is not registered on tenant ${tenant.name}")
          session.invalidate()(ec, env).map { _ =>
            Results.Redirect("/")
          }
        }
      case (Some(tenant), _, _, _, _) if tenant.isPrivate =>
        block(
          DaikokuActionMaybeWithoutUserContext(request,
                                               None,
                                               tenant,
                                               None,
                                               None,
                                               isTenantAdmin = false))
      case (Some(tenant), _, _, _, _) =>
        val user = GuestUser(tenant.id)
        block(
          DaikokuActionMaybeWithoutUserContext(
            request,
            Some(user),
            tenant,
            Some(GuestUserSession(user, tenant)),
            None,
            isTenantAdmin = false))
      case _ =>
        Errors.craftResponseResult("Tenant not found :-(",
                                   Results.NotFound,
                                   request,
                                   None,
                                   env)
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
      block: DaikokuTenantActionContext[A] => Future[Result])
    : Future[Result] = {

    TenantHelper.withTenant(request, env) { tenant =>
      block(DaikokuTenantActionContext[A](request, tenant))
    }
  }

  override protected def executionContext: ExecutionContext = ec
}
