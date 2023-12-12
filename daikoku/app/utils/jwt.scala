package fr.maif.otoroshi.daikoku.utils.jwt

import java.security.interfaces.{
  ECPrivateKey,
  ECPublicKey,
  RSAPrivateKey,
  RSAPublicKey
}
import java.util.concurrent.TimeUnit

import org.apache.pekko.http.scaladsl.util.FastFuture
import com.auth0.jwt.algorithms.Algorithm
import com.nimbusds.jose.jwk.{ECKey, JWK, KeyType, RSAKey}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.Logger
import play.api.libs.json._
import org.apache.commons.codec.binary.{Base64 => ApacheBase64}
import utils.PemUtils

import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.Try

trait AsJson {
  def asJson: JsValue
}

trait FromJson[A] {
  def fromJson(json: JsValue): Either[Throwable, A]
}

sealed trait AlgoMode
case class InputMode(typ: String, kid: Option[String]) extends AlgoMode
case object OutputMode extends AlgoMode

sealed trait AlgoSettings extends AsJson {

  def asAlgorithm(mode: AlgoMode)(implicit env: Env): Option[Algorithm]

  def asAlgorithmF(mode: AlgoMode)(
      implicit env: Env,
      ec: ExecutionContext): Future[Option[Algorithm]] = {
    FastFuture.successful(asAlgorithm(mode)(env))
  }

  def transformValue(secret: String)(implicit env: Env): String = {
    AlgoSettings.fromCacheOrNot(
      secret,
      secret match {
        case s if s.startsWith("${config.") => {
          val path = s.replace("}", "").replace("${config.", "")
          env.config.underlying.get[String](path)
        }
        case s if s.startsWith("${env.") => {
          val envName = s.replace("}", "").replace("${env.", "")
          System.getenv(envName)
        }
        case s => s
      }
    )
  }
}
object AlgoSettings extends FromJson[AlgoSettings] {
  override def fromJson(json: JsValue): Either[Throwable, AlgoSettings] =
    Try {
      (json \ "type").as[String] match {
        case "HSAlgoSettings"   => HSAlgoSettings.fromJson(json)
        case "RSAlgoSettings"   => RSAlgoSettings.fromJson(json)
        case "ESAlgoSettings"   => ESAlgoSettings.fromJson(json)
        case "JWKSAlgoSettings" => JWKSAlgoSettings.fromJson(json)
      }
    } recover {
      case e => Left(e)
    } get

  private val cache = new TrieMap[String, String]()

