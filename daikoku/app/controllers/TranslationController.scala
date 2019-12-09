package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Keep, Sink, Source}
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.TranslationElement._
import fr.maif.otoroshi.daikoku.domain.{ApiId, MongoId, TeamId, Translation}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents}

class TranslationController(DaikokuAction: DaikokuAction,
                            env: Env,
                            cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val mat = env.defaultMaterializer

  def saveApiTranslation(teamId: String, api: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} has created a translation -  - @{t._id}"))(teamId, ctx) {
        _ =>
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findByIdNotDeleted(api)
            .flatMap {
              case None =>
                FastFuture.successful(
                  NotFound(Json.obj("error" -> "Api not found")))
              case Some(api) =>
                val translations =
                  (ctx.request.body).as[JsObject].fields.flatMap {
                    case (language, values) =>
                      values.as[JsObject].fields.map {
                        case (key, value) =>
                          Translation(
                            id =
                              MongoId(s"$language.${ctx.tenant.id.value}.$key"),
                            tenant = ctx.tenant.id,
                            language = language,
                            key = key,
                            value = value.as[String],
                            element = ApiTranslationElement(api.id)
                          )
                      }
                  }

                Source(translations.toList)
                  .mapAsync(5)(translation =>
                    env.dataStore.translationRepo
                      .forTenant(ctx.tenant)
                      .save(translation))
                  .toMat(Sink.ignore)(Keep.right)
                  .run()
                  .map(_ => Ok(Json.obj("done" -> true)))
            }
      }
    }

  def saveTenantTranslation(tenantId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has created a translation for tenant @{tenant.name}"))(
        ctx) {
        env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "Tenant not found")))
          case Some(tenant) =>
            val translations = (ctx.request.body).as[JsObject].fields.flatMap {
              case (language, values) =>
                values.as[JsObject].fields.map {
                  case (key, value) =>
                    Translation(
                      id = MongoId(s"$language.${ctx.tenant.id.value}.$key"),
                      tenant = ctx.tenant.id,
                      language = language,
                      key = key,
                      value = value.as[String],
                      element = TenantTranslationElement(tenant.id)
                    )
                }
            }

            Source(translations.toList)
              .mapAsync(5)(translation =>
                env.dataStore.translationRepo
                  .forTenant(ctx.tenant)
                  .save(translation))
              .toMat(Sink.ignore)(Keep.right)
              .run()
              .map(_ => Ok(Json.obj("done" -> true)))
        }
      }
    }

  def saveTeamTranslation(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has created a translation -  - @{t._id}"))(teamId, ctx) {
        team =>
          val translations = (ctx.request.body).as[JsObject].fields.flatMap {
            case (language, values) =>
              values.as[JsObject].fields.map {
                case (key, value) =>
                  Translation(
                    id = MongoId(s"$language.${ctx.tenant.id.value}.$key"),
                    tenant = ctx.tenant.id,
                    language = language,
                    key = key,
                    value = value.as[String],
                    element = TeamTranslationElement(team.id)
                  )
              }
          }

          Source(translations.toList)
            .mapAsync(5)(translation =>
              env.dataStore.translationRepo
                .forTenant(ctx.tenant)
                .save(translation))
            .toMat(Sink.ignore)(Keep.right)
            .run()
            .map(_ => Ok(Json.obj("done" -> true)))
      }
  }

  def getTenantTranslation() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has requested tenant translation - @{tenant._id}"))(ctx) {
      env.dataStore.translationRepo
        .forTenant(ctx.tenant)
        .findAll()
        .map(translations => {

          import fr.maif.otoroshi.daikoku.domain.json._

          val map: Map[String, Seq[Translation]] =
            translations.groupBy(t => t.language)

          val translationsAsJson = map
            .map {
              case (k, v) => Json.obj(k -> SeqTranslationFormat.writes(v))
            }
            .fold(Json.obj())(_ deepMerge _)

          Ok(translationsAsJson)
        })
    }
  }
}
