package fr.maif.otoroshi.daikoku.audit

import java.util.Base64
import java.util.concurrent.{ConcurrentHashMap, TimeUnit}
import akka.actor.{Actor, ActorSystem, PoisonPill, Props, Terminated}
import akka.http.scaladsl.util.FastFuture
import akka.http.scaladsl.util.FastFuture._
import akka.kafka.ProducerSettings
import akka.stream.scaladsl.{Flow, Keep, Sink, Source}
import akka.stream.{OverflowStrategy, QueueOfferResult}
import akka.{Done, NotUsed}
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.RequestImplicits._
import fr.maif.otoroshi.daikoku.utils.Translator
import org.apache.kafka.clients.CommonClientConfigs
import org.apache.kafka.clients.producer.{Callback, KafkaProducer, Producer, ProducerRecord, RecordMetadata}
import org.apache.kafka.common.config.SslConfigs
import org.apache.kafka.common.config.internals.BrokerSecurityConfigs
import org.apache.kafka.common.serialization.{ByteArraySerializer, StringSerializer}
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.Logger
import play.api.i18n.{I18nSupport, Lang, MessagesApi}
import play.api.libs.json._
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader
import reactivemongo.bson.BSONObjectID

import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.{FiniteDuration, _}
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.util.control.NonFatal
import scala.util.{Failure, Success}

sealed trait AuthorizationLevel {
  def value: String
}
object AuthorizationLevel {

  case object NotAuthorized extends AuthorizationLevel {
    override def value: String = "NotAuthorized"
  }

  case object AuthorizedUberPublic extends AuthorizationLevel {
    override def value: String = "AuthorizedUberPublic"
  }
  case object AuthorizedPublic extends AuthorizationLevel {
    override def value: String = "AuthorizedPublic"
  }

  case object AuthorizedTeamMember extends AuthorizationLevel {
    override def value: String = "AuthorizedTeamMember"
  }

  case object AuthorizedTeamApiEditor extends AuthorizationLevel {
    override def value: String = "AuthorizedTeamApiEditor"
  }

  case object AuthorizedTeamAdmin extends AuthorizationLevel {
    override def value: String = "AuthorizedTeamAdmin"
  }

  case object AuthorizedTenantAdmin extends  AuthorizationLevel {
    override def value: String = "AuthorizedTenantAdmin"
  }

  case object AuthorizedDaikokuAdmin extends AuthorizationLevel {
    override def value: String = "AuthorizedDaikokuAdmin"
  }

  case object AuthorizedSelf extends AuthorizationLevel {
    override def value: String = "AuthorizedSelf"
  }

  case object AuthorizedJob extends AuthorizationLevel {
    override def value: String = "AuthorizedJob"
  }
}

sealed trait AuditEvent {
  def message: String
  def logTenantAuditEvent(tenant: Tenant,
                          user: User,
                          session: UserSession,
                          req: RequestHeader,
                          ctx: TrieMap[String, String],
                          authorized: AuthorizationLevel,
                          details: JsObject = Json.obj())(
      implicit ec: ExecutionContext,
      env: Env): Unit = {
    session.impersonatorId.map { iid =>
      env.dataStore.userRepo.findById(iid)
    } getOrElse {
      FastFuture.successful(None)
    } map { impersonator =>
      env.auditActor ! TenantAuditEvent(this,
                                        tenant,
                                        user,
                                        impersonator,
                                        Some(req.relativeUri),
                                        Some(req.method),
                                        ctx,
                                        authorized,
                                        details)
    }
  }

  def logJobEvent(tenant: Tenant, user: User, details: JsObject = Json.obj())(
      implicit ec: ExecutionContext,
      env: Env): Unit = {
    env.auditActor ! TenantAuditEvent(this,
                                      tenant,
                                      user,
                                      None,
                                      None,
                                      None,
                                      new TrieMap[String, String](),
                                      AuthorizationLevel.AuthorizedJob,
                                      details)
  }

