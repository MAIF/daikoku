package domain

import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.{DaikokuEnv, Env}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json._
import sangria.ast.{IntValue, ObjectField, ObjectValue, StringValue}
import sangria.macros.derive._
import sangria.schema._
import sangria.validation.ValueCoercionViolation
import storage.{Repo, UserRepo}

import scala.concurrent.Future
import scala.util.{Failure, Success, Try}

object SchemaDefinition {
  case object JsonCoercionViolation extends ValueCoercionViolation("Not valid JSON")
  case object DateCoercionViolation extends ValueCoercionViolation("Date value expected")
  case object MapCoercionViolation extends ValueCoercionViolation("Map value can't be parsed")

  implicit val JsonType = ScalarType[JsValue]("Json",
    description = Some("Raw JSON value"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case v: String => Right(JsString(v))
      case v: Boolean => Right(JsBoolean(v))
      case v: Int => Right(JsNumber(v))
      case v: Long => Right(JsNumber(v))
      case v: Float => Right(JsNumber(v))
      case v: Double => Right(JsNumber(v))
      case v: BigInt => Right(JsNumber(v.toInt))
      case v: BigDecimal => Right(JsNumber(v))
      case v: JsValue => Right(v)
    },
    coerceInput = {
      case StringValue(jsonStr, _, _, _, _) => Right(JsString(jsonStr))
      case _ => Left(JsonCoercionViolation)
    })

  def parseDate(s: String) = Try(new DateTime(s, DateTimeZone.UTC)) match {
    case Success(date) => Right(date)
    case Failure(_) => Left(DateCoercionViolation)
  }

  val DateTimeType = ScalarType[DateTime]("DateTime",
    coerceOutput = (date, _) => StringValue(ISODateTimeFormat.dateTime().print(date)),
    coerceUserInput = {
      case s: String => parseDate(s)
      case _ => Left(DateCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => parseDate(s)
      case _ => Left(DateCoercionViolation)
    })

  val MapType = ScalarType[Map[String, String]]("Map",
    coerceOutput = (data, _) => JsObject(data.view.mapValues(JsString.apply).toSeq),
    coerceUserInput = e => {
      e.asInstanceOf[Map[String, String]] match {
        case r: Map[String, String] => Right(r)
        case _ => Left(MapCoercionViolation)
      }
    },
    coerceInput = {
      case ObjectValue(fields, _, _) => {
        val tuples = fields.map(f => (f.name, f.value.toString))
        Right(tuples.toMap)
      }
      case _ => Left(MapCoercionViolation)
    })

  val UserIdType = deriveObjectType[Unit, UserId]()
  val TenantIdType = deriveObjectType[Unit, TenantId]()
  val ApiIdType = deriveObjectType[Unit, ApiId]()

  val TwoFactorAuthenticationType = deriveObjectType[Unit, TwoFactorAuthentication]()
  val UserInvitationType = deriveObjectType[Unit, UserInvitation](
    ReplaceField("createdAt",
      Field("createdAt", DateTimeType, resolve = _.value.createdAt)
    )
  )

  /*val IdType: InterfaceType[Unit, ValueType] =
    InterfaceType(
      "ValueType",
      "ValueType description",
      () => fields[Unit, ValueType](
        Field("value", StringType, Some("The id of ValueType"), resolve = _.value.value)
      )
    )

  val TenantIdType = ObjectType[Unit, TenantId](
    "TenantId",
    "Tenant id description",
    interfaces[Unit, TenantId](IdType),
    fields[Unit, TenantId](
      Field("value", StringType, Some("Tenant id"), resolve = _.value.value),
      Field("asJson", JsonType, resolve = _.value.asJson)
    )
  )*/

  val AuthProviderType: InterfaceType[Unit, AuthProvider] = InterfaceType(
    "AuthProvider",
    "Auth provider description",
    () => fields[Unit, AuthProvider](
      Field("name", StringType, Some("The name of auth provider"), resolve = _.value.name),
      Field("asJson", JsonType, resolve = _.value.asJson)
    )
  )

  val UserType: ObjectType[Unit, User] =
    deriveObjectType[Unit, User](
      ObjectTypeName("User"),
      ObjectTypeDescription("A user of daikoku"),
      ReplaceField("id",
        Field("id", UserIdType, resolve = _.value.id)),
      ReplaceField("tenants",
        Field("tenants", ListType(TenantIdType), resolve = ctx => ctx.value.tenants.toSeq)),
      ReplaceField("origins",
        Field("origins", ListType(AuthProviderType), resolve = _.value.origins.toSeq)),
      ReplaceField("lastTenant",
        Field("lastTenant", OptionType(TenantIdType), resolve = _.value.lastTenant)
      ),
      ReplaceField("hardwareKeyRegistrations",
        Field("hardwareKeyRegistrations", ListType(JsonType), resolve = _.value.hardwareKeyRegistrations)
      ),
      ReplaceField("starredApis",
        Field("starredApis", ListType(ApiIdType), resolve = _.value.starredApis.toSeq)
      ),
      ReplaceField("twoFactorAuthentication",
        Field("twoFactorAuthentication", OptionType(TwoFactorAuthenticationType), resolve = _.value.twoFactorAuthentication)
      ),
      ReplaceField("invitation",
        Field("invitation", OptionType(UserInvitationType), resolve = _.value.invitation)
      ),
      ReplaceField("metadata",
        Field("metadata", MapType, resolve = _.value.metadata)
      )
    )

  val ID: Argument[String] = Argument("id", StringType, description = "id of the character")

  def getSchema(env: Env): Schema[UserRepo, Unit] = {
    implicit val e = env.defaultExecutionContext

    val Query: ObjectType[UserRepo, Unit] = ObjectType(
      "Query", fields[UserRepo, Unit](
        Field("user", OptionType(UserType),
          arguments = ID :: Nil,
          resolve = ctx => ctx.ctx.findById(ctx arg ID)
        ),
        Field("users", ListType(UserType),
          resolve = ctx => ctx.ctx.findAll())
      ))

    Schema(Query)
  }
}
