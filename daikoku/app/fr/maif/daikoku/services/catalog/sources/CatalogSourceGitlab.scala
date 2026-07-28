package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSource, RemoteEntity}
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}

class CatalogSourceGitlab extends CatalogSource {

  private val logger = Logger("daikoku-remote-catalog-source-gitlab")

  override def sourceKind: String       = "gitlab"
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
    val apiUrl = s"$baseUrl/api/v4/projects/$encodedProject/repository/files/$filePath/raw"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch)
      .withHttpHeaders(gitlabHeaders(token): _*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          Right(resp.body): Either[JsValue, String]
        } else {
          Left(Json.obj("error" -> s"GitLab API returned ${resp.status} for $filePath")): Either[JsValue, String]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error fetching $filePath from GitLab: ${e.getMessage}")): Either[JsValue, String]
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
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch, "recursive" -> "true", "per_page" -> "100")
      .withHttpHeaders(gitlabHeaders(token): _*)
      .withRequestTimeout(Duration(60000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          resp.json match {
            case arr: JsArray =>
              val files = arr.value.flatMap { item =>
                val itemType = (item \ "type").asOpt[String].getOrElse("")
                val itemPath = (item \ "path").asOpt[String].getOrElse("")
                if (itemType == "blob") Some(itemPath) else None
              }
              Right(files.toSeq): Either[JsValue, Seq[String]]
            case _            =>
              Left(Json.obj("error" -> "GitLab API did not return an array for recursive tree listing")): Either[
                JsValue,
                Seq[String]
              ]
          }
        } else {
          Left(Json.obj("error" -> s"GitLab API returned ${resp.status} for recursive tree listing")): Either[
            JsValue,
            Seq[String]
          ]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing GitLab tree: ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
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
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch, "path" -> dirPath, "per_page" -> "100")
      .withHttpHeaders(gitlabHeaders(token): _*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          resp.json match {
            case arr: JsArray =>
              val files = arr.value.flatMap { item =>
                val itemType = (item \ "type").asOpt[String].getOrElse("")
                val itemName = (item \ "name").asOpt[String].getOrElse("")
                val itemPath = (item \ "path").asOpt[String].getOrElse("")
                if (itemType == "blob" && SourceUtils.isEntityFile(itemName)) Some(itemPath) else None
              }
              Right(files.toSeq): Either[JsValue, Seq[String]]
            case _            =>
              Left(Json.obj("error" -> "GitLab API did not return an array for tree listing")): Either[JsValue, Seq[
                String
              ]]
          }
        } else {
          Left(Json.obj("error" -> s"GitLab API returned ${resp.status} for tree listing")): Either[JsValue, Seq[
            String
          ]]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing GitLab tree: ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
  }

  override def webhookDeploySelect(possibleCatalogs: Seq[RemoteCatalog], payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteCatalog]]] = {
    val projectWebUrl = (payload \ "project" \ "web_url").asOpt[String].getOrElse("")
    val ref           = (payload \ "ref").asOpt[String].getOrElse("")
    val branch        = ref.replace("refs/heads/", "")
    val matched       = possibleCatalogs.filter { catalog =>
      catalog.source.kind == "gitlab" && {
        val configRepo   = (catalog.source.config \ "repo").asOpt[String].getOrElse("")
        val configBranch = (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
        configRepo.stripSuffix(".git") == projectWebUrl.stripSuffix(".git") && configBranch == branch
      }
    }
    Future.successful(Right(matched))
  }

  override def webhookDeployExtractArgs(catalog: RemoteCatalog, payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, JsObject]] = Future.successful(Right(Json.obj()))

  private def isGroup(repoUrl: String): Boolean = {
    val cleaned = repoUrl.stripSuffix("/")
    !cleaned.contains("/")
  }

  private def listGroupProjects(baseUrl: String, group: String, token: String, env: Env)(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, Seq[String]]] = {
    val encodedGroup = java.net.URLEncoder.encode(group, "UTF-8")
    val apiUrl       = s"$baseUrl/api/v4/groups/$encodedGroup/projects"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("per_page" -> "100", "include_subgroups" -> "true")
      .withHttpHeaders(gitlabHeaders(token): _*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          resp.json match {
            case arr: JsArray =>
              val projects = arr.value.flatMap(item => (item \ "path_with_namespace").asOpt[String])
              Right(projects.toSeq): Either[JsValue, Seq[String]]
            case _            =>
              Left(Json.obj("error" -> "GitLab API did not return an array for group projects")): Either[
                JsValue,
                Seq[String]
              ]
          }
        } else {
          Left(Json.obj("error" -> s"GitLab API returned ${resp.status} for group projects")): Either[
            JsValue,
            Seq[String]
          ]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing GitLab group projects: ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
  }

  private def fetchFromSingleProject(
      baseUrl: String,
      projectPath: String,
      branch: String,
      path: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[RemoteEntity]]] = {
    val encodedProject = java.net.URLEncoder.encode(projectPath, "UTF-8")
    if (SourceUtils.hasFileExtension(path)) {
      fetchFileContent(baseUrl, encodedProject, path, branch, token, env).flatMap {
        case Left(err)         => Future.successful(Left(err))
        case Right(rawContent) =>
          SourceUtils.isDeployListing(rawContent) match {
            case Some(arr) =>
              val basePath = if (path.contains("/")) path.substring(0, path.lastIndexOf('/')) else ""
              SourceUtils.resolveDeployListing(
                arr,
                relativePath => {
                  val fullPath = if (basePath.nonEmpty) s"$basePath/$relativePath" else relativePath
                  fetchFileContent(baseUrl, encodedProject, fullPath, branch, token, env)
                },
                s"gitlab://$projectPath/$path@$branch",
                resolveGlob = Some(glob =>
                  listAllFilesRecursive(baseUrl, encodedProject, branch, token, env).map {
                    case Left(err)    => Left(err)
                    case Right(files) => Right(SourceUtils.resolveRemoteGlob(files, basePath, glob))
                  }
                )
              )
            case None      =>
              Future.successful(
                Right(
                  SourceUtils.parseEntityContent(rawContent, s"gitlab://$projectPath/$path@$branch")
                ): Either[JsValue, Seq[RemoteEntity]]
              )
          }
      }
    } else {
      listDirectory(baseUrl, encodedProject, path, branch, token, env).flatMap {
        case Left(err)    => Future.successful(Left(err))
        case Right(files) =>
          Future
            .sequence(files.map { filePath =>
              fetchFileContent(baseUrl, encodedProject, filePath, branch, token, env).map {
                case Left(err)         =>
                  logger.warn(s"Error fetching $filePath: ${err.toString}")
                  Seq.empty[RemoteEntity]
                case Right(rawContent) =>
                  SourceUtils.parseEntityContent(rawContent, s"gitlab://$projectPath/$filePath@$branch")
              }
            })
            .map(entities => Right(entities.flatten): Either[JsValue, Seq[RemoteEntity]])
      }
    }
  }

  override def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteEntity]]] = {
    val repoUrl      = (catalog.source.config \ "repo").asOpt[String].getOrElse("")
    val branch       = (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
    val path         = (catalog.source.config \ "path").asOpt[String].getOrElse("/").stripPrefix("/")
    val token        = (catalog.source.config \ "token").asOpt[String].getOrElse("")
    val baseUrl      = (catalog.source.config \ "base_url").asOpt[String].getOrElse("https://gitlab.com")
    val repoPatterns =
      (catalog.source.config \ "repo_patterns").asOpt[Seq[String]].getOrElse(Seq.empty)

    if (isGroup(repoUrl)) {
      listGroupProjects(baseUrl, repoUrl, token, env).flatMap {
        case Left(err)       => Future.successful(Left(err))
        case Right(projects) =>
          val filtered = if (repoPatterns.nonEmpty) {
            projects.filter { p =>
              val name = p.split("/").lastOption.getOrElse(p)
              repoPatterns.exists(pat => SourceUtils.matchesGlob(name, pat))
            }
          } else projects
          logger.info(s"Scanning ${filtered.size} projects in group '$repoUrl' for path '$path'")
          Future
            .sequence(filtered.map { projectPath =>
              fetchFromSingleProject(baseUrl, projectPath, branch, path, token, env).map {
                case Left(_)         => Seq.empty[RemoteEntity]
                case Right(entities) => entities
              }
            })
            .map(all => Right(all.flatten): Either[JsValue, Seq[RemoteEntity]])
      }
    } else {
      parseProjectPath(repoUrl) match {
        case None              =>
          Future.successful(Left(Json.obj("error" -> s"Cannot parse GitLab project path from: $repoUrl")))
        case Some(projectPath) =>
          fetchFromSingleProject(baseUrl, projectPath, branch, path, token, env)
      }
    }
  }
}
