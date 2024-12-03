package fr.maif.otoroshi.daikoku.utils

import org.apache.pekko.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.domain.Tenant
import fr.maif.otoroshi.daikoku.env.Env
import play.api.i18n.{Lang, MessagesApi}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

class Translator {

  private def getTranslation(
      key: String,
      tenant: Tenant,
      args: Map[String, String] = Map.empty
  )(implicit
      messagesApi: MessagesApi,
      language: String,
      env: Env
  ): Future[String]= {
    implicit val ec = env.defaultExecutionContext
    implicit val mat = env.defaultMaterializer

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
      args: Map[String, String] = Map.empty
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
            getTranslation(key, tenant, args)
          case Some(cmsPage) =>
            FastFuture.successful(cmsPage.body)

        }
    } else {
      getTranslation(key, tenant, args)
    }

    body.map { value =>
      args.foldLeft(value) { (acc, a) =>
        acc.replace(s"[${a._1}]", a._2)
      }
    }
  }

   def _getMailTemplate(key: String, tenant: Tenant)(implicit
      language: String,
      env: Env,
      messagesApi: MessagesApi
  ): Future[String] = {
     implicit val ec: ExecutionContext = env.defaultExecutionContext

     val defaultTemplate = "{{email}}"

     env.dataStore.translationRepo
       .forTenant(tenant)
       .findOne(Json.obj("key" -> key, "language" -> language.toLowerCase))
       .flatMap {
         case None =>
           tenant.mailerSettings match {
             case None => translate(key, tenant, Map("email" -> defaultTemplate))
             case Some(mailer) =>
               mailer.template
                 .map(t => FastFuture.successful(t))
                 .getOrElse(
                   translate(key, tenant, Map("email" -> defaultTemplate))
                 )
           }
         case Some(translation) => FastFuture.successful(translation.value)
       }
   }

  def getMailTemplate(key: String, tenant: Tenant)(implicit
      language: String,
      env: Env,
      messagesApi: MessagesApi
  ): Future[String] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext

    env.dataStore.cmsRepo
        .forTenant(tenant)
        .findOne(Json.obj("_id" -> s".mails.root.$key.${language.toLowerCase}".replaceAll("\\.", "-")))
        .flatMap {
          case None => _getMailTemplate(key, tenant)
          case Some(cmsPage) =>
            FastFuture.successful(cmsPage.body)
        }
  }
}
