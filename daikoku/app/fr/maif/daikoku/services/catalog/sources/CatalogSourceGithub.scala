package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{
  CatalogSource,
  RemoteCatalogError,
  RemoteEntity
}
import play.api.Logger
import play.api.libs.json.*

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.*

class CatalogSourceGithub extends CatalogSource {

  private val logger = Logger("daikoku-remote-catalog-source-github")

  override def sourceKind: String = "github"
  override def supportsWebhook: Boolean = true

  private def parseRepo(repoUrl: String): Option[(String, String)] = {
    val cleaned = repoUrl.stripSuffix(".git")
    val parts = cleaned.split("/")
    if (parts.length >= 2) {
      Some((parts(parts.length - 2), parts(parts.length - 1)))
    } else {
      None
    }
  }

  private def githubHeaders(token: String): Seq[(String, String)] = {
    Seq(
      "Accept" -> "application/vnd.github.v3+json",
      "User-Agent" -> "Daikoku-Remote-Catalogs"
    ) ++ (if (token.nonEmpty) Seq("Authorization" -> s"token $token")
          else Seq.empty)
  }

  private def githubRawHeaders(token: String): Seq[(String, String)] = {
    Seq(
      "Accept" -> "application/vnd.github.v3.raw",
      "User-Agent" -> "Daikoku-Remote-Catalogs"
    ) ++ (if (token.nonEmpty) Seq("Authorization" -> s"token $token")
          else Seq.empty)
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
      .withHttpHeaders(githubRawHeaders(token)*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          Right(resp.body): Either[JsValue, String]
        } else {
          Left(
            Json.obj(
              "error" -> s"GitHub API returned ${resp.status} for $filePath"
            )
          ): Either[JsValue, String]
        }
      }
      .recover { case e: Throwable =>
        Left(
          Json.obj(
            "error" -> s"Error fetching $filePath from GitHub: ${e.getMessage}"
          )
        ): Either[JsValue, String]
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
      .withHttpHeaders(githubHeaders(token)*)
      .withRequestTimeout(Duration(60000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        val truncated =
          resp.status == 200 && (resp.json \ "truncated")
            .asOpt[Boolean]
            .contains(true)

        if (truncated) {
          Left(
            Json.obj(
              "error" -> "GitHub recursive tree listing is truncated (too many files): list the files explicitly or target a narrower path"
            )
          ): Either[JsValue, Seq[String]]
        } else if (resp.status == 200) {
          val tree =
            (resp.json \ "tree").asOpt[Seq[JsObject]].getOrElse(Seq.empty)
          val files = tree.flatMap { item =>
            val itemType = (item \ "type").asOpt[String].getOrElse("")
            val itemPath = (item \ "path").asOpt[String].getOrElse("")
            if (itemType == "blob") Some(itemPath) else None
          }
          Right(files.toSeq): Either[JsValue, Seq[String]]
        } else {
          Left(
            Json.obj(
              "error" -> s"GitHub API returned ${resp.status} for recursive tree listing"
            )
          ): Either[
            JsValue,
            Seq[String]
          ]
        }
      }
      .recover { case e: Throwable =>
        Left(
          Json.obj("error" -> s"Error listing GitHub tree: ${e.getMessage}")
        ): Either[JsValue, Seq[String]]
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
      .withHttpHeaders(githubHeaders(token)*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status == 200) {
          resp.json match {
            // the contents API returns at most 1000 entries per directory
            case arr: JsArray if arr.value.size >= 1000 =>
              Left(
                Json.obj(
                  "error" -> s"GitHub directory listing of $dirPath may be incomplete (1000 entries or more): list the files explicitly or split the directory"
                )
              ): Either[JsValue, Seq[String]]
            case arr: JsArray =>
              val files = arr.value.flatMap { item =>
                val itemType = (item \ "type").asOpt[String].getOrElse("")
                val itemName = (item \ "name").asOpt[String].getOrElse("")
                val itemPath = (item \ "path").asOpt[String].getOrElse("")
                if (itemType == "file" && SourceUtils.isEntityFile(itemName))
                  Some(itemPath)
                else None
              }
              Right(files.toSeq): Either[JsValue, Seq[String]]
            case _ =>
              Left(
                Json.obj(
                  "error" -> "GitHub API did not return an array for directory listing"
                )
              ): Either[
                JsValue,
                Seq[String]
              ]
          }
        } else {
          Left(
            Json.obj(
              "error" -> s"GitHub API returned ${resp.status} for directory listing"
            )
          ): Either[JsValue, Seq[
            String
          ]]
        }
      }
      .recover { case e: Throwable =>
        Left(
          Json
            .obj("error" -> s"Error listing GitHub directory: ${e.getMessage}")
        ): Either[JsValue, Seq[String]]
      }
  }

  override def webhookDeploySelect(
      possibleCatalogs: Seq[RemoteCatalog],
      payload: JsValue
  )(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteCatalog]]] = {
    val repoFullName =
      (payload \ "repository" \ "full_name").asOpt[String].getOrElse("")
    val ref = (payload \ "ref").asOpt[String].getOrElse("")
    val branch = ref.replace("refs/heads/", "")
    val matched = possibleCatalogs.filter { catalog =>
      catalog.source.kind == "github" && {
        val configRepo =
          (catalog.source.config \ "repo").asOpt[String].getOrElse("")
        val configBranch =
          (catalog.source.config \ "branch").asOpt[String].getOrElse("main")
        parseRepo(configRepo).exists { case (owner, repo) =>
          s"$owner/$repo" == repoFullName && configBranch == branch
        }
      }
    }
    Future.successful(Right(matched))
  }

  override def webhookDeployExtractArgs(
      catalog: RemoteCatalog,
      payload: JsValue
  )(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, JsObject]] = Future.successful(Right(Json.obj()))

  private def parseOrg(repoUrl: String): Option[String] = {
    val cleaned = repoUrl.stripSuffix(".git").stripSuffix("/")
    val path = if (cleaned.contains("://")) {
      cleaned.split("://", 2).last.split("/").drop(1).mkString("/")
    } else cleaned
    val parts = path.split("/").filter(_.nonEmpty)
    if (parts.length == 1) Some(parts(0)) else None
  }

  private val reposPerPage = 100

  private def fetchRepoPage(
      reposUrl: String,
      page: Int,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[JsObject]]] = {
    env.wsClient
      .url(reposUrl)
      .withQueryStringParameters(
        "per_page" -> reposPerPage.toString,
        "page" -> page.toString,
        "type" -> "all"
      )
      .withHttpHeaders(githubHeaders(token)*)
      .withRequestTimeout(Duration(30000L, TimeUnit.MILLISECONDS))
      .get()
      .map { resp =>
        if (resp.status != 200) {
          Left(
            Json.obj(
              "error" -> s"GitHub API returned ${resp.status} for $reposUrl"
            )
          )
        } else {
          Right(resp.json.asOpt[Seq[JsObject]].getOrElse(Seq.empty))
        }
      }
      .recover { case e: Throwable =>
        Left(Json.obj("error" -> s"Error listing $reposUrl: ${e.getMessage}"))
      }
  }

  private def listRepos(
      reposUrl: String,
      token: String,
      env: Env
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[String]]] =
    SourceUtils
      .fetchAllPages(
        reposPerPage,
        page => fetchRepoPage(reposUrl, page, token, env)
      )
      .map(_.map(_.flatMap(repo => (repo \ "name").asOpt[String])))

  private def listOrgRepos(
      apiBase: String,
      org: String,
      token: String,
      env: Env
  )(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, Seq[String]]] = {
    listRepos(s"$apiBase/orgs/$org/repos", token, env).flatMap {
      case Right(repos) => Future.successful(Right(repos))
      case Left(_) =>
        listRepos(s"$apiBase/users/$org/repos", token, env).map(
          _.left.map(_ => Json.obj("error" -> s"Cannot list repos for '$org'"))
        )
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
  )(implicit
      ec: ExecutionContext
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val sourceName = s"github://$owner/$repo/$path@$branch"

    if (SourceUtils.hasFileExtension(path)) {
      fetchFileContent(apiBase, owner, repo, path, branch, token, env).flatMap {
        case Left(err) =>
          Future.successful(Left(Seq(SourceUtils.fetchError(sourceName, err))))
        case Right(rawContent) =>
          SourceUtils.isDeployListing(rawContent) match {
            case Some(arr) =>
              val basePath =
                if (path.contains("/")) path.substring(0, path.lastIndexOf('/'))
                else ""
              SourceUtils.resolveDeployListing(
                arr,
                relativePath => {
                  val fullPath =
                    if (basePath.nonEmpty) s"$basePath/$relativePath"
                    else relativePath
                  fetchFileContent(
                    apiBase,
                    owner,
                    repo,
                    fullPath,
                    branch,
                    token,
                    env
                  )
                },
                sourceName,
                resolveGlob = Some(glob =>
                  listAllFilesRecursive(
                    apiBase,
                    owner,
                    repo,
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
      listDirectory(apiBase, owner, repo, path, branch, token, env).flatMap {
        case Left(err) =>
          Future.successful(Left(Seq(SourceUtils.fetchError(sourceName, err))))
        case Right(files) =>
          Future
            .sequence(files.map { filePath =>
              val fileSource = s"github://$owner/$repo/$filePath@$branch"

              fetchFileContent(
                apiBase,
                owner,
                repo,
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

  override def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
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
    val apiBase =
      (catalog.source.config \ "base_url")
        .asOpt[String]
        .getOrElse("https://api.github.com")
        .stripSuffix("/")
    val repoPatterns =
      (catalog.source.config \ "repo_patterns")
        .asOpt[Seq[String]]
        .getOrElse(Seq.empty)

    SourceUtils.checkHostAllowed(apiBase, sourceKind, env) match {
      case Some(error) => Future.successful(Left(Seq(error)))
      case None =>
        parseRepo(repoUrl) match {
          case Some((owner, repo)) =>
            fetchFromSingleRepo(apiBase, owner, repo, branch, path, token, env)
          case None =>
            parseOrg(repoUrl) match {
              case Some(org) =>
                listOrgRepos(apiBase, org, token, env).flatMap {
                  case Left(err) =>
                    Future.successful(
                      Left(Seq(SourceUtils.fetchError(s"github://$org", err)))
                    )
                  case Right(repos) =>
                    val filtered =
                      if (repoPatterns.nonEmpty)
                        repos.filter(name =>
                          repoPatterns.exists(p =>
                            SourceUtils.matchesGlob(name, p)
                          )
                        )
                      else repos
                    logger.info(
                      s"Scanning ${filtered.size} repos in org '$org' for path '$path'"
                    )
                    Future
                      .sequence(filtered.map { repoName =>
                        fetchFromSingleRepo(
                          apiBase,
                          org,
                          repoName,
                          branch,
                          path,
                          token,
                          env
                        )
                      })
                      .map(RemoteCatalogError.collect)
                }
              case None =>
                Future.successful(
                  Left(
                    Seq(
                      RemoteCatalogError(
                        sourceKind,
                        s"Cannot parse GitHub repo or organization from: $repoUrl"
                      )
                    )
                  )
                )
            }
        }
    }
  }
}
