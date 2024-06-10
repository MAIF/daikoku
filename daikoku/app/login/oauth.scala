package fr.maif.otoroshi.daikoku.login

import org.apache.pekko.http.scaladsl.util.FastFuture
import com.auth0.jwt.JWT
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.jwt.{AlgoSettings, InputMode}
import org.apache.commons.codec.binary.{Base64 => ApacheBase64}
import play.api.Logger
import play.api.libs.json._
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedSimpleForm
import play.api.mvc.RequestHeader

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

object OAuth2Config {

  lazy val logger = Logger("oauth2-config")

  val _fmt = new Format[OAuth2Config] {

    override def reads(json: JsValue) =
      fromJson(json) match {
        case Left(e)  => JsError(e.getMessage)
        case Right(v) => JsSuccess(v.asInstanceOf[OAuth2Config])
      }

    override def writes(o: OAuth2Config) = o.asJson
  }

  def fromJson(json: JsValue): Either[Throwable, OAuth2Config] = {
    Try {
      Right(
        OAuth2Config(
          sessionMaxAge = (json \ "sessionMaxAge").asOpt[Int].getOrElse(86400),
          clientId = (json \ "clientId").asOpt[String].getOrElse("client"),
          clientSecret =
            (json \ "clientSecret").asOpt[String].getOrElse("secret"),
          authorizeUrl = (json \ "authorizeUrl")
            .asOpt[String]
            .getOrElse("http://localhost:8082/oauth/authorize"),
          tokenUrl = (json \ "tokenUrl")
            .asOpt[String]
            .getOrElse("http://localhost:8082/oauth/token"),
          userInfoUrl = (json \ "userInfoUrl")
            .asOpt[String]
            .getOrElse("http://localhost:8082/userinfo"),
          loginUrl = (json \ "loginUrl")
            .asOpt[String]
            .getOrElse("http://localhost:8082/login"),
          logoutUrl = (json \ "logoutUrl")
            .asOpt[String]
            .getOrElse("http://localhost:8082/logout"),
          accessTokenField =
            (json \ "accessTokenField").asOpt[String].getOrElse("access_token"),
          nameField = (json \ "nameField").asOpt[String].getOrElse("name"),
          emailField = (json \ "emailField").asOpt[String].getOrElse("email"),
          pictureField =
            (json \ "pictureField").asOpt[String].getOrElse("picture"),
          scope = (json \ "scope")
            .asOpt[String]
            .getOrElse("openid profile email name"),
          useJson = (json \ "useJson").asOpt[Boolean].getOrElse(false),
          readProfileFromToken =
            (json \ "readProfileFromToken").asOpt[Boolean].getOrElse(false),
          jwtVerifier = (json \ "jwtVerifier")
            .asOpt[JsValue]
            .flatMap(v => AlgoSettings.fromJson(v).toOption),
          callbackUrl = (json \ "callbackUrl")
            .asOpt[String]
            .getOrElse("http://daikoku.foo.bar:8080/auth/OAuth/callback"),
          daikokuAdmins = (json \ "daikokuAdmins")
            .asOpt[Seq[String]]
            .getOrElse(Seq.empty[String])
        )
      )
    } recover {
      case e => Left(e)
    } get
  }
}

case class OAuth2Config(
    sessionMaxAge: Int = 86400,
    clientId: String = "client",
    clientSecret: String = "secret",
    tokenUrl: String = "http://<oauth-domain>/oauth/token",
    authorizeUrl: String = "http://localhost:8082/oauth/authorize",
    userInfoUrl: String = "http://<oauth-domain>/userinfo",
    loginUrl: String = "https://<oauth-domain>/authorize",
    logoutUrl: String =
      "http://daikoku.foo.bar:8080/v2/logout?returnTo=${redirect}",
    scope: String = "openid profile email name",
    useJson: Boolean = false,
    readProfileFromToken: Boolean = false,
    jwtVerifier: Option[AlgoSettings] = None,
    accessTokenField: String = "access_token",
    nameField: String = "name",
    emailField: String = "email",
    pictureField: String = "picture",
    callbackUrl: String = "http://daikoku.foo.bar:8080/auth/oauth2/callback",
    daikokuAdmins: Seq[String] = Seq.empty[String]
) {
  def asJson =
    Json.obj(
      "type" -> "oauth2",
      "sessionMaxAge" -> this.sessionMaxAge,
      "clientId" -> this.clientId,
      "clientSecret" -> this.clientSecret,
      "authorizeUrl" -> this.authorizeUrl,
      "tokenUrl" -> this.tokenUrl,
      "userInfoUrl" -> this.userInfoUrl,
      "loginUrl" -> this.loginUrl,
      "logoutUrl" -> this.logoutUrl,
      "scope" -> this.scope,
      "useJson" -> this.useJson,
      "readProfileFromToken" -> this.readProfileFromToken,
      "jwtVerifier" -> jwtVerifier.map(_.asJson).getOrElse(JsNull).as[JsValue],
      "accessTokenField" -> this.accessTokenField,
      "nameField" -> this.nameField,
      "emailField" -> this.emailField,
      "pictureField" -> this.pictureField,
      "callbackUrl" -> this.callbackUrl,
      "daikokuAdmins" -> this.daikokuAdmins
    )
}

object OAuth2Support {

  import fr.maif.otoroshi.daikoku.utils.future._

