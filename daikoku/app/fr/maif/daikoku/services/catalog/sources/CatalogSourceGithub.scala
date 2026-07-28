package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSource, RemoteEntity}
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}

class CatalogSourceGithub extends CatalogSource {

  private val logger = Logger("daikoku-remote-catalog-source-github")

  override def sourceKind: String       = "github"
  override def supportsWebhook: Boolean = true

  private def parseRepo(repoUrl: String): Option[(String, String)] = {
    val cleaned = repoUrl.stripSuffix(".git")
    val parts   = cleaned.split("/")
    if (parts.length >= 2) {
      Some((parts(parts.length - 2), parts(parts.length - 1)))
    } else {
      None
    }
  }

  private def githubHeaders(token: String): Seq[(String, String)] = {
    Seq(
      "Accept"     -> "application/vnd.github.v3+json",
      "User-Agent" -> "Daikoku-Remote-Catalogs"
    ) ++ (if (token.nonEmpty) Seq("Authorization" -> s"token $token") else Seq.empty)
  }

  private def githubRawHeaders(token: String): Seq[(String, String)] = {
    Seq(
      "Accept"     -> "application/vnd.github.v3.raw",
      "User-Agent" -> "Daikoku-Remote-Catalogs"
    ) ++ (if (token.nonEmpty) Seq("Authorization" -> s"token $token") else Seq.empty)
  }

