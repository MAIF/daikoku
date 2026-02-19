package fr.maif.daikoku.services

import fr.maif.daikoku.actions.{ApiActionContext}
import fr.maif.daikoku.domain.json.IntlTranslationFormat
import fr.maif.daikoku.domain.{
  DatastoreId,
  IntlTranslation,
  Translation
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.IdGenerator
import play.api.i18n.Langs
import play.api.libs.json.Json
import play.api.mvc.Results._

import scala.concurrent.ExecutionContext

class TranslationsService {

  def getMailTranslations[T](
      ctx: ApiActionContext[T],
      domain: Option[String],
      messagesApi: play.api.i18n.MessagesApi,
      supportedLangs: Langs
  )(implicit
      env: Env
  ) = {

    implicit val ec: ExecutionContext = env.defaultExecutionContext
    implicit val languages: Seq[String] =
      supportedLangs.availables.map(_.language)

    env.dataStore.translationRepo
      .forTenant(ctx.tenant.id)
      .find(
        Json.obj(
          "key" -> Json.obj(
            "$regex" -> s".*${domain.getOrElse("mail")}",
            "$options" -> "-i"
          )
        )
      )
      .map(translations => {
        val defaultTranslations = messagesApi.messages
          .map(v =>
            (
              v._1,
              v._2.filter(k => k._1.startsWith(domain.getOrElse("mail")))
            )
          )
          .flatMap { v =>
            v._2
              .map { case (key, value) =>
                Translation(
                  id = DatastoreId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  language = v._1,
                  key = key,
                  value = value
                )
              }
              .filter(t => languages.contains(t.language))
          }

        Ok(
          Json.obj(
            "translations" -> defaultTranslations
              .map { translation =>
                translations.find(t =>
                  t.key == translation.key && t.language == translation.language
                ) match {
                  case None    => translation
                  case Some(t) => t
                }
              }
              .groupBy(_.key)
              .map(v =>
                IntlTranslationFormat.writes(
                  IntlTranslation(
                    id = v._1,
                    translations = v._2.toSeq,
                    content = defaultTranslations
                      .find(p => p.key == v._1)
                      .map(_.value)
                      .getOrElse("")
                  )
                )
              )
          )
        )
      })
  }
}