  def logUnauthenticatedUserEvent(tenant: Tenant, details: JsObject = Json.obj())(
    implicit ec: ExecutionContext,
    env: Env): Unit = {
    env.auditActor ! TenantAuditEvent(this,
      tenant,
      User(
        UserId("Unauthenticated user"),
        tenants = Set.empty,
        origins = Set.empty,
        name = "Unauthenticated user",
        email = "unauthenticated@foo.bar",
        personalToken = None,
        lastTenant = None,
        defaultLanguage = None
      ),
      None,
      None,
      None,
      new TrieMap[String, String](),
      AuthorizationLevel.AuthorizedUberPublic,
      details)
  }
}
case class AuditTrailEvent(message: String) extends AuditEvent
case class JobEvent(message: String) extends AuditEvent
case class AlertEvent(message: String) extends AuditEvent
case class ApiKeyRotationEvent(message: String = "", subscription: ApiSubscriptionId) extends AuditEvent

case class TenantAuditEvent(evt: AuditEvent,
                            tenant: Tenant,
                            user: User,
                            impersonator: Option[User],
                            uri: Option[String],
                            verb: Option[String],
                            ctx: TrieMap[String, String],
                            authorized: AuthorizationLevel,
                            details: JsObject = Json.obj()) {

  private def theType: String = evt match {
    case _: AuditTrailEvent     => "AuditTrailEvent"
    case _: AlertEvent          => "AlertEvent"
    case _: JobEvent            => "JobEvent"
    case _: ApiKeyRotationEvent => "ApiKeyRotationEvent"
  }

  def computedMessage(): String = {
    val init = evt.message
      .replace("@{tenant.id}", tenant.id.value)
      .replace("@{tenant.name}", tenant.name)
      .replace("@{tenant.enabled}", tenant.enabled.toString)
      .replace("@{user.id}", user.id.value)
      .replace("@{user.name}", user.name)
      .replace("@{user.email}", user.email)
      .replace("@{impersonator.id}",
               impersonator.map(_.id.value).getOrElse("--"))
      .replace("@{impersonator.name}", impersonator.map(_.name).getOrElse("--"))
      .replace("@{impersonator.email}",
               impersonator.map(_.email).getOrElse("--"))
      .replace("@{authorized}", authorized.value)
    ctx.foldLeft(init)((a, b) => a.replace(s"@{${b._1}}", b._2))
  }

  def toJson(implicit env: Env): JsObject = Json.obj(
    "_id" -> BSONObjectID.generate().stringify,
    "@type" -> theType,
    "@id" -> env.snowflakeGenerator.nextIdStr(),
    "@timestamp" -> play.api.libs.json.JodaWrites.JodaDateTimeNumberWrites
      .writes(DateTime.now()),
    "@tenantId" -> tenant.id.value,
    "@userId" -> user.id.value,
    "message" -> computedMessage(),
    "url" -> uri.getOrElse("--").asInstanceOf[String],
    "verb" -> verb.getOrElse("--").asInstanceOf[String],
    "user" -> Json.obj(
      "id" -> user.id.value,
      "email" -> user.email,
      "name" -> user.name,
      "isDaikokuAdmin" -> user.isDaikokuAdmin,
    ),
    "tenant" -> Json.obj(
      "id" -> tenant.id.value,
      "name" -> tenant.name,
    ),
    "authorized" -> authorized.value,
    "impersonator" -> impersonator
      .map(
        a =>
          Json.obj(
            "id" -> a.id.value,
            "name" -> a.name,
            "email" -> a.email,
            "isDaikokuAdmin" -> a.isDaikokuAdmin
        ))
      .getOrElse(JsNull)
      .as[JsValue]
    // TODO: add complete tenant ?
    // TODO: add complete user ?
  )
}

case object SendToAnalytics

object AuditActor {
  def props(implicit env: Env, messagesApi: MessagesApi, translator: Translator) = Props(new AuditActor())
}

class AuditActor(implicit env: Env, messagesApi: MessagesApi, translator: Translator) extends Actor {

  implicit lazy val ec = env.defaultExecutionContext

  lazy val logger = Logger("audit-actor")
  lazy val console = Logger("audit-console")

  lazy val kafkaWrapperAudit =
    new KafkaWrapper(env.defaultActorSystem, env, _.auditTopic)

