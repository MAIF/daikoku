package fr.maif.otoroshi.daikoku.login

import cats.data.EitherT
import org.apache.pekko.http.scaladsl.util.FastFuture
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import controllers.AppError
import controllers.AppError.AuthenticationError
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.jwt.{AlgoSettings, InputMode}
import org.apache.commons.codec.binary.{Base64 => ApacheBase64}
import org.apache.pekko.serialization.jackson.Compression.Algoritm
import play.api.Logger
import play.api.libs.json._
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedSimpleForm
import play.api.libs.ws.WSResponse
import play.api.mvc.RequestHeader

import java.security.{MessageDigest, SecureRandom}
import java.util.Base64
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

object OAuth2Config {

  lazy val logger = Logger("oauth2-config")

  val _fmt = new Format[OAuth2Config] {

    override def reads(json: JsValue) =
      fromJson(json) match {
        case Left(e)  => JsError(e.getErrorMessage())
        case Right(v) => JsSuccess(v)
      }

    override def writes(o: OAuth2Config) = o.asJson
  }

  val pkceConfigFmt = new Format[PKCEConfig] {

    override def reads(json: JsValue): JsResult[PKCEConfig] = {
      Try {
        JsSuccess(
          PKCEConfig(
            enabled = (json \ "enabled").as[Boolean],
            algorithm = (json \ "algorithm").as[String]
          )
        )
      } recover { case e =>
//          AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
    }

    override def writes(o: PKCEConfig): JsValue = {
      Json.obj(
        "enabled" -> o.enabled,
        "algorithm" -> o.algorithm
      )
    }
  }

  def fromJson(json: JsValue): Either[AppError, OAuth2Config] = {
    Try {
      Right(
        OAuth2Config(
          pkceConfig =
            (json \ "pkceConfig").asOpt[PKCEConfig](pkceConfigFmt.reads),
          sessionMaxAge = (json \ "sessionMaxAge").asOpt[Int].getOrElse(86400),
          clientId = (json \ "clientId").asOpt[String].getOrElse("client"),
          clientSecret = (json \ "clientSecret").asOpt[String],
          authorizeUrl = (json \ "authorizeUrl")
            .asOpt[String]
            .orElse((json \ "authorize_url").asOpt[String])
            .getOrElse("http://localhost:8082/oauth/authorize"),
          tokenUrl = (json \ "tokenUrl")
            .asOpt[String]
            .orElse((json \ "token_url").asOpt[String])
            .getOrElse("http://localhost:8082/oauth/token"),
          userInfoUrl = (json \ "userInfoUrl")
            .asOpt[String]
            .orElse((json \ "token_url").asOpt[String])
            .getOrElse("http://localhost:8082/userinfo"),
          loginUrl = (json \ "loginUrl")
            .asOpt[String]
            .orElse((json \ "login_url").asOpt[String])
            .getOrElse("http://localhost:8082/login"),
          logoutUrl = (json \ "logoutUrl")
            .asOpt[String]
            .orElse((json \ "logout_url").asOpt[String])
            .filter(_.trim.nonEmpty),
          accessTokenField =
            (json \ "accessTokenField").asOpt[String].getOrElse("access_token"),
          nameField = (json \ "nameField").asOpt[String].getOrElse("name"),
          emailField = (json \ "emailField").asOpt[String].getOrElse("email"),
          pictureField =
            (json \ "pictureField").asOpt[String].getOrElse("picture"),
          scope = (json \ "scope")
            .asOpt[String]
            .getOrElse("openid profile email name picture"),
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
            .getOrElse(Seq.empty[String]),
          roleClaim = (json \ "roleClaim")
            .asOpt[String],
          adminRole = (json \ "adminRole")
            .asOpt[String],
          userRole = (json \ "userRole")
            .asOpt[String]
        )
      )
    } recover { case e =>
      AppLogger.error("wrong oauth2 configuration", e)
      Left(
        AppError
          .AuthenticationError(s"wrong oauth2 configuration: ${e.getMessage}")
      )
    } get
  }
}

case class PKCEConfig(
    enabled: Boolean = false,
    algorithm: String = "SHA-256"
)

case class OAuth2Config(
    sessionMaxAge: Int = 86400,
    clientId: String = "client",
    clientSecret: Option[String] = None,
    tokenUrl: String = "http://<oauth-domain>/oauth/token",
    authorizeUrl: String = "http://localhost:8082/oauth/authorize",
    userInfoUrl: String = "http://<oauth-domain>/userinfo",
    loginUrl: String = "https://<oauth-domain>/authorize",
    logoutUrl: Option[String] = None,
    scope: String = "openid profile email name",
    useJson: Boolean = false,
    readProfileFromToken: Boolean = false,
    jwtVerifier: Option[AlgoSettings] = None,
    accessTokenField: String = "access_token",
    nameField: String = "name",
    emailField: String = "email",
    pictureField: String = "picture",
    callbackUrl: String = "http://daikoku.foo.bar:8080/auth/oauth2/callback",
    daikokuAdmins: Seq[String] = Seq.empty[String],
    pkceConfig: Option[PKCEConfig] = None,
    roleClaim: Option[String] = None,
    adminRole: Option[String] = None,
    userRole: Option[String] = None
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
      "logoutUrl" -> this.logoutUrl.map(JsString).getOrElse(JsNull).as[JsValue],
      "scope" -> this.scope,
      "useJson" -> this.useJson,
      "readProfileFromToken" -> this.readProfileFromToken,
      "jwtVerifier" -> jwtVerifier.map(_.asJson).getOrElse(JsNull).as[JsValue],
      "accessTokenField" -> this.accessTokenField,
      "nameField" -> this.nameField,
      "emailField" -> this.emailField,
      "pictureField" -> this.pictureField,
      "callbackUrl" -> this.callbackUrl,
      "daikokuAdmins" -> this.daikokuAdmins,
      "roleClaim" -> this.roleClaim.map(JsString).getOrElse(JsNull).as[JsValue],
      "adminRole" -> this.adminRole.map(JsString).getOrElse(JsNull).as[JsValue]
    )
}

