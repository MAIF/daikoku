package fr.maif.daikoku.jobs

import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.{
  JobName,
  SchedulingMode,
  SubscriptionBatchDemandId,
  SubscriptionBatchReference,
  Tenant
}
import fr.maif.daikoku.env.{DaikokuMode, Env}
import fr.maif.daikoku.services.{ApiService, SubscriptionBatchService}
import play.api.Logger

import scala.concurrent.{ExecutionContext, Future}

class SubscriptionBatchMaterializationJob(
    override protected val env: Env,
    batchService: SubscriptionBatchService,
    apiService: ApiService
) extends AbstractJob[Option[SubscriptionBatchDemandId]] {

  override protected val logger = Logger(
    "subscription-batch-materialization-job"
  )
  override protected val jobName: JobName =
    JobName.SubscriptionBatchMaterialization
  override protected val lockedBy: String =
    "subscription-batch-materialization-job"
  override protected val defaultInput: Option[SubscriptionBatchDemandId] = None

  override protected val jobConfig: JobConfig = JobConfig(
    enabled = true,
    schedulingMode = SchedulingMode.Interval,
    cronExpression = None,
    interval = env.config.subscriptionBatchJobInterval,
    parallelism = env.config.subscriptionBatchJobBatchSize
  )

  override def start(): Unit =
    if (env.config.mode != DaikokuMode.Test) super.start()

  override protected def process(
      tenant: Tenant,
      input: Option[SubscriptionBatchDemandId],
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext
    env.dataStore.subscriptionBatchDemandRepo
      .findPendingKeyringCreations(tenant.id, parallelism, input)
      .flatMap {
        case Left(error) =>
          Future.successful(
            JobRunResult(
              processed = 0L,
              succeeded = 0L,
              failures = Seq(
                JobItemFailure(tenant.id.value, error.getErrorMessage())
              ),
              lastCursor = fromCursor
            )
          )
        case Right(creations) =>
          creations
            .foldLeft(
              Future.successful(
                Vector.empty[
                  (String, Either[AppError, fr.maif.daikoku.domain.KeyringId])
                ]
              )
            ) { case (previous, (batchId, creationId)) =>
              previous.flatMap { results =>
                apiService
                  .prepareBatchKeyring(tenant, batchId, creationId)
                  .map(result =>
                    results :+ (
                      s"${batchId.value}:${creationId.value}" -> result
                    )
                  )
              }
            }
            .flatMap(preparationResults =>
              processPreparedItems(
                tenant,
                input,
                parallelism,
                fromCursor,
                preparationResults
              )
            )
      }
  }

  private def processPreparedItems(
      tenant: Tenant,
      input: Option[SubscriptionBatchDemandId],
      parallelism: Int,
      fromCursor: Option[Long],
      preparationResults: Seq[
        (String, Either[AppError, fr.maif.daikoku.domain.KeyringId])
      ]
  ): Future[JobRunResult] =
    batchService
      .materializePendingItems(tenant.id, parallelism, input)
      .value
      .flatMap {
        case Left(error) =>
          Future.successful(
            JobRunResult(
              processed = preparationResults.size.toLong,
              succeeded = preparationResults.count(_._2.isRight).toLong,
              failures = preparationResults.collect {
                case (reference, Left(preparationError)) =>
                  JobItemFailure(reference, preparationError.getErrorMessage())
              } :+ JobItemFailure(tenant.id.value, error.getErrorMessage()),
              lastCursor = fromCursor
            )
          )
        case Right(results) =>
          implicit val ec: ExecutionContext = env.defaultExecutionContext
          val preparationFailures = preparationResults.collect {
            case (reference, Left(error)) =>
              JobItemFailure(reference, error.getErrorMessage())
          }
          val materializationFailures = results.collect {
            case (reference, Left(error)) =>
              JobItemFailure(
                s"${reference.batch.value}:${reference.item.value}",
                error.getErrorMessage()
              )
          }
          batchService
            .findRunnableChildren(
              tenant.id,
              (parallelism.toLong * 100L).min(Int.MaxValue.toLong).toInt,
              input
            )
            .value
            .flatMap {
              case Left(error) =>
                Future.successful(
                  JobRunResult(
                    processed =
                      results.size.toLong + preparationResults.size.toLong,
                    succeeded = results.count(_._2.isRight).toLong +
                      preparationResults.count(_._2.isRight).toLong,
                    failures =
                      preparationFailures ++ materializationFailures :+ JobItemFailure(
                        tenant.id.value,
                        error.getErrorMessage()
                      ),
                    lastCursor = fromCursor
                  )
                )
              case Right(references) =>
                val runnableReferences = references.foldLeft(
                  Future.successful(Vector.empty[SubscriptionBatchReference])
                ) { (previous, reference) =>
                  previous.flatMap { runnable =>
                    if (runnable.size >= parallelism)
                      Future.successful(runnable)
                    else
                      env.dataStore.subscriptionDemandRepo
                        .findByBatchItem(tenant.id, reference)
                        .flatMap {
                          case Some(demand) =>
                            apiService
                              .canRunBatchChild(demand.id, tenant)
                              .map(ready =>
                                if (ready) runnable :+ reference else runnable
                              )
                          case None => Future.successful(runnable)
                        }
                  }
                }
                runnableReferences.flatMap { selected =>
                  val progressResults = selected
                    .foldLeft(
                      Future.successful(
                        Vector.empty[
                          (SubscriptionBatchReference, Either[AppError, Unit])
                        ]
                      )
                    ) { (previous, reference) =>
                      previous.flatMap { accumulated =>
                        val processed: Future[Either[AppError, Unit]] = for {
                          child <- env.dataStore.subscriptionDemandRepo
                            .findByBatchItem(tenant.id, reference)
                          result <- child match {
                            case None =>
                              Future.successful(
                                Left(AppError.SubscriptionDemandNotFound)
                              )
                            case Some(demand) =>
                              env.dataStore.userRepo
                                .findById(demand.from)
                                .flatMap {
                                  case None =>
                                    Future.successful(
                                      Left(
                                        AppError.UserNotFound(Some(demand.from))
                                      )
                                    )
                                  case Some(requester) =>
                                    implicit val language: String =
                                      requester.defaultLanguage
                                        .orElse(tenant.defaultLanguage)
                                        .getOrElse("en")
                                    apiService
                                      .runSubscriptionProcess(
                                        demand.id,
                                        tenant
                                      )(using language, requester)
                                      .value
                                      .map(_.map(_ => ()))
                                }
                          }
                        } yield result
                        processed
                          .map(result => accumulated :+ (reference -> result))
                      }
                    }
                progressResults.map { progress =>
                  val progressFailures = progress.collect {
                    case (reference, Left(error)) =>
                      JobItemFailure(
                        s"${reference.batch.value}:${reference.item.value}",
                        error.getErrorMessage()
                      )
                  }
                  JobRunResult(
                    processed = results.size.toLong + progress.size.toLong +
                      preparationResults.size.toLong,
                    succeeded = results.count(_._2.isRight).toLong +
                      progress.count(_._2.isRight).toLong +
                      preparationResults.count(_._2.isRight).toLong,
                    failures =
                      preparationFailures ++ materializationFailures ++ progressFailures,
                    lastCursor = None
                  )
                }
                }
            }
      }
}