  def sendAlertsEmails(tenant: Tenant,
                       rawEvts: Seq[TenantAuditEvent]): Future[Unit] = {
    tenant.auditTrailConfig.alertsEmails match {
      case e if e.isEmpty => FastFuture.successful(())
      case emails => {
        val evts = rawEvts.filter { te =>
          te.evt match {
            case _: AuditTrailEvent     => false
            case _: JobEvent            => false
            case _: AlertEvent          => true
            case _: ApiKeyRotationEvent => false
          }
        }
        val titles = evts
          .map(_.toJson)
          .map { jsonEvt =>
            val date = new DateTime((jsonEvt \ "@timestamp").as[Long])
            val id = (jsonEvt \ "@id").as[String]
            s"""<li><a href="#$id">""" + (jsonEvt \ "alert")
              .asOpt[String]
              .getOrElse("Unkown alert") + s" - ${date.toString()}</a></li>"
          }
          .mkString("<ul>", "\n", "</ul>")

        val email = evts
          .map(_.toJson)
          .map { jsonEvt =>
            val alert =
              (jsonEvt \ "alert").asOpt[String].getOrElse("Unkown alert")
            val message = (jsonEvt \ "audit" \ "message")
              .asOpt[String]
              .getOrElse("No description message")
            val date = new DateTime((jsonEvt \ "@timestamp").as[Long])
            val id = (jsonEvt \ "@id").as[String]
            s"""<h3 id="$id">$alert - ${date.toString()}</h3><pre>${Json
              .prettyPrint(jsonEvt)}</pre><br/>"""
          }
          .mkString("\n")

        val emailBody =
          s"""<p>${evts.size} new alerts occured on Daikoku</p>
             |$titles
             |
         |$email""".stripMargin

        if (evts.size > 1) {
          tenant.mailer.send(s"Otoroshi Alert - ${evts.size} new alerts",
            emails,
            emailBody)
        } else {
          FastFuture.successful(())
        }
      }
    }
  }

  def sendRotationEmails(tenant: Tenant,
                       rawEvts: Seq[TenantAuditEvent]): Future[Done] = {
    import cats.data.OptionT
    import cats.implicits._

    Source(rawEvts.toList)
      .filter { te =>
        te.evt match {
          case _: AuditTrailEvent     => false
          case _: JobEvent            => false
          case _: AlertEvent          => true
          case _: ApiKeyRotationEvent => false
        }
      }
      .mapAsync(10) { event =>
        implicit val language: String = tenant.defaultLanguage.getOrElse("en")
        val mailSend: OptionT[Future, Future[Unit]] = for {
          subscription <- OptionT(env.dataStore.apiSubscriptionRepo.forTenant(tenant).findById(event.asInstanceOf[ApiKeyRotationEvent].subscription))
          api <- OptionT(env.dataStore.apiRepo.forTenant(tenant).findById(subscription.api))
          team <- OptionT(env.dataStore.teamRepo.forTenant(tenant).findById(subscription.team))
          admins <- OptionT.liftF(env.dataStore.userRepo.find(
            Json.obj("_id" -> Json.obj("$in" -> JsArray(team.users.filter(_.teamPermission == TeamPermission.Administrator).map(_.userId.asJson).toSeq)))))
          plan <- OptionT.liftF(api.possibleUsagePlans
            .find(p => p.id == subscription.plan) match {
              case Some(p) => FastFuture.successful(p.customName.getOrElse(p.typeName))
              case None => translator.translate("unknown.plan", tenant)
            })
          title <- OptionT.liftF(translator.translate("mail.apikey.rotation.title", tenant))
          body <- OptionT.liftF(translator.translate("mail.apikey.rotation.body", tenant, Map(
          "apiName" -> api.name,
          "planName" -> plan
          )))
        } yield {
          tenant.mailer.send(title, admins.map(_.email), body)
        }
        mailSend.value
      }
      .runWith(Sink.ignore)(env.defaultMaterializer)

  }

