package fr.maif.otoroshi.daikoku.utils

import fr.maif.otoroshi.daikoku.domain.Tenant
import fr.maif.otoroshi.daikoku.env.Env
import play.api.i18n.{Lang, MessagesApi}
import play.api.libs.json.Json

import scala.concurrent.Future

class Translator {
  def translate(key: String, language: String, args: Map[String, String] = Map.empty)(implicit messagesApi: MessagesApi, env: Env, tenant: Tenant): Future[String] = {
    implicit val ec = env.defaultExecutionContext
    implicit val mat = env.defaultMaterializer

    env.dataStore.translationRepo.forTenant(tenant)
      .findOne(Json.obj("key" -> key, "language" -> language.toLowerCase))
      .map {
        case None => messagesApi(key)(lang = Lang(language.toLowerCase))
        case Some(translation) => translation.value
      }
      .map { value =>
          args.foldLeft(value) {
            (acc, a) => acc.replace(s"[${a._1}]", a._2)
          }
      }
  }
}
