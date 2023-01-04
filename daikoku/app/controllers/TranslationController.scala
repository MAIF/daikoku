package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import controllers.AppError
import controllers.AppError.TranslationNotFound
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.{DatastoreId, Translation}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents}
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.utils.Translator
import org.joda.time.DateTime
import play.api.i18n.{I18nSupport, Lang}
import reactivemongo.bson.BSONObjectID

class TranslationController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    env: Env,
    cc: ControllerComponents,
    translator: Translator)
    extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val mat = env.defaultMaterializer

  val languages = supportedLangs.availables.map(_.language)

  def getLanguages() = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
      FastFuture.successful(
        Ok(Json.stringify(JsArray(languages.map(JsString.apply)))))
    }
  }

  def getMailTranslations(domain: Option[String]) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
      env.dataStore.translationRepo
        .forTenant(ctx.tenant.id)
        .find(
          Json.obj(
            "key" -> Json.obj("$regex" -> s".*${domain.getOrElse("mail")}",
                              "$options" -> "-i")))
        .map(translations => {
          val defaultTranslations = messagesApi.messages
            .map(v =>
              (v._1,
               v._2.filter(k => k._1.startsWith(domain.getOrElse("mail")))))
            .flatMap { v =>
              v._2
                .map {
                  case (key, value) =>
                    Translation(
                      id = DatastoreId(BSONObjectID.generate().stringify),
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
                    t.key == translation.key && t.language == translation.language) match {
                    case None    => translation
                    case Some(t) => t
                  }
                }
                .groupBy(_.key)
                .map(
                  v =>
                    (v._1,
                     v._2.map(TranslationFormat.writes),
                     defaultTranslations
                       .find(p => p.key == v._1)
                       .map(_.value)
                       .getOrElse("")))
            ))
        })
    }
  }

  def getAllTranslations() =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(s"@{user.name} has requested all translations"))(ctx) {
        env.dataStore.translationRepo
          .forTenant(ctx.tenant.id)
          .findAll()
          .map(translations => {
            Ok(
              Json.obj(
                "translations" -> translations.map(TranslationFormat.writes)))
          })
      }
    }

  def saveTranslation() = DaikokuAction.async(parse.json) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has edited translations - @{tenant._id}"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
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
            BadRequest(Json.obj("error" -> "Bad translation format")))
        case JsSuccess(translation, _) =>
          translation.lastModificationAt match {
            case None =>
              _save(translation)
            case Some(_) =>
              env.dataStore.translationRepo
                .forTenant(ctx.tenant)
                .findOne(Json.obj("language" -> translation.language,
                                  "key" -> translation.key))
                .flatMap {
                  case Some(existingTranslation) =>
                    _save(existingTranslation.copy(value = translation.value))
                  case None =>
                    FastFuture.successful(
                      NotFound(Json.obj("error" -> "Translation not found")))
                }
          }
      }
    }
  }

  def resetTranslation(translationId: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
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
                          )))
                    }
                case false =>
                  FastFuture.successful(BadRequest(
                    Json.obj("error" -> "failed to delete translation")))
              }
              .flatten
        }
        .flatten
    }
  }

  def deleteTranslation() = DaikokuAction.async(parse.json) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has reset translations - @{tenant._id}"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
      TranslationFormat
        .reads((ctx.request.body \ "translation").as[JsValue]) match {
        case JsError(_) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Bad translation format")))
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
