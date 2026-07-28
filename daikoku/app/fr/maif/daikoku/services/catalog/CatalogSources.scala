package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.services.catalog.sources.{
  CatalogSourceFile,
  CatalogSourceGithub,
  CatalogSourceGitlab,
  CatalogSourceHttp
}

import scala.collection.concurrent.TrieMap

object CatalogSources {

  private val sources = TrieMap.empty[String, CatalogSource]

  def initDefaults(): Unit = {
    register("file", new CatalogSourceFile())
    register("http", new CatalogSourceHttp())
    register("github", new CatalogSourceGithub())
    register("gitlab", new CatalogSourceGitlab())
  }

  def register(name: String, source: CatalogSource): Unit = sources.put(name, source)

  def get(name: String): Option[CatalogSource] = sources.get(name)
}
