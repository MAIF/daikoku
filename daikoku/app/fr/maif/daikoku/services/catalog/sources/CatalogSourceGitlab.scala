package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{
  CatalogSource,
  RemoteCatalogError,
  RemoteEntity
}
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}

class CatalogSourceGitlab extends CatalogSource {

  private val logger = Logger("daikoku-remote-catalog-source-gitlab")

  override def sourceKind: String = "gitlab"
  override def supportsWebhook: Boolean = true

  private def parseProjectPath(repoUrl: String): Option[String] = Some(repoUrl)

  private def gitlabHeaders(token: String): Seq[(String, String)] = {
    Seq("User-Agent" -> "Daikoku-Remote-Catalogs") ++
      (if (token.nonEmpty) Seq("PRIVATE-TOKEN" -> token) else Seq.empty)
  }

  private def fetchFileContent(
      baseUrl: String,
      encodedProject: String,
      filePath: String,
      branch: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, String]] = {
    val apiUrl =
      s"$baseUrl/api/v4/projects/$encodedProject/repository/files/$filePath/raw"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch)
      .withHttpHeaders(gitlabHeaders(token)*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          Right(resp.body): Either[JsValue, String]
        } else {
          Left(
            Json.obj(
              "error" -> s"GitLab API returned ${resp.status} for $filePath"
            )
          ): Either[JsValue, String]
        }
      }
      .recover { case e: Throwable =>
        Left(
          Json.obj(
            "error" -> s"Error fetching $filePath from GitLab: ${e.getMessage}"
          )
        ): Either[JsValue, String]
      }
  }

  private val perPage = 100

  private def isBlob(item: JsObject): Boolean =
    (item \ "type").asOpt[String].contains("blob")

  private def pathOf(item: JsObject): Option[String] =
    (item \ "path").asOpt[String]

  private def fetchPage(
      apiUrl: String,
      params: Seq[(String, String)],
      page: Int,
      token: String,
      what: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[JsObject]]] = {
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters(
        params ++ Seq("per_page" -> perPage.toString, "page" -> page.toString)*
      )
      .withHttpHeaders(gitlabHeaders(token)*)
      .withRequestTimeout(Duration(60000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status != 200) {
          Left(
            Json.obj("error" -> s"GitLab API returned ${resp.status} for $what")
          )
        } else {
          resp.json match {
            case arr: JsArray =>
              Right(arr.value.toSeq.collect { case o: JsObject => o })
            case _ =>
              Left(
                Json.obj(
                  "error" -> s"GitLab API did not return an array for $what"
                )
              )
          }
        }
      }
      .recover { case e: Throwable =>
        Left(
          Json.obj("error" -> s"Error listing GitLab $what: ${e.getMessage}")
        )
      }
  }

  private def listAllFilesRecursive(
      baseUrl: String,
      encodedProject: String,
      branch: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[String]]] = {
    val apiUrl = s"$baseUrl/api/v4/projects/$encodedProject/repository/tree"
    val params = Seq("ref" -> branch, "recursive" -> "true")

    SourceUtils
      .fetchAllPages(
        perPage,
        page =>
          fetchPage(apiUrl, params, page, token, "recursive tree listing", env)
      )
      .map(_.map(items => items.filter(isBlob).flatMap(pathOf)))
  }

  private def listDirectory(
      baseUrl: String,
      encodedProject: String,
      dirPath: String,
      branch: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[String]]] = {
    val apiUrl = s"$baseUrl/api/v4/projects/$encodedProject/repository/tree"
    val params = Seq("ref" -> branch, "path" -> dirPath)

    SourceUtils
      .fetchAllPages(
        perPage,
        page => fetchPage(apiUrl, params, page, token, "tree listing", env)
      )
      .map(_.map { items =>
        items
          .filter(item =>
            isBlob(item) && pathOf(item).exists(SourceUtils.isEntityFile)
          )
          .flatMap(pathOf)
      })
  }

  override def webhookDeploySelect(
      possibleCatalogs: Seq[RemoteCatalog],
      payload: JsValue
  )(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteCatalog]]] = {
    val projectWebUrl =
      (payload \ "project" \ "web_url").asOpt[String].getOrElse("")
    val ref = (payload \ "ref").asOpt[String].getOrElse("")
    val branch = ref.replace("refs/heads/", "")
    val matched = possibleCatalogs.filter { catalog =>
      catalog.source.kind == "gitlab" && {
        val configRepo =
          (catalog.source.config \ "repo").asOpt[String].getOrElse("")
        val configBranch =
          (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
        configRepo.stripSuffix(".git") == projectWebUrl.stripSuffix(
          ".git"
        ) && configBranch == branch
      }
    }
    Future.successful(Right(matched))
  }

  private def isGroup(repoUrl: String): Boolean = {
    val cleaned = repoUrl.stripSuffix("/")
    !cleaned.contains("/")
  }

  private def listGroupProjects(
      baseUrl: String,
      group: String,
      token: String,
      env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, Seq[String]]] = {
    val encodedGroup = java.net.URLEncoder.encode(group, "UTF-8")
    val apiUrl = s"$baseUrl/api/v4/groups/$encodedGroup/projects"
    val params = Seq("include_subgroups" -> "true")

    SourceUtils
      .fetchAllPages(
        perPage,
        page => fetchPage(apiUrl, params, page, token, "group projects", env)
      )
      .map(
        _.map(_.flatMap(item => (item \ "path_with_namespace").asOpt[String]))
      )
  }

  private def fetchFromSingleProject(
      baseUrl: String,
      projectPath: String,
      branch: String,
      path: String,
      token: String,
      env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val encodedProject = java.net.URLEncoder.encode(projectPath, "UTF-8")
    val sourceName = s"gitlab://$projectPath/$path@$branch"

    if (SourceUtils.hasFileExtension(path)) {
      fetchFileContent(baseUrl, encodedProject, path, branch, token, env)
        .flatMap {
          case Left(err) =>
            Future.successful(
              Left(Seq(SourceUtils.fetchError(sourceName, err)))
            )
          case Right(rawContent) =>
            SourceUtils.isDeployListing(rawContent) match {
              case Some(arr) =>
                val basePath =
                  if (path.contains("/"))
                    path.substring(0, path.lastIndexOf('/'))
                  else ""
                SourceUtils.resolveDeployListing(
                  arr,
                  relativePath => {
                    val fullPath =
                      if (basePath.nonEmpty) s"$basePath/$relativePath"
                      else relativePath
                    fetchFileContent(
                      baseUrl,
                      encodedProject,
                      fullPath,
                      branch,
                      token,
                      env
                    )
                  },
                  sourceName,
                  resolveGlob = Some(glob =>
                    listAllFilesRecursive(
                      baseUrl,
                      encodedProject,
                      branch,
                      token,
                      env
                    ).map {
                      case Left(err) => Left(err)
                      case Right(files) =>
                        Right(
                          SourceUtils.resolveRemoteGlob(files, basePath, glob)
                        )
                    }
                  )
                )
              case None =>
                Future.successful(
                  SourceUtils.parseEntityContent(rawContent, sourceName)
                )
            }
        }
    } else {
      listDirectory(baseUrl, encodedProject, path, branch, token, env).flatMap {
        case Left(err) =>
          Future.successful(Left(Seq(SourceUtils.fetchError(sourceName, err))))
        case Right(files) =>
          Future
            .sequence(files.map { filePath =>
              val fileSource = s"gitlab://$projectPath/$filePath@$branch"

              fetchFileContent(
                baseUrl,
                encodedProject,
                filePath,
                branch,
                token,
                env
              ).map {
                case Left(err) =>
                  Left(Seq(SourceUtils.fetchError(fileSource, err)))
                case Right(rawContent) =>
                  SourceUtils.parseEntityContent(rawContent, fileSource)
              }
            })
            .map(RemoteCatalogError.collect)
      }
    }
  }

  override def fetch(catalog: RemoteCatalog)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val repoUrl = (catalog.source.config \ "repo").asOpt[String].getOrElse("")
    val branch =
      (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
    val path = (catalog.source.config \ "path")
      .asOpt[String]
      .getOrElse("/")
      .stripPrefix("/")
    val token = (catalog.source.config \ "token").asOpt[String].getOrElse("")
    val baseUrl = (catalog.source.config \ "base_url")
      .asOpt[String]
      .getOrElse("https://gitlab.com")
    val repoPatterns =
      (catalog.source.config \ "repo_patterns")
        .asOpt[Seq[String]]
        .getOrElse(Seq.empty)

    SourceUtils.checkHostAllowed(baseUrl, sourceKind, env) match {
      case Some(error) => Future.successful(Left(Seq(error)))
      case None =>
        if (isGroup(repoUrl)) {
          listGroupProjects(baseUrl, repoUrl, token, env).flatMap {
            case Left(err) =>
              Future.successful(
                Left(Seq(SourceUtils.fetchError(s"gitlab://$repoUrl", err)))
              )
            case Right(projects) =>
              val filtered = if (repoPatterns.nonEmpty) {
                projects.filter { p =>
                  val name = p.split("/").lastOption.getOrElse(p)
                  repoPatterns.exists(pat => SourceUtils.matchesGlob(name, pat))
                }
              } else projects
              logger.info(
                s"Scanning ${filtered.size} projects in group '$repoUrl' for path '$path'"
              )
              Future
                .sequence(filtered.map { projectPath =>
                  fetchFromSingleProject(
                    baseUrl,
                    projectPath,
                    branch,
                    path,
                    token,
                    env
                  )
                })
                .map(RemoteCatalogError.collect)
          }
        } else {
          parseProjectPath(repoUrl) match {
            case None =>
              Future.successful(
                Left(
                  Seq(
                    RemoteCatalogError(
                      sourceKind,
                      s"Cannot parse GitLab project path from: $repoUrl"
                    )
                  )
                )
              )
            case Some(projectPath) =>
              fetchFromSingleProject(
                baseUrl,
                projectPath,
                branch,
                path,
                token,
                env
              )
          }
        }
    }
  }
}