  lazy val stream = Source
    .queue[TenantAuditEvent](50000, OverflowStrategy.dropHead)
    .groupedWithin(100, FiniteDuration(10, TimeUnit.SECONDS))
    .mapAsync(5) { allEvts =>
      logger.debug(s"SEND_TO_ANALYTICS_HOOK: will send ${allEvts.size} evts")
      Future.sequence(allEvts.groupBy(_.tenant.id).map { tuple =>
        val (_, evts) = tuple
        val tenant = evts.last.tenant
        val config = tenant.auditTrailConfig
        logger.debug("SEND_TO_ANALYTICS_HOOK: " + config.auditWebhooks)
        config.kafkaConfig.foreach { kafkaConfig =>
          evts.foreach {
            case evt => kafkaWrapperAudit.publish(evt.toJson)(env, kafkaConfig)
          }
          if (config.kafkaConfig.isEmpty) {
            kafkaWrapperAudit.close()
          }
        }
        evts.foreach(evt => console.debug(Json.stringify(evt.toJson)))
        Future.sequence(
          Seq(
            env.dataStore.auditTrailRepo
              .forTenant(tenant)
              .insertMany(evts.map(_.toJson))) ++
            Seq(sendRotationEmails(tenant, evts)) ++
            Seq(sendAlertsEmails(tenant, evts)) ++
            config.auditWebhooks
              .map(c => new WebHookAnalytics(c).publish(evts)) ++
            config.elasticConfigs.map(c =>
              new ElasticWritesAnalytics(c, env).publish(evts))
        )
      })
    }

  lazy val (queue, done) =
    stream.toMat(Sink.ignore)(Keep.both).run()(env.defaultMaterializer)

  override def receive: Receive = {
    case ge: TenantAuditEvent => {
      logger.debug("SEND_TO_ANALYTICS: Event sent to stream")
      val myself = self
      queue.offer(ge).andThen {
        case Success(QueueOfferResult.Enqueued) =>
          logger.debug("SEND_TO_ANALYTICS: Event enqueued")
        case Success(QueueOfferResult.Dropped) =>
          logger.error(
            "SEND_TO_ANALYTICS_ERROR: Enqueue Dropped AnalyticEvent :(")
        case Success(QueueOfferResult.QueueClosed) =>
          logger.error("SEND_TO_ANALYTICS_ERROR: Queue closed :(")
          context.stop(myself)
        case Success(QueueOfferResult.Failure(t)) =>
          logger.error(
            "SEND_TO_ANALYTICS_ERROR: Enqueue Failure AnalyticEvent :(",
            t)
          context.stop(myself)
        case Failure(e) =>
          logger.error(s"SEND_TO_ANALYTICS_ERROR: analytics actor error : $e", e)
          context.stop(myself)
      }
    }
    case _ =>
  }
}

class AuditActorSupervizer(env: Env, messagesApi: MessagesApi, translator: Translator) extends Actor {

  lazy val childName = "audit-actor"
  lazy val logger = Logger("audit-actor-supervizer")

  override def receive: Receive = {
    case Terminated(ref) =>
      logger.debug("Restarting analytics actor child")
      context.watch(context.actorOf(AuditActor.props(env, messagesApi, translator), childName))
    case evt => context.child(childName).map(_ ! evt)
  }

  override def preStart(): Unit =
    if (context.child(childName).isEmpty) {
      logger.debug(s"Starting new child $childName")
      val ref = context.actorOf(AuditActor.props(env, messagesApi, translator), childName)
      context.watch(ref)
    }

  override def postStop(): Unit =
    context.children.foreach(_ ! PoisonPill)
}

object AuditActorSupervizer {
  def props(implicit env: Env, messagesApi: MessagesApi, translator: Translator) = Props(new AuditActorSupervizer(env, messagesApi, translator))
}

case class KafkaConfig(servers: Seq[String],
                       keyPass: Option[String] = None,
                       keystore: Option[String] = None,
                       truststore: Option[String] = None,
                       auditTopic: String = "daikoku-audit",
                       hostValidation: Option[Boolean] = Some(true)
                      )

object KafkaConfig {
  implicit val format = Json.format[KafkaConfig]
}

object KafkaSettings {

