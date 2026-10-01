package fr.maif.daikoku.controllers

import cats.data.EitherT
import cats.implicits.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.KeyringFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.KeyringService
import fr.maif.daikoku.storage.{DataStore, Repo}
import fr.maif.daikoku.utils.{
  AdminApiController,
  DaikokuApiAction,
  IdGenerator,
  ReadEntitiesFrom,
  ReconcileFinalIds,
  UpdateOrCreate
}
import org.joda.time.DateTime
import play.api.libs.json.*
import play.api.mvc.ControllerComponents

import scala.concurrent.Future

object KeyringAdminApiController {

  // credentials: never read from a payload, never exported
  val secretFields: Seq[String] = Seq("apiKey", "integrationToken", "bearerToken")

  def readPayload(json: JsValue): JsResult[Keyring] =
    json match {
      case obj: JsObject =>
        KeyringFormat.reads(
          Json.obj("createdAt" -> DateTime.now().getMillis) ++
            secretFields.foldLeft(obj)(_ - _) ++
            generatedSecrets(obj)
        )
      case _ => JsError("Expected a JSON object")
    }

  private def generatedSecrets(obj: JsObject): JsObject =
    Json.obj(
      "apiKey" -> Json.obj(
        "clientName" -> s"daikoku-keyring-${(obj \ "_id").asOpt[String].getOrElse("")}",
        "clientId" -> IdGenerator.token(32),
        "clientSecret" -> IdGenerator.token(64)
      ),
      "integrationToken" -> IdGenerator.token(64)
    )
}

class KeyringAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    keyringService: KeyringService
) extends AdminApiController[Keyring, KeyringId](
      DaikokuApiAction,
      env,
      cc
    ) {
  override def entityClass = classOf[Keyring]
  override def entityName: String = "keyring"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[Keyring, KeyringId] =
    ds.keyringRepo.forTenant(tenant)
  override def toJson(entity: Keyring): JsValue = entity.asJson
  override def getId(entity: Keyring): KeyringId = entity.id
  override def readMetadata(e: Keyring): Map[String, String] = e.metadata

  override def fromJson(entity: JsValue): Either[String, Keyring] =
    KeyringAdminApiController
      .readPayload(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def mergeWithExisting(existing: Keyring, incoming: Keyring): Keyring =
    incoming.copy(
      apiKey = existing.apiKey,
      integrationToken = existing.integrationToken,
      bearerToken = existing.bearerToken,
      createdAt = existing.createdAt,
      rotation = existing.rotation,
      thirdPartySubscriptionInformations =
        existing.thirdPartySubscriptionInformations
    )

  override def doUpdate(
      tenant: Tenant,
      oldEntity: Keyring,
      newEntity: Keyring
  ): EitherT[Future, AppError, Keyring] =
    super.doUpdate(tenant, oldEntity, mergeWithExisting(oldEntity, newEntity))

  override def doDelete(
      tenant: Tenant,
      entity: Keyring
  ): EitherT[Future, AppError, Unit] =
    keyringService.deleteKeyring(tenant, entity)

  override def validate(
      entity: Keyring,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Keyring] =
    validateWith(entity, ReadEntitiesFrom.inDatabase)

  override def validateForReconcile(
      entity: Keyring,
      updateOrCreate: UpdateOrCreate,
      finalIds: ReconcileFinalIds
  ): EitherT[Future, AppError, Keyring] =
    validateWith(entity, finalIds)

  private def validateWith(
      entity: Keyring,
      readFrom: ReadEntitiesFrom
  ): EitherT[Future, AppError, Keyring] =
    for {
      _ <- checkReference(
        readFrom,
        "tenant",
        entity.tenant.value,
        AppError.ParsingPayloadError("Tenant not found")
      )(env.dataStore.tenantRepo.findById(entity.tenant))
      _ <- checkReference(
        readFrom,
        "team",
        entity.team.value,
        AppError.ParsingPayloadError("Team not found")
      )(env.dataStore.teamRepo.forTenant(entity.tenant).findById(entity.team))
      _ <- entity.otoroshiSettings match {
        case KeyringOtoroshiBinding.Otoroshi(id) =>
          checkReference(
            readFrom,
            "otoroshi-settings",
            id.value,
            AppError.ParsingPayloadError("Otoroshi setting not found")
          )(
            env.dataStore.tenantRepo
              .findById(entity.tenant)
              .map(_.flatMap(_.otoroshiSettings.find(_.id == id)))
          )
        case KeyringOtoroshiBinding.Internal =>
          EitherT.pure[Future, AppError](())
      }
    } yield entity
}