  def fromCacheOrNot(key: String, orElse: => String): String = {
    key match {
      case k if k.startsWith("${") => cache.getOrElseUpdate(key, orElse)
      case k                       => key
    }
  }
}
object HSAlgoSettings extends FromJson[HSAlgoSettings] {
  override def fromJson(json: JsValue): Either[Throwable, HSAlgoSettings] =
    Try {
      Right(
        HSAlgoSettings(
          (json \ "size").as[Int],
          (json \ "secret").as[String]
        )
      )
    } recover {
      case e => Left(e)
    } get
}
case class HSAlgoSettings(size: Int, secret: String) extends AlgoSettings {

  override def asAlgorithm(mode: AlgoMode)(
      implicit env: Env): Option[Algorithm] = size match {
    case 256 => Some(Algorithm.HMAC256(transformValue(secret)))
    case 384 => Some(Algorithm.HMAC384(transformValue(secret)))
    case 512 => Some(Algorithm.HMAC512(transformValue(secret)))
    case _   => None
  }
  override def asJson = Json.obj(
    "type" -> "HSAlgoSettings",
    "size" -> this.size,
    "secret" -> this.secret
  )
}
object RSAlgoSettings extends FromJson[RSAlgoSettings] {
  override def fromJson(json: JsValue): Either[Throwable, RSAlgoSettings] =
    Try {
      Right(
        RSAlgoSettings(
          (json \ "size").as[Int],
          (json \ "publicKey").as[String],
          (json \ "privateKey").asOpt[String]
        )
      )
    } recover {
      case e => Left(e)
    } get
}
case class RSAlgoSettings(size: Int,
                          publicKey: String,
                          privateKey: Option[String])
    extends AlgoSettings {

  def getPublicKey(value: String): RSAPublicKey = {
    val publicBytes = ApacheBase64.decodeBase64(
      value
        .replace("-----BEGIN PUBLIC KEY-----\n", "")
        .replace("\n-----END PUBLIC KEY-----", "")
        .trim()
    )
    //val keySpec    = new X509EncodedKeySpec(publicBytes)
    //val keyFactory = KeyFactory.getInstance("RSA")
    //keyFactory.generatePublic(keySpec).asInstanceOf[RSAPublicKey]
    PemUtils.getPublicKey(publicBytes, "RSA").asInstanceOf[RSAPublicKey]
  }

  def getPrivateKey(value: String): RSAPrivateKey = {
    if (value.trim.isEmpty) {
      null // Yeah, I know ...
    } else {
      val privateBytes = ApacheBase64.decodeBase64(
        value
          .replace("-----BEGIN PRIVATE KEY-----\n", "")
          .replace("\n-----END PRIVATE KEY-----", "")
          .trim()
      )
      // val keySpec    = new PKCS8EncodedKeySpec(privateBytes)
      // val keyFactory = KeyFactory.getInstance("RSA")
      // keyFactory.generatePrivate(keySpec).asInstanceOf[RSAPrivateKey]
      PemUtils.getPrivateKey(privateBytes, "RSA").asInstanceOf[RSAPrivateKey]
    }
  }

  override def asAlgorithm(mode: AlgoMode)(
      implicit env: Env): Option[Algorithm] = size match {
    case 256 =>
      Some(
        Algorithm.RSA256(getPublicKey(transformValue(publicKey)),
                         privateKey
                           .filterNot(_.trim.isEmpty)
                           .map(pk => getPrivateKey(transformValue(pk)))
                           .orNull)
      )
    case 384 =>
      Some(
        Algorithm.RSA384(getPublicKey(transformValue(publicKey)),
                         privateKey
                           .filterNot(_.trim.isEmpty)
                           .map(pk => getPrivateKey(transformValue(pk)))
                           .orNull)
      )
    case 512 =>
      Some(
        Algorithm.RSA512(getPublicKey(transformValue(publicKey)),
                         privateKey
                           .filterNot(_.trim.isEmpty)
                           .map(pk => getPrivateKey(transformValue(pk)))
                           .orNull)
      )
    case _ => None
  }

  override def asJson = Json.obj(
    "type" -> "RSAlgoSettings",
    "size" -> this.size,
    "publicKey" -> this.publicKey,
    "privateKey" -> this.privateKey
      .map(pk => JsString(pk))
      .getOrElse(JsNull)
      .as[JsValue]
  )
}
object ESAlgoSettings extends FromJson[ESAlgoSettings] {
  override def fromJson(json: JsValue): Either[Throwable, ESAlgoSettings] =
    Try {
      Right(
        ESAlgoSettings(
          (json \ "size").as[Int],
          (json \ "publicKey").as[String],
          (json \ "privateKey").asOpt[String]
        )
      )
    } recover {
      case e => Left(e)
    } get
}
case class ESAlgoSettings(size: Int,
                          publicKey: String,
                          privateKey: Option[String])
    extends AlgoSettings {

  def getPublicKey(value: String): ECPublicKey = {
    val publicBytes = ApacheBase64.decodeBase64(
      value
        .replace("-----BEGIN PUBLIC KEY-----\n", "")
        .replace("\n-----END PUBLIC KEY-----", "")
        .trim()
    )
    //val keySpec    = new X509EncodedKeySpec(publicBytes)
    //val keyFactory = KeyFactory.getInstance("EC")
    //keyFactory.generatePublic(keySpec).asInstanceOf[ECPublicKey]
    PemUtils.getPublicKey(publicBytes, "EC").asInstanceOf[ECPublicKey]
  }

  def getPrivateKey(value: String): ECPrivateKey = {
    if (value.trim.isEmpty) {
      null // Yeah, I know ...
    } else {
      val privateBytes = ApacheBase64.decodeBase64(
        value
          .replace("-----BEGIN PRIVATE KEY-----\n", "")
          .replace("\n-----END PRIVATE KEY-----", "")
          .trim()
      )
      //val keySpec    = new PKCS8EncodedKeySpec(privateBytes)
      //val keyFactory = KeyFactory.getInstance("EC")
      //keyFactory.generatePrivate(keySpec).asInstanceOf[ECPrivateKey]
      PemUtils.getPrivateKey(privateBytes, "EC").asInstanceOf[ECPrivateKey]
    }
  }

  override def asAlgorithm(mode: AlgoMode)(
      implicit env: Env): Option[Algorithm] = size match {
    case 256 =>
      Some(
        Algorithm.ECDSA256(getPublicKey(transformValue(publicKey)),
                           privateKey
                             .filterNot(_.trim.isEmpty)
                             .map(pk => getPrivateKey(transformValue(pk)))
                             .orNull)
      )
    case 384 =>
      Some(
        Algorithm.ECDSA384(getPublicKey(transformValue(publicKey)),
                           privateKey
                             .filterNot(_.trim.isEmpty)
                             .map(pk => getPrivateKey(transformValue(pk)))
                             .orNull)
      )
    case 512 =>
      Some(
        Algorithm.ECDSA512(getPublicKey(transformValue(publicKey)),
                           privateKey
                             .filterNot(_.trim.isEmpty)
                             .map(pk => getPrivateKey(transformValue(pk)))
                             .orNull)
      )
    case _ => None
  }

  override def asJson = Json.obj(
    "type" -> "ESAlgoSettings",
    "size" -> this.size,
    "publicKey" -> this.publicKey,
    "privateKey" -> this.privateKey
      .map(pk => JsString(pk))
      .getOrElse(JsNull)
      .as[JsValue]
  )
}
object JWKSAlgoSettings extends FromJson[JWKSAlgoSettings] {

