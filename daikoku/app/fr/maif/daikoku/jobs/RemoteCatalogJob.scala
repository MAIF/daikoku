package fr.maif.daikoku.jobs

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

  private def activeCatalogs(tenant: Tenant): Seq[RemoteCatalog] =
    tenant.remoteCatalogs.filter(c => c.enabled && c.scheduling.enabled)

  override protected def skipReason(tenant: Tenant): Future[Option[String]] =
    Future.successful(
      if (activeCatalogs(tenant).nonEmpty) None
      else Some("no enabled remote catalog")
    )

  override protected def process(
      tenant: Tenant,
      input: Unit,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    activeCatalogs(tenant)
      .foldLeft(Future.successful(JobRunResult.empty)) { (accF, catalog) =>
        accF.flatMap { acc =>
          engine
            .deploy(tenant, catalog, catalog.scheduling.deployArgs)
            .map {
              case Right(_) =>
                acc.copy(
                  processed = acc.processed + 1,
                  succeeded = acc.succeeded + 1
                )
              case Left(err) =>
                acc.copy(
                  processed = acc.processed + 1,
                  failures = acc.failures :+ JobItemFailure(
                    catalog.id,
                    Json.stringify(err)
                  )
                )
            }
            .recover { case e =>
              acc.copy(
                processed = acc.processed + 1,
                failures =
                  acc.failures :+ JobItemFailure(catalog.id, e.getMessage)
              )
            }
        }
      }
  }
}
