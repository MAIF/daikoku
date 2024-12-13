package fr.maif.otoroshi.daikoku.utils

import fr.maif.otoroshi.daikoku.domain.{CmsPageId, Tenant}
import fr.maif.otoroshi.daikoku.env.Env
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.{Lang, MessagesApi}
import play.api.libs.json.{JsString, JsValue, Json}
import services.CmsPage

import scala.concurrent.{ExecutionContext, Future}

class Translator {

  private def getTranslation(
      key: String,
      tenant: Tenant
  )(implicit
      messagesApi: MessagesApi,
      language: String,
      env: Env
  ): Future[String]= {
    implicit val ec = env.defaultExecutionContext

    env.dataStore.translationRepo
      .forTenant(tenant)
      .findOne(Json.obj("key" -> key, "language" -> language.toLowerCase))
      .map {
        case None => messagesApi(key)(lang = Lang(language.toLowerCase))
        case Some(translation) => translation.value
      }
  }

  def translate(
      key: String,
      tenant: Tenant,
      args: Map[String, JsValue] = Map.empty
  )(implicit
      messagesApi: MessagesApi,
      language: String,
      env: Env
  ): Future[String] = {
    implicit val ec = env.defaultExecutionContext

    val body = if (key.startsWith("mail")) {
      env.dataStore.cmsRepo
        .forTenant(tenant)
        .findOne(Json.obj("_id" -> s".mails.$key.${language.toLowerCase}".replaceAll("\\.", "-")))
        .flatMap {
          case None =>
            getTranslation(key, tenant)
          case Some(cmsPage) =>
            FastFuture.successful(cmsPage.body)

        }
    } else {
      getTranslation(key, tenant)
    }

    renderTranslationAsCmsPage(body, tenant, args)
  }

  def renderTranslationAsCmsPage(value: Future[String],
                                 tenant: Tenant,
                                 args: Map[String, JsValue] = Map.empty)
  (implicit
      env: Env,
      messagesApi: MessagesApi
  ): Future[String] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext
    value
      .map(value => replaceVariables(value, args))
      .flatMap(content => {
          val page = CmsPage(
            id = CmsPageId(IdGenerator.token(32)),
            tenant = tenant.id,
            visible = true,
            authenticated = false,
            name = "#generated",
            forwardRef = None,
            tags = List(),
            metadata = Map(),
            contentType = "text/html",
            body = content,
            path = Some("/")
          )

        page.render(
          page.maybeWithoutUserToUserContext(tenant),
          req = None,
          fields = args
        )
    }.map(_._1))
  }

  def replaceVariables(value: String, args: Map[String, JsValue]): String = {
      args.foldLeft(value) { (acc, a) =>
        acc.replace(s"[${a._1}]", a._2 match {
          case JsString(value) => value
          case value => value.toString()
        })
      }
  }

   def _getMailTemplate(key: String, tenant: Tenant, args: Map[String, JsValue])(implicit
      language: String,
      env: Env,
      messagesApi: MessagesApi
  ): Future[String] = {
     implicit val ec: ExecutionContext = env.defaultExecutionContext

     env.dataStore.translationRepo
       .forTenant(tenant)
       .findOne(Json.obj("key" -> key, "language" -> language.toLowerCase))
       .flatMap {
         case None =>
           tenant.mailerSettings match {
             case None => translate(key, tenant, args)
             case Some(mailer) =>
               mailer.template
                 .map(t => FastFuture.successful(t))
                 .getOrElse(
                   translate(key, tenant, args)
                 )
           }
         case Some(translation) => FastFuture.successful(translation.value)
       }
   }

  def getMailTemplate(key: String, tenant: Tenant, args: Map[String, JsValue])(implicit
      language: String,
      env: Env,
      messagesApi: MessagesApi
  ): Future[String] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext

    env.dataStore.cmsRepo
      .forTenant(tenant)
      .findOne(Json.obj("_id" -> s".mails.root.$key.${language.toLowerCase}".replaceAll("\\.", "-")))
      .flatMap {
        case None => _getMailTemplate(key, tenant, args)
        case Some(cmsPage) =>
          renderTranslationAsCmsPage(FastFuture.successful(cmsPage.body), tenant, args)
      }
  }
}