  val cache: TrieMap[String, (Long, Map[String, com.nimbusds.jose.jwk.JWK])] =
    new TrieMap[String, (Long, Map[String, com.nimbusds.jose.jwk.JWK])]()

  override def fromJson(json: JsValue): Either[Throwable, JWKSAlgoSettings] = {
    Try {
      Right(
        JWKSAlgoSettings(
          (json \ "url").as[String],
          (json \ "headers")
            .asOpt[Map[String, String]]
            .getOrElse(Map.empty[String, String]),
          (json \ "timeout")
            .asOpt[Long]
            .map(v => FiniteDuration(v, TimeUnit.MILLISECONDS))
            .getOrElse(FiniteDuration(2000, TimeUnit.MILLISECONDS)),
          (json \ "ttl")
            .asOpt[Long]
            .map(v => FiniteDuration(v, TimeUnit.MILLISECONDS))
            .getOrElse(FiniteDuration(60 * 60 * 1000, TimeUnit.MILLISECONDS)),
          (json \ "kty")
            .asOpt[String]
            .map(v => KeyType.parse(v))
            .getOrElse(KeyType.RSA)
        )
      )
    } recover {
      case e => Left(e)
    } get
  }
}
case class JWKSAlgoSettings(url: String,
                            headers: Map[String, String],
                            timeout: FiniteDuration,
                            ttl: FiniteDuration,
                            kty: KeyType)
    extends AlgoSettings {

  val logger = Logger("jwks")

  def algoFromJwk(alg: String, jwk: JWK): Option[Algorithm] = {
    jwk match {
      case rsaKey: RSAKey =>
        alg match {
          case "RS256" => Some(Algorithm.RSA256(rsaKey.toRSAPublicKey, null))
          case "RS384" => Some(Algorithm.RSA384(rsaKey.toRSAPublicKey, null))
          case "RS512" => Some(Algorithm.RSA512(rsaKey.toRSAPublicKey, null))
        }
      case ecKey: ECKey =>
        alg match {
          case "EC256" => Some(Algorithm.ECDSA256(ecKey.toECPublicKey, null))
          case "EC384" => Some(Algorithm.ECDSA384(ecKey.toECPublicKey, null))
          case "EC512" => Some(Algorithm.ECDSA512(ecKey.toECPublicKey, null))
        }
      case _ => None
    }
  }

  override def asAlgorithm(mode: AlgoMode)(
      implicit env: Env): Option[Algorithm] = {
    Await.result(asAlgorithmF(mode)(env, env.defaultExecutionContext), timeout)
  }

  override def asAlgorithmF(mode: AlgoMode)(
      implicit env: Env,
      ec: ExecutionContext): Future[Option[Algorithm]] = {
    mode match {
      case InputMode(alg, Some(kid)) => {
        JWKSAlgoSettings.cache.get(url) match {
          case Some((stop, keys)) if stop > System.currentTimeMillis() => {
            keys.get(kid) match {
              case Some(jwk) => FastFuture.successful(algoFromJwk(alg, jwk))
              case None      => FastFuture.successful(None)
            }
          }
          case _ => {
            env.wsClient
              .url(url)
              .withRequestTimeout(timeout)
              .withHttpHeaders(headers.toSeq: _*)
              .get()
              .map { resp =>
                val stop = System.currentTimeMillis() + ttl.toMillis
                val obj = Json.parse(resp.body).as[JsObject]
                (obj \ "keys").asOpt[JsArray] match {
                  case Some(values) => {
                    val keys = values.value.map { k =>
                      val jwk = JWK.parse(Json.stringify(k))
                      (jwk.getKeyID, jwk)
                    }.toMap
                    JWKSAlgoSettings.cache.put(url, (stop, keys))
                    keys.get(kid) match {
                      case Some(jwk) => algoFromJwk(alg, jwk)
                      case None      => None
                    }
                  }
                  case None => None
                }
              }
              .recover {
                case e =>
                  logger.error(s"Error while reading JWKS $url", e)
                  None
              }
          }
        }
      }
      case _ => FastFuture.successful(None)
    }
  }

  override def asJson: JsValue = Json.obj(
    "type" -> "JWKSAlgoSettings",
    "url" -> url,
    "timeout" -> timeout.toMillis,
    "headers" -> headers,
    "ttl" -> ttl.toMillis,
    "kty" -> kty.getValue
  )
}