  def bindUser(
      request: RequestHeader,
      authConfig: OAuth2Config,
      tenant: Tenant,
      _env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[String, User]] = {
    val clientId = authConfig.clientId
    val clientSecret = authConfig.clientSecret
    val redirectUri = authConfig.callbackUrl

    request.getQueryString("error") match {
      case Some(_) => Left("No code :(").asFuture
      case None =>
        request.getQueryString("code") match {
          case None => Left("No code :(").asFuture
          case Some(code) =>
            val builder = _env.wsClient.url(authConfig.tokenUrl)
            println(Json.prettyPrint(Json.obj(
              "code" -> code,
              "grant_type" -> "authorization_code",
              "client_id" -> clientId,
              "client_secret" -> clientSecret,
              "redirect_uri" -> redirectUri
            )))
            val future1 = if (authConfig.useJson) {
              builder.post(
                Json.obj(
                  "code" -> code,
                  "grant_type" -> "authorization_code",
                  "client_id" -> clientId,
                  "client_secret" -> clientSecret,
                  "redirect_uri" -> redirectUri
                )
              )
            } else {
              builder.post(
                Map(
                  "code" -> code,
                  "grant_type" -> "authorization_code",
                  "client_id" -> clientId,
                  "client_secret" -> clientSecret,
                  "redirect_uri" -> redirectUri
                )
              )(writeableOf_urlEncodedSimpleForm)
            }
            future1
              .flatMap { resp =>

                println(Json.prettyPrint(resp.json))
                val accessToken =
                  (resp.json \ authConfig.accessTokenField).as[String]
                if (
                  authConfig.readProfileFromToken && authConfig.jwtVerifier.isDefined
                ) {
                  val algoSettings = authConfig.jwtVerifier.get
                  val tokenHeader =
                    Try(
                      Json.parse(
                        ApacheBase64.decodeBase64(accessToken.split("\\.")(0))
                      )
                    ).getOrElse(Json.obj())
                  val tokenBody =
                    Try(
                      Json.parse(
                        ApacheBase64.decodeBase64(accessToken.split("\\.")(1))
                      )
                    ).getOrElse(Json.obj())
                  val kid = (tokenHeader \ "kid").asOpt[String]
                  val alg =
                    (tokenHeader \ "alg").asOpt[String].getOrElse("RS256")
                  algoSettings
                    .asAlgorithmF(InputMode(alg, kid))(_env, ec)
                    .flatMap {
                      case Some(algo) => {
                        Try(
                          JWT
                            .require(algo)
                            .acceptLeeway(10000)
                            .build()
                            .verify(accessToken)
                        ).map { _ =>
                          FastFuture.successful(tokenBody)
                        } recoverWith {
                          case e => Success(FastFuture.failed(e))
                        } get
                      }
                      case None =>
                        FastFuture.failed(new RuntimeException("Bad algorithm"))
                    }
                } else {
                  val builder2 = _env.wsClient.url(authConfig.userInfoUrl)
                  val future2 = if (authConfig.useJson) {
                    builder2.post(
                      Json.obj(
                        "access_token" -> accessToken
                      )
                    )
                  } else {
                    builder2.post(
                      Map(
                        "access_token" -> accessToken
                      )
                    )(writeableOf_urlEncodedSimpleForm)
                  }
                  future2.map(_.json)
                }
              }
              .flatMap { userFromOauth =>
                val name = (userFromOauth \ authConfig.nameField)
                  .asOpt[String]
                  .getOrElse("No Name")
                val email = (userFromOauth \ authConfig.emailField)
                  .asOpt[String]
                  .getOrElse("no.name@foo.bar")
                val picture =
                  (userFromOauth \ authConfig.pictureField).asOpt[String]

                val isDaikokuAdmin = authConfig.daikokuAdmins.contains(email)

                _env.dataStore.userRepo
                  .findOne(Json.obj("_deleted" -> false, "email" -> email))
                  .flatMap {
                    case None =>
                      val userId = UserId(IdGenerator.token(32))
                      val team = Team(
                        id = TeamId(IdGenerator.token(32)),
                        tenant = tenant.id,
                        `type` = TeamType.Personal,
                        name = s"$name",
                        description = s"The personal team of $name",
                        users = Set(UserWithPermission(userId, Administrator)),
                        authorizedOtoroshiEntities = None,
                        contact = email
                      )
                      val user = User(
                        id = userId,
                        tenants = Set(tenant.id),
                        origins = Set(AuthProvider.OAuth2),
                        name = name,
                        email = email,
                        picture = picture.getOrElse(User.DEFAULT_IMAGE),
                        pictureFromProvider = picture.isDefined,
                        isDaikokuAdmin = isDaikokuAdmin,
                        lastTenant = Some(tenant.id),
                        personalToken = Some(IdGenerator.token(32)),
                        defaultLanguage = None
                      )
                      for {
                        _ <-
                          _env.dataStore.teamRepo
                            .forTenant(tenant.id)
                            .save(team)
                        _ <- _env.dataStore.userRepo.save(user)
                      } yield {
                        Right(user)
                      }
                    case Some(u) =>
                      val updatedUser = u.copy(
                        name = name,
                        email = email,
                        tenants = u.tenants + tenant.id,
                        origins = u.origins + AuthProvider.OAuth2,
                        picture = if (
                          picture.isDefined && u.pictureFromProvider
                        )
                          picture.get
                        else
                          u.picture == User.DEFAULT_IMAGE match {
                            case true
                                if picture.isDefined && u.pictureFromProvider =>
                              picture.get
                            case true if picture.isEmpty => User.DEFAULT_IMAGE
                            case _                       => u.picture
                          },
                        isDaikokuAdmin =
                          if (u.isDaikokuAdmin) true else isDaikokuAdmin
                      )
                      for {
                        _ <- _env.dataStore.userRepo.save(updatedUser)
                      } yield {
                        Right(updatedUser)
                      }
                  }
              }
        }
    }
  }
}
