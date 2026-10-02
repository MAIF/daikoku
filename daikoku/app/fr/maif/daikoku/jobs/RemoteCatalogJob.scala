package fr.maif.daikoku.jobs

import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.domain.{JobName, RemoteCatalog, Tenant}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{
  CatalogSources,
  DeployReport,
  RemoteCatalogEngine
}
import play.api.Logger
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.{Future, Promise}

type CatalogResult = Either[JsValue, DeployReport]

enum RemoteCatalogJobInput:
  case AllEnabled
  case Deploy(catalog: RemoteCatalog, result: Promise[CatalogResult])
  case Undeploy(catalog: RemoteCatalog, result: Promise[CatalogResult])

class RemoteCatalogJob(
    override protected val env: Env,
    engine: RemoteCatalogEngine
) extends AbstractJob[RemoteCatalogJobInput] {

  override protected val logger = Logger("remote-catalog-job")
  override protected val jobName: JobName = JobName.RemoteCatalog
  override protected val lockedBy: String = "remote-catalog-job"
  override protected val defaultInput: RemoteCatalogJobInput =
    RemoteCatalogJobInput.AllEnabled

  override protected val jobConfig: JobConfig = JobConfig(
    enabled = env.config.remoteCatalogJobEnabled,
    schedulingMode = env.config.remoteCatalogJobSchedulingMode,
    cronExpression = env.config.remoteCatalogJobCronExpr,
    interval = env.config.remoteCatalogJobInterval
  )

  override def start(): Unit = {
    CatalogSources.initDefaults()
    super.start()
  }

  def deploy(tenant: Tenant, catalog: RemoteCatalog): Future[CatalogResult] =
    runOne(tenant, RemoteCatalogJobInput.Deploy(catalog, _))

  def undeploy(tenant: Tenant, catalog: RemoteCatalog): Future[CatalogResult] =
    runOne(tenant, RemoteCatalogJobInput.Undeploy(catalog, _))

  private def runOne(
      tenant: Tenant,
      input: Promise[CatalogResult] => RemoteCatalogJobInput
  ): Future[CatalogResult] = {
    val result = Promise[CatalogResult]()

    run(tenant, Runner.Api, input(result)).flatMap {
      case JobOutcome.Skipped(reason) =>
        Future.successful(
          Left(Json.obj("error" -> s"Remote catalogs are busy: $reason"))
        )
      case JobOutcome.Failed(error) =>
        Future.successful(Left(Json.obj("error" -> error)))
      case _ => result.future
    }
  }

  private def activeCatalogs(tenant: Tenant): Future[Seq[RemoteCatalog]] =
    env.dataStore.remoteCatalogRepo
      .forTenant(tenant)
      .findAll()
      .map(_.filter(c => c.enabled && c.scheduling.enabled))

  private def auditDeploy(tenant: Tenant, catalog: RemoteCatalog): Unit =
    JobEvent(s"remote catalog ${catalog.id.value} deployed by job")
      .logJobEvent(
        tenant,
        JobUtils.jobUser,
        Json.obj("catalog" -> catalog.id.value)
      )(using env)

  override protected def skipReason(
      tenant: Tenant,
      input: RemoteCatalogJobInput
  ): Future[Option[String]] =
    input match {
      case RemoteCatalogJobInput.AllEnabled =>
        activeCatalogs(tenant).map(catalogs =>
          if (catalogs.nonEmpty) None
          else Some("no enabled remote catalog")
        )
      case _ => Future.successful(None)
    }

  override protected def process(
      tenant: Tenant,
      input: RemoteCatalogJobInput,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] =
    input match {
      case RemoteCatalogJobInput.AllEnabled =>
        deployAll(tenant, saveCursor)
      case RemoteCatalogJobInput.Deploy(catalog, result) =>
        engine
          .deploy(tenant, catalog)
          .andThen(result.complete(_))
          .map(withResult(JobRunResult.empty, catalog, _))
      case RemoteCatalogJobInput.Undeploy(catalog, result) =>
        engine
          .undeploy(tenant, catalog)
          .andThen(result.complete(_))
          .map(withResult(JobRunResult.empty, catalog, _))
    }

  private def deployAll(
      tenant: Tenant,
      saveCursor: Long => Future[Boolean]
  ): Future[JobRunResult] =
    activeCatalogs(tenant).flatMap(
      _.foldLeft(Future.successful(JobRunResult.empty)) { (accF, catalog) =>
        accF.flatMap { acc =>
          auditDeploy(tenant, catalog)

          engine
            .deploy(tenant, catalog)
            .map(withResult(acc, catalog, _))
            .recover { case e =>
              acc.copy(
                processed = acc.processed + 1,
                failures =
                  acc.failures :+ JobItemFailure(catalog.id.value, e.getMessage)
              )
            }
            .flatMap(next => saveCursor(next.processed).map(_ => next))
        }
      }
    )

  private def withResult(
      acc: JobRunResult,
      catalog: RemoteCatalog,
      result: CatalogResult
  ): JobRunResult =
    result match {
      case Right(report) if report.isPartial =>
        acc.copy(
          processed = acc.processed + 1,
          failures = acc.failures :+ JobItemFailure(
            catalog.id.value,
            report.errors.mkString(", ")
          )
        )
      case Right(_) =>
        acc.copy(processed = acc.processed + 1, succeeded = acc.succeeded + 1)
      case Left(err) =>
        acc.copy(
          processed = acc.processed + 1,
          failures =
            acc.failures :+ JobItemFailure(catalog.id.value, Json.stringify(err))
        )
    }
}