  def producerSettings(
      _env: Env,
      config: KafkaConfig): ProducerSettings[Array[Byte], String] = {
    val settings = ProducerSettings
      .create(_env.defaultActorSystem,
              new ByteArraySerializer(),
              new StringSerializer())
      .withBootstrapServers(config.servers.mkString(","))

    val s = for {
      ks <- config.keystore
      ts <- config.truststore
      kp <- config.keyPass
    } yield {
      val kafkaSettings = settings
        .withProperty(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SSL")
        .withProperty(BrokerSecurityConfigs.SSL_CLIENT_AUTH_CONFIG, "required")
        .withProperty(SslConfigs.SSL_KEY_PASSWORD_CONFIG, kp)
        .withProperty(SslConfigs.SSL_KEYSTORE_LOCATION_CONFIG, ks)
        .withProperty(SslConfigs.SSL_KEYSTORE_PASSWORD_CONFIG, kp)
        .withProperty(SslConfigs.SSL_TRUSTSTORE_LOCATION_CONFIG, ts)
        .withProperty(SslConfigs.SSL_TRUSTSTORE_PASSWORD_CONFIG, kp)

      if (config.hostValidation.contains(true)) {
        kafkaSettings
      } else {
        kafkaSettings
          .withProperty(SslConfigs.SSL_ENDPOINT_IDENTIFICATION_ALGORITHM_CONFIG, "")
      }
    }

    s.getOrElse(settings)
  }
}

case class KafkaWrapperEvent(event: JsValue, env: Env, config: KafkaConfig)
case class KafkaWrapperEventClose()

class KafkaWrapper(actorSystem: ActorSystem,
                   env: Env,
                   topicFunction: KafkaConfig => String) {

  val kafkaWrapperActor =
    actorSystem.actorOf(KafkaWrapperActor.props(env, topicFunction))

  def publish(event: JsValue)(env: Env, config: KafkaConfig): Future[Done] = {
    kafkaWrapperActor ! KafkaWrapperEvent(event, env, config)
    FastFuture.successful(Done)
  }

  def close(): Unit = {
    kafkaWrapperActor ! KafkaWrapperEventClose()
  }
}

class KafkaWrapperActor(env: Env, topicFunction: KafkaConfig => String)
    extends Actor {

  implicit val ec = env.defaultExecutionContext

  var config: Option[KafkaConfig] = None
  var eventProducer: Option[KafkaEventProducer] = None

  lazy val logger = play.api.Logger("kafka-wrapper")

  override def receive: Receive = {
    case event: KafkaWrapperEvent
        if config.isEmpty && eventProducer.isEmpty => {
      config = Some(event.config)
      eventProducer.foreach(_.close())
      eventProducer = Some(
        new KafkaEventProducer(event.env, event.config, topicFunction))
      eventProducer.get.publish(event.event).andThen {
        case Failure(e) => logger.error("Error while pushing event to kafka", e)
      }
    }
    case event: KafkaWrapperEvent
        if config.isDefined && config.get != event.config => {
      config = Some(event.config)
      eventProducer.foreach(_.close())
      eventProducer = Some(
        new KafkaEventProducer(event.env, event.config, topicFunction))
      eventProducer.get.publish(event.event).andThen {
        case Failure(e) => logger.error("Error while pushing event to kafka", e)
      }
    }
    case event: KafkaWrapperEvent =>
      eventProducer.get.publish(event.event).andThen {
        case Failure(e) => logger.error("Error while pushing event to kafka", e)
      }
    case KafkaWrapperEventClose() =>
      eventProducer.foreach(_.close())
      config = None
      eventProducer = None
    case _ =>
  }
}

object KafkaWrapperActor {
  def props(env: Env, topicFunction: KafkaConfig => String) =
    Props(new KafkaWrapperActor(env, topicFunction))
}

class KafkaEventProducer(_env: Env,
                         config: KafkaConfig,
                         topicFunction: KafkaConfig => String) {

  implicit val ec = _env.defaultExecutionContext

  lazy val logger = play.api.Logger("kafka-connector")

  lazy val topic = topicFunction(config)

  logger.debug(s"Initializing kafka event store on topic ${topic}")

  private lazy val producerSettings =
    KafkaSettings.producerSettings(_env, config)
  private lazy val producer: Producer[Array[Byte], String] =
    producerSettings.createKafkaProducer

  def publish(event: JsValue): Future[Done] = {
    val promise = Promise[RecordMetadata]
    try {
      val message = Json.stringify(event)
      producer.send(new ProducerRecord[Array[Byte], String](topic, message),
                    callback(promise))
    } catch {
      case NonFatal(e) =>
        promise.failure(e)
    }
    promise.future.fast.map { _ =>
      Done
    }
  }

  def close() =
    producer.close()

  private def callback(promise: Promise[RecordMetadata]) = new Callback {
    override def onCompletion(metadata: RecordMetadata, exception: Exception) =
      if (exception != null) {
        promise.failure(exception)
      } else {
        promise.success(metadata)
      }

  }
}

object ElasticTemplates {
  val indexTemplate =
    """{
      |  "template": "$$$INDEX$$$-*",
      |  "settings": {
      |    "number_of_shards": 1,
      |    "index": {
      |    }
      |  },
      |  "mappings": {
      |    "_default_": {
      |      "date_detection": false,
      |      "dynamic_templates": [
      |        {
      |          "string_template": {
      |            "match": "*",
      |            "mapping": {
      |              "type": "text",
      |              "fielddata": true
      |            },
      |            "match_mapping_type": "string"
      |          }
      |        }
      |      ],
      |      "properties": {
      |        "@id": {
      |          "type": "keyword"
      |        },
      |        "@timestamp": {
      |          "type": "date"
      |        },
      |        "@created": {
      |          "type": "date"
      |        },
      |        "@type": {
      |          "type": "keyword"
      |        },
      |        "@tenantId": {
      |          "type": "keyword"
      |        },
      |        "@userId": {
      |          "type": "keyword"
      |        }
      |      }
      |    }
      |  }
      |}
    """.stripMargin
}

object ElasticWritesAnalytics {