object OAuth2Support {

  import fr.maif.otoroshi.daikoku.utils.future._
  lazy val logger = Logger("oauth2-config")

  def generatePKCECodes(
      codeChallengeMethod: Option[String] = Some("SHA-256")
  ) = {
    val code = new Array[Byte](120)
    val secureRandom = new SecureRandom()
    secureRandom.nextBytes(code)

    val codeVerifier = new String(
      Base64.getUrlEncoder.withoutPadding().encodeToString(code)
    ).slice(0, 120)

    val bytes = codeVerifier.getBytes("US-ASCII")
    val md = MessageDigest.getInstance("SHA-256")
    md.update(bytes, 0, bytes.length)
    val digest = md.digest

    codeChallengeMethod match {
      case Some("SHA-256") =>
        (
          codeVerifier,
          org.apache.commons.codec.binary.Base64
            .encodeBase64URLSafeString(digest),
          "S256"
        )
      case _ => (codeVerifier, codeVerifier, "plain")
    }
  }

  def bindUser(
      request: RequestHeader,
      authConfig: OAuth2Config,
      tenant: Tenant,
      _env: Env
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, (User, Option[String])] = {
    def verifyAndGetUser(
        accessToken: String
    ): EitherT[Future, AppError, JsValue] = {
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
      val settings = algoSettings
        .asAlgorithm(InputMode(alg, kid))(_env)

      EitherT
        .fromOption[Future][AppError, Algorithm](
          settings,
          AppError.BadRequestError("Bad algorithm")
        )
        .map(algo =>
          JWT
            .require(algo)
            .acceptLeeway(10000)
            .build()
            .verify(accessToken)
        )
        .map(_ => tokenBody)
    }

    def getUser(accessToken: String) = {
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

      EitherT
        .right[AppError](future2)
        .map(_.json)
    }

    def createUser(
        name: String,
        email: String,
        picture: Option[String],
        isDaikokuAdmin: Boolean
    ): EitherT[Future, AppError, User] = {
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
        _ <- EitherT.right[AppError](
          _env.dataStore.teamRepo
            .forTenant(tenant.id)
            .save(team)
        )
        _ <- EitherT.right[AppError](_env.dataStore.userRepo.save(user))
      } yield {
        user
      }
    }

    def updateUser(
        u: User,
        name: String,
        email: String,
        picture: Option[String],
        isDaikokuAdmin: Boolean
    ): EitherT[Future, AppError, User] = {
      val updatedUser = u.copy(
        name = name,
        email = email,
        tenants = u.tenants + tenant.id,
        origins = u.origins + AuthProvider.OAuth2,
        picture =
          if (picture.isDefined && u.pictureFromProvider)
            picture.get
          else
            u.picture == User.DEFAULT_IMAGE match {
              case true if picture.isDefined && u.pictureFromProvider =>
                picture.get
              case true if picture.isEmpty => User.DEFAULT_IMAGE
              case _                       => u.picture
            },
        isDaikokuAdmin = isDaikokuAdmin
      )

      EitherT
        .right[AppError](_env.dataStore.userRepo.save(updatedUser))
        .map(_ => updatedUser)
    }

