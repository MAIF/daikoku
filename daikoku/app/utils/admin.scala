package fr.maif.otoroshi.daikoku.utils.admin

import java.util.Base64

import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.Source
import akka.util.ByteString
import com.auth0.jwt.JWT
import com.google.common.base.Charsets
import fr.maif.otoroshi.daikoku.domain.{Tenant, ValueType}
import fr.maif.otoroshi.daikoku.env.{Env, LocalAdminApiConfig, OtoroshiAdminApiConfig}
import fr.maif.otoroshi.daikoku.login.TenantHelper
import fr.maif.otoroshi.daikoku.utils.Errors
import play.api.Logger
import play.api.http.HttpEntity
import play.api.libs.json._
import play.api.mvc._
import storage.{DataStore, Repo}

import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

case class DaikokuApiActionContext[A](request: Request[A], tenant: Tenant)

class DaikokuApiAction(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuApiActionContext, AnyContent]
    with ActionFunction[Request, DaikokuApiActionContext] {

  implicit lazy val ec = env.defaultExecutionContext

  def decodeBase64(encoded: String): String = new String(Base64.getUrlDecoder.decode(encoded), Charsets.UTF_8)
  def extractUsernamePassword(header: String): Option[(String, String)] = {
    val base64 = header.replace("Basic ", "").replace("basic ", "")
    Option(base64)
      .map(decodeBase64)
      .map(_.split(":").toSeq)
      .flatMap(a => a.headOption.flatMap(head => a.lastOption.map(last => (head, last))))
  }

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuApiActionContext[A] => Future[Result]): Future[Result] = {
    TenantHelper.withTenant(request, env) { tenant =>
      env.config.adminApiConfig match {
        case OtoroshiAdminApiConfig(headerName, algo) =>
          request.headers.get(headerName) match {
            case Some(value) => {
              Try(JWT.require(algo).build().verify(value)) match {
                case Success(decoded) if !decoded.getClaim("apikey").isNull => {
                  block(DaikokuApiActionContext[A](request, tenant))
                }
                case _ =>
                  Errors.craftResponseResult("No api key provided",
                                             Results.Unauthorized,
                                             request,
                                             None,
                                             env)
              }
            }
            case _ =>
              Errors.craftResponseResult("No api key provided",
                                         Results.Unauthorized,
                                         request,
                                         None,
                                         env)
          }
        case LocalAdminApiConfig(_) =>
          request.headers.get("Authorization") match {
            case Some(auth) if auth.startsWith("Basic ") =>
              extractUsernamePassword(auth) match {
                case None => Errors.craftResponseResult("No api key provided",
                  Results.Unauthorized,
                  request,
                  None,
                  env)
                case Some((clientId, clientSecret)) =>
                  env.dataStore.apiSubscriptionRepo.forTenant(tenant)
                    .findNotDeleted(Json.obj("apiKey.clientId" -> clientId, "apiKey.clientSecret" -> clientSecret))
                    .map(_.length == 1)
                    .flatMap({
                      case done if done => block(DaikokuApiActionContext[A](request, tenant))
                      case _              => Errors.craftResponseResult("No api key provided",
                        Results.Unauthorized,
                        request,
                        None,
                        env)
                    })
              }
          }
      }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class DaikokuApiActionWithoutTenant(val parser: BodyParser[AnyContent],
                                    env: Env)
    extends ActionBuilder[Request, AnyContent]
    with ActionFunction[Request, Request] {

  implicit lazy val ec = env.defaultExecutionContext

  override def invokeBlock[A](
      request: Request[A],
      block: Request[A] => Future[Result]): Future[Result] = {
    println("invokeBlock")
    env.config.adminApiConfig match {
      case OtoroshiAdminApiConfig(headerName, algo) =>
        request.headers.get(headerName) match {
          case Some(value) => {
            Try(JWT.require(algo).build().verify(value)) match {
              case Success(decoded) if !decoded.getClaim("apikey").isNull => {
                block(request)
              }
              case _ =>
                Errors.craftResponseResult("No api key provided",
                                           Results.Unauthorized,
                                           request,
                                           None,
                                           env)
            }
          }
          case _ =>
            Errors.craftResponseResult("No api key provided",
                                       Results.Unauthorized,
                                       request,
                                       None,
                                       env)
        }
      case LocalAdminApiConfig(keyValue) =>
        request
          .getQueryString("key")
          .orElse(request.headers.get("X-Api-Key")) match {
          case Some(key) if key == keyValue => block(request)
          case _ =>
            Errors.craftResponseResult("No api key provided",
                                       Results.Unauthorized,
                                       request,
                                       None,
                                       env)
        }
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

abstract class AdminApiController[Of, Id <: ValueType](
    DaikokuApiAction: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val logger = Logger(s"admin-controller-$entityName")

  def description: String = entityClass.getName
  def pathRoot: String
  def entityName: String
  def entityStore(tenant: Tenant, ds: DataStore): Repo[Of, Id]
  def toJson(entity: Of): JsValue
  def fromJson(entity: JsValue): Either[String, Of]
  def entityClass: Class[Of]

  def findAll() = DaikokuApiAction.async { ctx =>
    val paginationPage: Int = ctx.request.queryString
      .get("page")
      .flatMap(_.headOption)
      .map(_.toInt)
      .getOrElse(1)
    val paginationPageSize: Int =
      ctx.request.queryString
        .get("pageSize")
        .flatMap(_.headOption)
        .map(_.toInt)
        .getOrElse(Int.MaxValue)
    val paginationPosition = (paginationPage - 1) * paginationPageSize
    val allEntities =
      ctx.request.queryString.get("notDeleted").exists(_ == "true") match {
        case true  => entityStore(ctx.tenant, env.dataStore).findAllNotDeleted()
        case false => entityStore(ctx.tenant, env.dataStore).findAll()
      }
    allEntities
      .map(
        all =>
          all
            .drop(paginationPosition)
            .take(paginationPageSize)
            .map(entity => toJson(entity)))
      .map { all =>
        ctx.request.queryString.get("stream").exists(_ == "true") match {
          case true =>
            Ok.sendEntity(
              HttpEntity.Streamed(
                Source(all.map(a => ByteString(Json.stringify(a))).toList),
                None,
                Some("application/x-ndjson")))
          case false => Ok(JsArray(all))
        }
      }
  }

  def findById(id: String) = DaikokuApiAction.async { ctx =>
    val notDeleted: Boolean =
      ctx.request.queryString.get("notDeleted").exists(_ == "true")
    notDeleted match {
      case true =>
        entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id).flatMap {
          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
          case None =>
            Errors.craftResponseResult(s"$entityName not found",
                                       Results.NotFound,
                                       ctx.request,
                                       None,
                                       env)
        }
      case false =>
        entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
          case Some(entity) => FastFuture.successful(Ok(toJson(entity)))
          case None =>
            Errors.craftResponseResult(s"$entityName not found",
                                       Results.NotFound,
                                       ctx.request,
                                       None,
                                       env)
        }
    }
  }

  def createEntity() = DaikokuApiAction.async(parse.json) { ctx =>
    fromJson(ctx.request.body) match {
      case Left(e) =>
        logger.error(s"Bad $entityName format", new RuntimeException(e))
        Errors.craftResponseResult(s"Bad $entityName format",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env)
      case Right(newEntity) =>
        entityStore(ctx.tenant, env.dataStore)
          .save(newEntity)
          .map(_ => Created(toJson(newEntity)))
    }
  }

  def updateEntity(id: String) = DaikokuApiAction.async(parse.json) { ctx =>
    entityStore(ctx.tenant, env.dataStore).findById(id).flatMap {
      case None =>
        Errors.craftResponseResult(s"Entity $entityName not found",
                                   Results.NotFound,
                                   ctx.request,
                                   None,
                                   env)
      case Some(entity) => {
        fromJson(ctx.request.body) match {
          case Left(e) =>
            logger.error(s"Bad $entityName format", new RuntimeException(e))
            Errors.craftResponseResult(s"Bad $entityName format",
                                       Results.BadRequest,
                                       ctx.request,
                                       None,
                                       env)
          case Right(newEntity) => {
            entityStore(ctx.tenant, env.dataStore)
              .save(newEntity)
              .map(_ => Ok(toJson(newEntity)))
          }
        }
      }
    }
  }

  def patchEntity(id: String) = DaikokuApiAction.async(parse.json) { ctx =>
    import cats.implicits._
    import diffson._
    import diffson.jsonpatch.lcsdiff._
    import diffson.lcs._
    import diffson.playJson._

    implicit val lcs: Patience[JsValue] = new Patience[JsValue]

    val fu: Future[Option[Of]] =
      if (ctx.request.queryString.get("notDeleted").contains("true")) {
        entityStore(ctx.tenant, env.dataStore).findByIdNotDeleted(id)
      } else {
        entityStore(ctx.tenant, env.dataStore).findById(id)
      }

    val value: Future[Result] = fu.flatMap {
      case None =>
        Errors.craftResponseResult(s"Entity $entityName not found",
          Results.NotFound,
          ctx.request,
          None,
          env)
      case Some(entity) =>
        val currentJson = toJson(entity)

        val patch = diff(currentJson, ctx.request.body)
        val maybeNewEntity = patch[Try](currentJson)

        maybeNewEntity.map(fromJson) match {
          case Failure(e) =>
            logger.error(s"Bad $entityName format", new RuntimeException(e))
            Errors.craftResponseResult(s"Bad $entityName format",
              Results.BadRequest,
              ctx.request,
              None,
              env)
          case Success(Left(e)) =>
            logger.error(s"Bad $entityName format", new RuntimeException(e))
            Errors.craftResponseResult(s"Bad $entityName format",
              Results.BadRequest,
              ctx.request,
              None,
              env)
          case Success(Right(newNewEntity)) =>
            entityStore(ctx.tenant, env.dataStore)
              .save(newNewEntity)
              .map(_ => Ok(toJson(newNewEntity)))
        }
    }
    value
  }

  def deleteEntity(id: String) = DaikokuApiAction.async { ctx =>
    ctx.request.queryString.get("logically").exists(_ == "true") match {
      case true =>
        entityStore(ctx.tenant, env.dataStore)
          .deleteByIdLogically(id)
          .map(_ => Ok(Json.obj("done" -> true)))
      case false =>
        entityStore(ctx.tenant, env.dataStore)
          .deleteById(id)
          .map(_ => Ok(Json.obj("done" -> true)))
    }
  }

  private def transformType(fieldName: String,
                            fieldType: String,
                            fieldGeneric: Option[String],
                            missing: TrieMap[String, Unit],
                            required: TrieMap[String, Unit]): JsObject = {
    val f = fieldType
    required.putIfAbsent(fieldName, ())
    f match {
      case "int"    => Json.obj("type" -> "integer", "format" -> "int32")
      case "long"   => Json.obj("type" -> "integer", "format" -> "int64")
      case "double" => Json.obj("type" -> "number", "format" -> "float64")
      case "scala.math.BigDecimal" =>
        Json.obj("type" -> "number", "format" -> "float64")
      case "scala.math.BigInteger" =>
        Json.obj("type" -> "integer", "format" -> "int64")
      case "play.api.libs.json.JsObject" => Json.obj("type" -> "object")
      case "play.api.libs.json.JsArray"  => Json.obj("type" -> "array")
      case "org.joda.time.DateTime" =>
        Json.obj("type" -> "integer", "format" -> "timestamp")
      case "java.lang.String" => Json.obj("type" -> "string")
      case "scala.concurrent.duration.FiniteDuration" =>
        Json.obj("type" -> "integer", "format" -> "int64")
      case "scala.collection.immutable.Set" =>
        fieldGeneric match {
          case None => Json.obj("type" -> "any")
          case Some(_generic) =>
            val generic = _generic.replace(">", "").split("\\<").toSeq.apply(1)
            Json.obj("type" -> "array",
                     "items" -> transformType(fieldName,
                                              generic,
                                              None,
                                              missing,
                                              required))
        }
      case "scala.collection.Seq" =>
        fieldGeneric match {
          case None => Json.obj("type" -> "any")
          case Some(_generic) =>
            val generic = _generic.replace(">", "").split("\\<").toSeq.apply(1)
            Json.obj("type" -> "array",
                     "items" -> transformType(fieldName,
                                              generic,
                                              None,
                                              missing,
                                              required))
        }
      case "scala.collection.immutable.Map" => Json.obj("type" -> "object")
      case "scala.Option" =>
        fieldGeneric match {
          case None => Json.obj("type" -> "any")
          case Some(_generic) =>
            required.remove(fieldName)
            val generic = _generic.replace(">", "").split("\\<").toSeq.apply(1)
            transformType(fieldName, generic, None, missing, required)
        }
      case "java.lang.Object" if fieldName == "avgDuration" =>
        Json.obj("type" -> "number", "format" -> "float64")
      case "java.lang.Object" if fieldName == "avgOverhead" =>
        Json.obj("type" -> "number", "format" -> "float64")
      case str
          if str.startsWith("fr.maif.otoroshi.daikoku.domain") && str.endsWith(
            "Id") =>
        Json.obj("type" -> "string")
      case str if str.startsWith("fr.maif.otoroshi.daikoku") =>
        missing.putIfAbsent(str, ())
        Json.obj("$ref" -> s"#/components/schemas/${str.replace("$", ".")}")
      case _ => Json.obj("type" -> f)

    }
  }

  private def properties(clazz: Class[_],
                         missing: TrieMap[String, Unit],
                         required: TrieMap[String, Unit]): JsObject = {
    val fields = (clazz.getDeclaredFields.toSeq).map { f =>
      val a = transformType(f.getName,
                            f.getType.getName,
                            Option(f.getGenericType).map(_.getTypeName),
                            missing,
                            required) // ++ Json.obj("description" -> "--")
      Json.obj(f.getName -> a)
    }
    fields.foldLeft(Json.obj())(_ ++ _)
  }

  private def notFound: String = s"""{
      |  "description": "entity not found",
      |  "content": {
      |    "application/json": {
      |      "schema": {
      |        "$$ref": "#/components/schemas/error"
      |      }
      |    }
      |  }
      |}""".stripMargin

  private def badFormat: String = s"""{
      |  "description": "bad entity format",
      |  "content": {
      |    "application/json": {
      |      "schema": {
      |        "$$ref": "#/components/schemas/error"
      |      }
      |    }
      |  }
      |}""".stripMargin

  private def unauthorized: String = s"""{
     |  "description": "unauthorized",
     |  "content": {
     |    "application/json": {
     |      "schema": {
     |        "$$ref": "#/components/schemas/error"
     |      }
     |    }
     |  }
     |}""".stripMargin

  private def computeRef(ref: String): String = {
    ref match {
      case "play.api.libs.json.JsObject" => "object"
      case _                             => ref
    }
  }

  def openApiPath(implicit env: Env): JsObject = Json.obj(
    s"$pathRoot/{id}" -> Json.obj(
      "delete" -> Json.parse(s"""{
           |  "summary": "delete a $entityName",
           |  "operationId": "${entityName}s.delete",
           |  "responses": {
           |    "401": $unauthorized,
           |    "404": $notFound,
           |    "200": {
           |      "description": "entity deleted",
           |      "content": {
           |        "application/json": {
           |          "schema": {
           |            "$$ref": "#/components/schemas/done"
           |          }
           |        }
           |      }
           |    }
           |  },
           |  "parameters": [
           |    {
           |      "schema": {
           |        "type": "string"
           |      },
           |      "in": "path",
           |      "name": "id",
           |      "required": true
           |    }
           |  ],
           |  "tags": [
           |    "$entityName"
           |  ]
           |}
        """.stripMargin),
      "patch" -> Json.parse(s"""{
           |  "summary": "update a $entityName with JSON patch",
           |  "operationId": "${entityName}s.patch",
           |  "requestBody": {
           |    "description": "the patch to update the $entityName",
           |    "required": true,
           |    "content": {
           |      "application/json": {
           |        "schema": {
           |          "$$ref": "#/components/schemas/patch"
           |        }
           |      }
           |    }
           |  },
           |  "responses": {
           |    "401": $unauthorized,
           |    "404": $notFound,
           |    "200": {
           |      "description": "updated entity",
           |      "content": {
           |        "application/json": {
           |          "schema": {
           |            "type": "object",
           |            "items": {
           |              "$$ref": "#/components/schemas/${computeRef(
                                 entityClass.getName)}"
           |            }
           |          }
           |        }
           |      }
           |    }
           |  },
           |  "parameters": [
           |    {
           |      "schema": {
           |        "type": "string"
           |      },
           |      "in": "path",
           |      "name": "id",
           |      "required": true
           |    }
           |  ],
           |  "tags": [
           |    "$entityName"
           |  ]
           |}
        """.stripMargin),
      "put" -> Json.parse(s"""{
           |  "summary": "update a $entityName",
           |  "operationId": "${entityName}s.update",
           |  "requestBody": {
           |    "description": "the $entityName to update",
           |    "required": true,
           |    "content": {
           |      "application/json": {
           |        "schema": {
           |          "$$ref": "#/components/schemas/${computeRef(
                               entityClass.getName)}"
           |        }
           |      }
           |    }
           |  },
           |  "responses": {
           |    "401": $unauthorized,
           |    "404": $notFound,
           |    "200": {
           |      "description": "updated entity",
           |      "content": {
           |        "application/json": {
           |          "schema": {
           |            "type": "object",
           |            "items": {
           |              "$$ref": "#/components/schemas/${computeRef(
                               entityClass.getName)}"
           |            }
           |          }
           |        }
           |      }
           |    }
           |  },
           |  "parameters": [
           |    {
           |      "schema": {
           |        "type": "string"
           |      },
           |      "in": "path",
           |      "name": "id",
           |      "required": true
           |    }
           |  ],
           |  "tags": [
           |    "$entityName"
           |  ]
           |}
        """.stripMargin),
      "get" -> Json.parse(s"""{
          |  "summary": "read a $entityName",
          |  "operationId": "${entityName}s.findById",
          |  "responses": {
          |    "401": $unauthorized,
          |    "404": $notFound,
          |    "200": {
          |      "description": "found entity",
          |      "content": {
          |        "application/json": {
          |          "schema": {
          |            "type": "object",
          |            "items": {
          |              "$$ref": "#/components/schemas/${computeRef(
                               entityClass.getName)}"
          |            }
          |          }
          |        }
          |      }
          |    }
          |  },
          |  "parameters": [
          |    {
          |      "schema": {
          |        "type": "string"
          |      },
          |      "in": "path",
          |      "name": "id",
          |      "required": true
          |    }
          |  ],
          |  "tags": [
          |    "$entityName"
          |  ]
          |}
        """.stripMargin),
    ),
    s"$pathRoot" -> Json.obj(
      "get" -> Json.parse(s"""{
          |"summary": "read all $entityName",
          |"operationId": "${entityName}s.findAll",
          |"responses": {
          |  "401": $unauthorized,
          |  "200": {
          |    "description": "success",
          |    "content": {
          |      "application/json": {
          |        "schema": {
          |          "$$ref": "#/components/schemas/${computeRef(
                               entityClass.getName)}"
          |        }
          |      }
          |    }
          |  }
          |},
          |"tags": [
          |  "$entityName"
          |]}
        """.stripMargin),
      "post" -> Json.parse(s"""{
          |"summary": "creates a $entityName",
          |"requestBody": {
          |  "description": "the $entityName to create",
          |  "required": true,
          |  "content": {
          |    "application/json": {
          |      "schema": {
          |        "$$ref": "#/components/schemas/${computeRef(
                                entityClass.getName)}"
          |      }
          |    }
          |  }
          |},
          |"operationId": "${entityName}s.create",
          |"responses": {
          |  "401": $unauthorized,
          |  "400": $badFormat,
          |  "201": {
          |    "description": "entity created",
          |    "content": {
          |      "application/json": {
          |        "schema": {
          |          "$$ref": "#/components/schemas/${computeRef(
                                entityClass.getName)}"
          |        }
          |      }
          |    }
          |  }
          |},
          |"tags": [
          |  "$entityName"
          |]}
        """.stripMargin),
    )
  )

  def openApiComponent(implicit env: Env): JsObject = {
    val clazz = entityClass
    val required = new TrieMap[String, Unit]()
    val missing = new TrieMap[String, Unit]()
    val cache = new TrieMap[String, JsObject]()
    if (clazz.getName == "play.api.libs.json.JsObject") {
      Json.obj()
    } else {
      val entity = Json.obj(
        clazz.getName -> cache.getOrElseUpdate(
          clazz.getName,
          Json.obj(
            "description" -> description,
            "properties" -> properties(entityClass, missing, required)
          ) ++ (if (required.isEmpty) {
                  Json.obj()
                } else {
                  Json.obj(
                    "required" -> JsArray(
                      required.keySet.map(JsString.apply).toSeq)
                  )
                })
        )
      )
      def findMissing(miss: Set[String]): JsObject = {
        val requiredd = new TrieMap[String, Unit]()
        val missingg = new TrieMap[String, Unit]()
        val res = miss
          .map { str =>
            val clazzzz = env.environment.classLoader.loadClass(str)
            val ne: JsObject = cache.getOrElseUpdate(
              str,
              Json.obj(
                "description" -> str, // TODO: find actual desc
                "properties" -> properties(clazzzz, missingg, requiredd)
              ) ++ (if (requiredd.isEmpty) {
                      Json.obj()
                    } else {
                      Json.obj(
                        "required" -> JsArray(
                          requiredd.keySet.map(JsString.apply).toSeq)
                      )
                    })
            )
            Json.obj(str -> ne)
          }
          .foldLeft(Json.obj())(_ ++ _)
        if (missingg.isEmpty) {
          res
        } else {
          res ++ findMissing(missingg.keySet.toSet)
        }
      }

      entity ++ Json.obj("object" -> Json.obj("type" -> "object")) ++ Json
        .parse("""{
          |  "done": {
          |    "description": "task is done",
          |    "properties": {
          |      "done": {
          |        "type": "boolean"
          |      }
          |    }
          |  }
          |}
        """.stripMargin)
        .as[JsObject] ++ Json.parse("""{
          |  "error": {
          |    "description": "error response",
          |    "properties": {
          |      "error": {
          |        "type": "string"
          |      }
          |    }
          |  }
          |}
        """.stripMargin).as[JsObject] ++ Json.obj(
        "patch" -> Json.obj(
          "description" -> "A set of changes described in JSON Patch format: http://jsonpatch.com/ (RFC 6902)",
          "type" -> "array",
          "items" -> Json.obj(
            "type" -> "object",
            "required" -> Json.arr("op", "path"),
            "properties" -> Json.obj(
              "op" -> Json.obj(
                "type" -> "string",
                "enum" -> Json.arr("add", "replace", "remove", "copy", "test")
              ),
              "path" -> Json.obj("type" -> "string"),
              "value" -> Json.obj()
            )
          )
        )) ++ findMissing(missing.keySet.toSet)
    }
  }
}