  import scala.jdk.CollectionConverters._

  val clusterInitializedCache = new ConcurrentHashMap[String, Boolean]()

  def toKey(config: ElasticAnalyticsConfig): String =
    s"${config.clusterUri}/${config.index}/${config.`type`}"

  def initialized(config: ElasticAnalyticsConfig): Unit = {
    clusterInitializedCache.putIfAbsent(toKey(config), true)
  }

  def isInitialized(config: ElasticAnalyticsConfig): Boolean = {
    clusterInitializedCache.asScala.getOrElse(toKey(config), false)
  }
}

class ElasticWritesAnalytics(config: ElasticAnalyticsConfig, env: Env) {

  lazy val logger = Logger("audit-writes-elastic")

  private def urlFromPath(path: String): String = s"${config.clusterUri}$path"
  private val index: String = config.index.getOrElse("otoroshi-events")
  private val `type`: String = config.`type`.getOrElse("event")
  private implicit val mat = env.defaultMaterializer

  private def url(url: String): WSRequest = {
    val builder = env.wsClient.url(url)
    authHeader()
      .fold(builder) { h =>
        builder.withHttpHeaders("Authorization" -> h)
      }
      .addHttpHeaders(config.headers.toSeq: _*)
  }

  def init(): Unit = {
    if (ElasticWritesAnalytics.isInitialized(config)) {
      ()
    } else {
      implicit val ec: ExecutionContext = env.defaultExecutionContext
      val strTpl = ElasticTemplates.indexTemplate
      val tpl: JsValue = Json.parse(strTpl.replace("$$$INDEX$$$", index))
      logger.info(
        s"Creating Otoroshi template for $index on es cluster at ${config.clusterUri}/${config.index}/${config.`type`}"
      )
      logger.debug(
        s"Creating otoroshi template with \n${Json.prettyPrint(tpl)}")
      Await.result(
        url(urlFromPath("/_template/daikoku-tpl"))
          .get()
          .flatMap { resp =>
            resp.status match {
              case 200 =>
                val tplCreated =
                  url(urlFromPath("/_template/daikoku-tpl")).put(tpl)
                tplCreated.onComplete {
                  case Success(r) if r.status >= 400 =>
                    logger.error(
                      s"Error creating template ${r.status}: ${r.body}")
                  case Failure(e) =>
                    logger.error("Error creating template", e)
                  case _ =>
                    logger.debug("Otoroshi template created")
                    ElasticWritesAnalytics.initialized(config)
                }
                tplCreated.map(_ => ())
              case 404 =>
                val tplCreated =
                  url(urlFromPath("/_template/otoroshi-tpl")).post(tpl)
                tplCreated.onComplete {
                  case Success(r) if r.status >= 400 =>
                    logger.error(
                      s"Error creating template ${r.status}: ${r.body}")
                  case Failure(e) =>
                    logger.error("Error creating template", e)
                  case _ =>
                    logger.debug("Otoroshi template created")
                    ElasticWritesAnalytics.initialized(config)
                }
                tplCreated.map(_ => ())
              case _ =>
                logger.error(
                  s"Error creating template ${resp.status}: ${resp.body}")
                FastFuture.successful(())
            }
          },
        5.second
      )
    }
  }