    def processUserFromOAuth(
        userFromOauth: JsValue
    ): EitherT[Future, AppError, User] = {
      for {
        name <- EitherT.fromOption[Future](
          (userFromOauth \ authConfig.nameField)
            .asOpt[String],
          AppError.EntityNotFound("No name found")
        )
        email <- EitherT.fromOption[Future](
          (userFromOauth \ authConfig.emailField)
            .asOpt[String],
          AppError.EntityNotFound("No email found")
        )
        picture <- EitherT.pure[Future, AppError](
          (userFromOauth \ authConfig.pictureField).asOpt[String]
        )
        isDaikokuAdmin = authConfig.roleClaim match {
          case Some(claim) if claim != "daikokuAdmin" =>
            (userFromOauth \ claim).asOpt[JsValue] match {
              case Some(JsString(role)) =>
                authConfig.adminRole.forall(_ == role)
              case Some(JsArray(roles)) =>
                authConfig.adminRole.forall(r =>
                  roles.map(_.as[String]).contains(r)
                )
              case _ => authConfig.daikokuAdmins.contains(email)
            }
          case _ =>
            (userFromOauth \ "daikokuAdmin")
              .asOpt[String]
              .flatMap(_.toBooleanOption)
              .orElse((userFromOauth \ "daikokuAdmin").asOpt[Boolean])
              .getOrElse(false)
        }

        isUser = authConfig.roleClaim match {
          case Some(claim) =>
            (userFromOauth \ claim).asOpt[JsValue] match {
              case Some(JsString(role)) => authConfig.userRole.forall(_ == role)
              case Some(JsArray(roles)) =>
                authConfig.userRole.forall(r =>
                  roles.map(_.as[String]).contains(r)
                )
              case _ => authConfig.userRole.isEmpty
            }
          case _ => true
        }

        _ <- EitherT.cond[Future](
          isDaikokuAdmin || isUser,
          (),
          AppError.UserNotAllowed(email)
        )

        existingUser <- EitherT.right[AppError](
          _env.dataStore.userRepo
            .findOne(Json.obj("_deleted" -> false, "email" -> email))
        )

        connectedUser <- existingUser match {
          case Some(user) =>
            updateUser(user, name, email, picture, isDaikokuAdmin)
          case None => createUser(name, email, picture, isDaikokuAdmin)
        }
      } yield connectedUser
    }

