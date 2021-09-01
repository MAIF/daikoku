package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.domain.Tenant
import fr.maif.otoroshi.daikoku.env.Env
import play.api.i18n.{Lang, MessagesApi}
import play.api.libs.json.Json

import scala.concurrent.Future

class Translator {
  def translate(key: String,
                tenant: Tenant,
                args: Map[String, String] = Map.empty)(
      implicit messagesApi: MessagesApi,
      language: String,
      env: Env): Future[String] = {
    implicit val ec = env.defaultExecutionContext
    implicit val mat = env.defaultMaterializer

    env.dataStore.translationRepo
      .forTenant(tenant)
      .findOne(Json.obj("key" -> key, "language" -> language.toLowerCase))
      .map {
        case None              => messagesApi(key)(lang = Lang(language.toLowerCase))
        case Some(translation) => translation.value
      }
      .map { value =>
        args.foldLeft(value) { (acc, a) =>
          acc.replace(s"[${a._1}]", a._2)
        }
      }
  }

  def getMailTemplate(key: String, tenant: Tenant)(
      implicit language: String,
      env: Env,
      messagesApi: MessagesApi): Future[String] = {
    implicit val ec = env.defaultExecutionContext
    implicit val mat = env.defaultMaterializer

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
                  translate(key, tenant, Map("email" -> defaultTemplate)))
          }
        case Some(translation) => FastFuture.successful(translation.value)
      }
  }
}