  init()

  private def bulkRequest(source: JsValue): String = {
    val df = ISODateTimeFormat.date().print(DateTime.now())
    val indexWithDate = s"$index-$df"
    val indexClause = Json.stringify(
      Json.obj(
        "index" -> Json.obj("_index" -> indexWithDate, "_type" -> `type`)))
    val sourceClause = Json.stringify(source)
    s"$indexClause\n$sourceClause"
  }

  private def authHeader(): Option[String] = {
    for {
      user <- config.user
      password <- config.password
    } yield
      s"Basic ${Base64.getEncoder.encodeToString(s"$user:$password".getBytes())}"
  }

  def publish(event: Seq[TenantAuditEvent])(
      implicit env: Env,
      ec: ExecutionContext): Future[Unit] = {
    val builder = env.wsClient.url(urlFromPath("/_bulk"))

    val clientInstance = authHeader()
      .fold {
        builder.withHttpHeaders(
          "Content-Type" -> "application/x-ndjson"
        )
      } { h =>
        builder.withHttpHeaders(
          "Authorization" -> h,
          "Content-Type" -> "application/x-ndjson"
        )
      }
      .addHttpHeaders(config.headers.toSeq: _*)
    Source(event.toList)
      .map(_.toJson)
      .grouped(500)
      .map(_.map(bulkRequest))
      .mapAsync(10) { bulk =>
        val req = bulk.mkString("", "\n", "\n\n")
        val post = clientInstance.post(req)
        post.onComplete {
          case Success(resp) =>
            if (resp.status >= 400) {
              logger.error(
                s"Error publishing event to elastic: ${resp.status}, ${resp.body} --- event: $event")
            }
          case Failure(e) =>
            logger.error(s"Error publishing event to elastic", e)
        }
        post
      }
      .runWith(Sink.ignore)
      .map(_ => ())
  }
}

class WebHookAnalytics(webhook: Webhook) {

  lazy val logger = Logger("otoroshi-analytics-webhook")

  def basicCall(path: String,
                service: Option[String],
                from: Option[DateTime],
                to: Option[DateTime],
                page: Option[Int] = None,
                size: Option[Int] = None)(
      implicit env: Env,
      ec: ExecutionContext): Future[Option[JsValue]] =
    env.wsClient
      .url(webhook.url + path)
      .withHttpHeaders(webhook.headers.toSeq: _*)
      .withQueryStringParameters(
        defaultParams(service, from, to, page, size): _*)
      .get()
      .map(_.json)
      .map(r => Some(r))

  private def defaultParams(service: Option[String],
                            from: Option[DateTime],
                            to: Option[DateTime],
                            page: Option[Int] = None,
                            size: Option[Int] = None): Seq[(String, String)] =
    Seq(
      service.map(s => "services" -> s),
      page.map(s => "page" -> s.toString),
      size.map(s => "size" -> s.toString),
      Some(
        "from" -> from
          .getOrElse(DateTime.now().minusHours(1))
          .toString("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
      ),
      Some(
        "to" -> to
          .getOrElse(DateTime.now())
          .toString("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
      )
    ).flatten

  def publish(event: Seq[TenantAuditEvent])(
      implicit env: Env,
      ec: ExecutionContext): Future[Unit] = {
    val headers: Seq[(String, String)] = webhook.headers.toSeq

    val url = event.headOption
      .map(evt => webhook.url)
      .getOrElse(webhook.url)
    val postResponse = env.wsClient
      .url(url)
      .withHttpHeaders(headers: _*)
      .post(JsArray(event.map(_.toJson)))
    postResponse.andThen {
      case Success(resp) => {
        logger.debug(
          s"SEND_TO_ANALYTICS_SUCCESS: ${resp.status} - ${resp.headers} - ${resp.body}")
      }
      case Failure(e) => {
        logger.error(
          "SEND_TO_ANALYTICS_FAILURE: Error while sending AnalyticEvent",
          e)
      }
    }
    postResponse.map(_ => ())
  }
}