  private def fetchFileContent(
      apiBase: String,
      owner: String,
      repo: String,
      filePath: String,
      branch: String,
      token: String,
      env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, String]] = {
    val apiUrl = s"$apiBase/repos/$owner/$repo/contents/$filePath"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch)
      .withHttpHeaders(githubRawHeaders(token): _*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          Right(resp.body): Either[JsValue, String]
        } else {
          Left(Json.obj("error" -> s"GitHub API returned ${resp.status} for $filePath")): Either[JsValue, String]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error fetching $filePath from GitHub: ${e.getMessage}")): Either[JsValue, String]
      }
  }

  private def listAllFilesRecursive(
      apiBase: String,
      owner: String,
      repo: String,
      branch: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[String]]] = {
    val apiUrl = s"$apiBase/repos/$owner/$repo/git/trees/$branch"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("recursive" -> "1")
      .withHttpHeaders(githubHeaders(token): _*)
      .withRequestTimeout(Duration(60000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          val tree  = (resp.json \ "tree").asOpt[Seq[JsObject]].getOrElse(Seq.empty)
          val files = tree.flatMap { item =>
            val itemType = (item \ "type").asOpt[String].getOrElse("")
            val itemPath = (item \ "path").asOpt[String].getOrElse("")
            if (itemType == "blob") Some(itemPath) else None
          }
          Right(files.toSeq): Either[JsValue, Seq[String]]
        } else {
          Left(Json.obj("error" -> s"GitHub API returned ${resp.status} for recursive tree listing")): Either[
            JsValue,
            Seq[String]
          ]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing GitHub tree: ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
  }

  private def listDirectory(
      apiBase: String,
      owner: String,
      repo: String,
      dirPath: String,
      branch: String,
      token: String,
      env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, Seq[String]]] = {
    val apiUrl = s"$apiBase/repos/$owner/$repo/contents/$dirPath"
    env.wsClient
      .url(apiUrl)
      .withQueryStringParameters("ref" -> branch)
      .withHttpHeaders(githubHeaders(token): _*)
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
                if (itemType == "file" && SourceUtils.isEntityFile(itemName)) Some(itemPath) else None
              }
              Right(files.toSeq): Either[JsValue, Seq[String]]
            case _            =>
              Left(Json.obj("error" -> "GitHub API did not return an array for directory listing")): Either[
                JsValue,
                Seq[String]
              ]
          }
        } else {
          Left(Json.obj("error" -> s"GitHub API returned ${resp.status} for directory listing")): Either[JsValue, Seq[
            String
          ]]
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing GitHub directory: ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
  }

  override def webhookDeploySelect(possibleCatalogs: Seq[RemoteCatalog], payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteCatalog]]] = {
    val repoFullName = (payload \ "repository" \ "full_name").asOpt[String].getOrElse("")
    val ref          = (payload \ "ref").asOpt[String].getOrElse("")
    val branch       = ref.replace("refs/heads/", "")
    val matched      = possibleCatalogs.filter { catalog =>
      catalog.source.kind == "github" && {
        val configRepo   = (catalog.source.config \ "repo").asOpt[String].getOrElse("")
        val configBranch = (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
        parseRepo(configRepo).exists { case (owner, repo) =>
          s"$owner/$repo" == repoFullName && configBranch == branch
        }
      }
    }
    Future.successful(Right(matched))
  }

  override def webhookDeployExtractArgs(catalog: RemoteCatalog, payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, JsObject]] = Future.successful(Right(Json.obj()))

  private def parseOrg(repoUrl: String): Option[String] = {
    val cleaned = repoUrl.stripSuffix(".git").stripSuffix("/")
    val path    = if (cleaned.contains("://")) {
      cleaned.split("://", 2).last.split("/").drop(1).mkString("/")
    } else cleaned
    val parts   = path.split("/").filter(_.nonEmpty)
    if (parts.length == 1) Some(parts(0)) else None
  }

  private def listOrgRepos(apiBase: String, org: String, token: String, env: Env)(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, Seq[String]]] = {
    val orgUrl = s"$apiBase/orgs/$org/repos"
    env.wsClient
      .url(orgUrl)
      .withQueryStringParameters("per_page" -> "100", "type" -> "all")
      .withHttpHeaders(githubHeaders(token): _*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .flatMap { resp =>
        if (resp.status == 200) {
          val repos =
            resp.json.asOpt[Seq[JsObject]].getOrElse(Seq.empty).flatMap(o => (o \ "name").asOpt[String])
          Future.successful(Right(repos): Either[JsValue, Seq[String]])
        } else {
          val userUrl = s"$apiBase/users/$org/repos"
          env.wsClient
            .url(userUrl)
            .withQueryStringParameters("per_page" -> "100", "type" -> "all")
            .withHttpHeaders(githubHeaders(token): _*)
            .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
            .get()
            .map { resp2 =>
              if (resp2.status == 200) {
                Right(
                  resp2.json.asOpt[Seq[JsObject]].getOrElse(Seq.empty).flatMap(o => (o \ "name").asOpt[String])
                ): Either[JsValue, Seq[String]]
              } else {
                Left(Json.obj("error" -> s"Cannot list repos for '$org'")): Either[JsValue, Seq[String]]
              }
            }
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing repos for '$org': ${e.getMessage}")): Either[JsValue, Seq[String]]
      }
  }

  private def fetchFromSingleRepo(
      apiBase: String,
      owner: String,
      repo: String,
      branch: String,
      path: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[RemoteEntity]]] = {
    if (SourceUtils.hasFileExtension(path)) {
      fetchFileContent(apiBase, owner, repo, path, branch, token, env).flatMap {
        case Left(err)         => Future.successful(Left(err))
        case Right(rawContent) =>
          SourceUtils.isDeployListing(rawContent) match {
            case Some(arr) =>
              val basePath = if (path.contains("/")) path.substring(0, path.lastIndexOf('/')) else ""
              SourceUtils.resolveDeployListing(
                arr,
                relativePath => {
                  val fullPath = if (basePath.nonEmpty) s"$basePath/$relativePath" else relativePath
                  fetchFileContent(apiBase, owner, repo, fullPath, branch, token, env)
                },
                s"github://$owner/$repo/$path@$branch",
                resolveGlob = Some(glob =>
                  listAllFilesRecursive(apiBase, owner, repo, branch, token, env).map {
                    case Left(err)    => Left(err)
                    case Right(files) => Right(SourceUtils.resolveRemoteGlob(files, basePath, glob))
                  }
                )
              )
            case None      =>
              Future.successful(
                Right(
                  SourceUtils.parseEntityContent(rawContent, s"github://$owner/$repo/$path@$branch")
                ): Either[JsValue, Seq[RemoteEntity]]
              )
          }
      }
    } else {
      listDirectory(apiBase, owner, repo, path, branch, token, env).flatMap {
        case Left(err)    => Future.successful(Left(err))
        case Right(files) =>
          Future
            .sequence(files.map { filePath =>
              fetchFileContent(apiBase, owner, repo, filePath, branch, token, env).map {
                case Left(err)         =>
                  logger.warn(s"Error fetching $filePath: ${err.toString}")
                  Seq.empty[RemoteEntity]
                case Right(rawContent) =>
                  SourceUtils.parseEntityContent(rawContent, s"github://$owner/$repo/$filePath@$branch")
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
    val apiBase      =
      (catalog.source.config \ "base_url").asOpt[String].getOrElse("https://api.github.com").stripSuffix("/")
    val repoPatterns =
      (catalog.source.config \ "repo_patterns").asOpt[Seq[String]].getOrElse(Seq.empty)

    parseRepo(repoUrl) match {
      case Some((owner, repo)) =>
        fetchFromSingleRepo(apiBase, owner, repo, branch, path, token, env)
      case None                =>
        parseOrg(repoUrl) match {
          case Some(org) =>
            listOrgRepos(apiBase, org, token, env).flatMap {
              case Left(err)    => Future.successful(Left(err))
              case Right(repos) =>
                val filtered =
                  if (repoPatterns.nonEmpty)
                    repos.filter(name => repoPatterns.exists(p => SourceUtils.matchesGlob(name, p)))
                  else repos
                logger.info(s"Scanning ${filtered.size} repos in org '$org' for path '$path'")
                Future
                  .sequence(filtered.map { repoName =>
                    fetchFromSingleRepo(apiBase, org, repoName, branch, path, token, env).map {
                      case Left(_)         => Seq.empty[RemoteEntity]
                      case Right(entities) => entities
                    }
                  })
                  .map(all => Right(all.flatten): Either[JsValue, Seq[RemoteEntity]])
            }
          case None      =>
            Future.successful(Left(Json.obj("error" -> s"Cannot parse GitHub repo or organization from: $repoUrl")))
        }
    }
  }
}
