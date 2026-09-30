package fr.maif.daikoku.jobs

import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.domain.{JobName, RemoteCatalog, Tenant}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSources, RemoteCatalogEngine}
import play.api.Logger
import play.api.libs.json.Json

import scala.concurrent.Future

class RemoteCatalogJob(
    override protected val env: Env,
    engine: RemoteCatalogEngine
) extends AbstractJob[Unit] {

  override protected val logger = Logger("remote-catalog-job")
  override protected val jobName: JobName = JobName.RemoteCatalog
  override protected val lockedBy: String = "remote-catalog-job"
  override protected val defaultInput: Unit = ()

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

  override protected def skipReason(tenant: Tenant): Future[Option[String]] =
    activeCatalogs(tenant).map(catalogs =>
      if (catalogs.nonEmpty) None
      else Some("no enabled remote catalog")
    )

  override protected def process(
      tenant: Tenant,
      input: Unit,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    activeCatalogs(tenant).flatMap(
      _.foldLeft(Future.successful(JobRunResult.empty)) { (accF, catalog) =>
        accF.flatMap { acc =>
          auditDeploy(tenant, catalog)

          engine
            .deploy(tenant, catalog)
            .map {
              case Right(report) if report.isPartial =>
                acc.copy(
                  processed = acc.processed + 1,
                  failures = acc.failures :+ JobItemFailure(
                    catalog.id.value,
                    report.errors.mkString(", ")
                  )
                )
              case Right(_) =>
                acc.copy(
                  processed = acc.processed + 1,
                  succeeded = acc.succeeded + 1
                )
              case Left(err) =>
                acc.copy(
                  processed = acc.processed + 1,
                  failures = acc.failures :+ JobItemFailure(
                    catalog.id.value,
                    Json.stringify(err)
                  )
                )
            }
            .recover { case e =>
              acc.copy(
                processed = acc.processed + 1,
                failures =
                  acc.failures :+ JobItemFailure(catalog.id.value, e.getMessage)
              )
            }
        }
      }
    )
  }
}