    for {
      _ <- EitherT.cond[Future](
        request.getQueryString("error").isEmpty,
        (),
        AppError.BadRequestError("No code")
      )
      code <- EitherT.fromOption[Future](
        request.getQueryString("code"),
        AppError.BadRequestError("No code")
      )

      builder = _env.wsClient.url(authConfig.tokenUrl)
      verifier = request.session.get("code_verifier").getOrElse("")
      clientSecret = authConfig.clientSecret.map(_.trim).filterNot(_.isEmpty)
      mapPayload = (Map(
        "code" -> code,
        "grant_type" -> "authorization_code",
        "client_id" -> authConfig.clientId,
        "redirect_uri" -> authConfig.callbackUrl,
        "scope" -> authConfig.scope
      ) ++ authConfig.pkceConfig
        .collect {
          case e if e.enabled => Map("code_verifier" -> verifier)
        }
        .getOrElse(Map.empty)
        ++ clientSecret
          .map(s => Map("client_secret" -> s))
          .getOrElse(Map.empty))

      response <- EitherT.right[AppError](if (authConfig.useJson) {
        val jsonPayload = JsObject(
          mapPayload.view.mapValues(JsString.apply).toMap
        )
        builder.post(
          jsonPayload
        )
      } else {
        builder.post(
          mapPayload
        )(writeableOf_urlEncodedSimpleForm)
      })
      accessToken = (response.json \ authConfig.accessTokenField).as[String]
      idToken = (response.json \ "id_token").asOpt[String]
      userJson <-
        if (authConfig.readProfileFromToken && authConfig.jwtVerifier.isDefined)
          verifyAndGetUser(accessToken)
        else
          getUser(accessToken)

      user <- processUserFromOAuth(userJson)
    } yield (user, idToken)

  }

  def getConfiguration(
      url: String,
      clientId: Option[String],
      clientSecret: Option[String],
      tenant: Tenant
  )(implicit
      executionContext: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, OAuth2Config] = {
    val config = OAuth2Config()

    def parseResponseAsConfig(body: JsValue): OAuth2Config = {
      val issuer =
        (body \ "issuer").asOpt[String].getOrElse("http://localhost:8082/")
      val tokenUrl =
        (body \ "token_endpoint").asOpt[String].getOrElse(config.tokenUrl)
      val authorizeUrl = (body \ "authorization_endpoint")
        .asOpt[String]
        .getOrElse(config.authorizeUrl)
      val userInfoUrl =
        (body \ "userinfo_endpoint").asOpt[String].getOrElse(config.userInfoUrl)
      val loginUrl =
        (body \ "authorization_endpoint").asOpt[String].getOrElse(authorizeUrl)
      val logoutUrl = (body \ "end_session_endpoint")
        .asOpt[String]
        .orElse((body \ "ping_end_session_endpoint").asOpt[String])
        .map { rawLogoutUrl =>
          if (
            rawLogoutUrl
              .contains("${redirect}") || rawLogoutUrl.contains("${clientId}")
          ) rawLogoutUrl
          else {
            val sep = if (rawLogoutUrl.contains("?")) "&" else "?"
            s"$rawLogoutUrl${sep}id_token_hint=$${idTokenHint}&post_logout_redirect_uri=$${redirect}&client_id=$${clientId}"
          }
        }
      val scope = (body \ "scopes_supported")
        .asOpt[Seq[String]]
        .map(_.mkString(" "))
        .getOrElse("openid profile email name")
      config
        .copy(
          clientId = clientId.getOrElse(config.clientId),
          clientSecret = clientSecret,
          tokenUrl = tokenUrl,
          authorizeUrl = authorizeUrl,
          userInfoUrl = userInfoUrl,
          loginUrl = loginUrl,
          logoutUrl = logoutUrl,
          callbackUrl = env.getDaikokuUrl(tenant, "/auth/oauth2/callback"),
          scope = scope,
          accessTokenField = "access_token",
          useJson = false,
          readProfileFromToken = false,
          nameField =
            if (scope.contains(config.nameField))
              config.nameField
            else
              config.emailField,
          jwtVerifier = None
        )
    }

    for {
      getConfig <- EitherT.liftF[Future, AppError, WSResponse](
        env.wsClient.url(url).withRequestTimeout(10.seconds).get()
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        getConfig.status == 200,
        (),
        AppError.BadRequestError("Get config impossible")
      )
    } yield parseResponseAsConfig(getConfig.json)

  }

  def checkConnection(authConfig: OAuth2Config)(implicit
      executionContext: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, Unit] = {
    for {
      config <- EitherT.liftF[Future, AppError, WSResponse](
        env.wsClient
          .url(
            authConfig.authorizeUrl
              .replace("/authorize", "/.well-known/openid-configuration")
          )
          .get()
      )
      log = AppLogger.info(config.body)

      // todo: tester les different endpoint...
//      head <- EitherT.liftF[Future, AppError, WSResponse](_env.wsClient.url(s"${authConfig.authorizeUrl}?client_id=${authConfig.clientId}&redirect=${authConfig.callbackUrl}").head())
//      log2 = AppLogger.info(head.statusText)

//      tokenResp <- EitherT.liftF[Future, AppError, WSResponse](_env.wsClient.url(authConfig.tokenUrl).get())
//      log = AppLogger.info(tokenResp.body)
//      _ <- EitherT.cond[Future][AppError, Unit](tokenResp.status == 200, (), AuthenticationError(s"Token endpoint unreacheable : ${tokenResp.status}"))
      testResp <- EitherT.liftF[Future, AppError, WSResponse](
        env.wsClient
          .url(authConfig.tokenUrl)
          .post(
            Map(
              "code" -> "fifou",
              "grant_type" -> "authorization_code",
              "client_id" -> authConfig.clientId,
              "scope" -> authConfig.scope,
              "redirect_uri" -> authConfig.callbackUrl
            ) ++ authConfig.clientSecret
              .map(s => Map("client_secret" -> s))
              .getOrElse(Map.empty)
          )
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        testResp.status == 401,
        (),
        AuthenticationError("configuration KO")
      )
    } yield ()

  }
}
