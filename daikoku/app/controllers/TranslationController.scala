package fr.maif.otoroshi.daikoku.ctrls

import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import controllers.AppError
import controllers.AppError.TranslationNotFound
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuActionMaybeWithoutUser}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.domain.{DatastoreId, IntlTranslation, Translation}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.services.TranslationsService
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, Translator}
import org.joda.time.DateTime
import play.api.i18n.I18nSupport
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents}

import scala.concurrent.ExecutionContext

class TranslationController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    env: Env,
    cc: ControllerComponents,
    translator: Translator,
    translationsService: TranslationsService
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer

  val languages: Seq[String] = supportedLangs.availables.map(_.language)

  def getLanguages() =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        FastFuture.successful(
          Ok(Json.stringify(JsArray(languages.map(JsString.apply))))
        )
      }
    }

  def getMailTranslations(domain: Option[String]) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        translationsService.getMailTranslations(ctx,  domain, messagesApi, supportedLangs)
      }
    }

  def getAllTranslations() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      env.dataStore.translationRepo
        .forTenant(ctx.tenant.id)
        .findAll()
        .map(translations => {
          Ok(
            Json
              .obj("translations" -> translations.map(TranslationFormat.writes))
          )
        })
    }

  def saveTranslation() =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has edited translations - @{tenant._id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        def _save(translation: Translation) = {
          val savedTranslation =
            translation.copy(lastModificationAt = Some(DateTime.now()))
          env.dataStore.translationRepo
            .forTenant(ctx.tenant.id)
            .save(savedTranslation)
            .map {
              case true => Ok(TranslationFormat.writes(savedTranslation))
              case false =>
                BadRequest(Json.obj("error" -> "failed to save translation"))
            }
        }

        TranslationFormat
          .reads((ctx.request.body \ "translation").as[JsValue]) match {
          case JsError(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Bad translation format"))
            )
          case JsSuccess(translation, _) =>
            translation.lastModificationAt match {
              case None =>
                _save(translation)
              case Some(_) =>
                env.dataStore.translationRepo
                  .forTenant(ctx.tenant)
                  .findOne(
                    Json.obj(
                      "language" -> translation.language,
                      "key" -> translation.key
                    )
                  )
                  .flatMap {
                    case Some(existingTranslation) =>
                      _save(existingTranslation.copy(value = translation.value))
                    case None =>
                      FastFuture.successful(
                        NotFound(Json.obj("error" -> "Translation not found"))
                      )
                  }
            }
        }
      }
    }

  def resetTranslation(translationId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        env.dataStore.translationRepo
          .forTenant(ctx.tenant.id)
          .findById(translationId)
          .map {
            case None =>
              FastFuture.successful(AppError.render(TranslationNotFound))
            case Some(translation) =>
              env.dataStore.translationRepo
                .forTenant(ctx.tenant.id)
                .deleteById(translationId)
                .map {
                  case true =>
                    implicit val language: String = translation.language
                    translator
                      .translate(translation.key, ctx.tenant)
                      .map { value =>
                        Ok(
                          TranslationFormat.writes(
                            translation.copy(
                              value = value,
                              lastModificationAt = None
                            )
                          )
                        )
                      }
                  case false =>
                    FastFuture.successful(
                      BadRequest(
                        Json.obj("error" -> "failed to delete translation")
                      )
                    )
                }
                .flatten
          }
          .flatten
      }
    }

  def deleteTranslation() =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        TranslationFormat
          .reads((ctx.request.body \ "translation").as[JsValue]) match {
          case JsError(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Bad translation format"))
            )
          case JsSuccess(translation, _) =>
            env.dataStore.translationRepo
              .forTenant(ctx.tenant.id)
              .delete(Json.obj("_id" -> translation.id.value))
              .map { _ =>
                Ok(Json.obj("done" -> true))
              }
        }
      }
    }
}
