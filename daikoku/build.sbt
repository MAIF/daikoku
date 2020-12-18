import com.typesafe.sbt.packager.docker.{Cmd, ExecCmd}
import com.typesafe.sbt.packager.docker.DockerChmodType
import com.typesafe.sbt.packager.docker.DockerPermissionStrategy

name := """daikoku"""
organization := "fr.maif.otoroshi"
maintainer := "oss@maif.fr"
packageName in Universal := "daikoku"

scalaVersion := "2.13.1"

val reactiveMongoVersion = "0.20.10"
val wiremockVersion = "2.26.3"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala, DockerPlugin)
  .disablePlugins(PlayFilters)

javaOptions in Test += "-Dconfig.file=conf/application.test.conf"

assemblyMergeStrategy in assembly := {
  case PathList("org", "apache", "commons", "logging", xs @ _*) =>
    MergeStrategy.first
  case PathList(ps @ _*) if ps.contains("module-info.class") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("ModuleUtil.class") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("reflection-config.json") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("mime.types") =>
    MergeStrategy.first //???
  case x =>
    val oldStrategy = (assemblyMergeStrategy in assembly).value
    oldStrategy(x)
}

libraryDependencies ++= Seq(
  ws,
  filters,
  "org.scalatestplus.play" %% "scalatestplus-play" % "5.0.0" % Test,
  "com.themillhousegroup" %% "scoup" % "0.4.7" % Test,
  "com.github.tomakehurst" % "wiremock" % wiremockVersion % Test,
  "com.github.tomakehurst" % "wiremock-jre8" % wiremockVersion % Test,
  "org.apache.commons" % "commons-lang3" % "3.10",
  "org.bouncycastle" % "bcprov-jdk15on" % "1.65",
  "org.gnieh" %% "diffson-play-json" % "4.0.2" excludeAll ExclusionRule(
    organization = "com.typesafe.akka"),
  "com.typesafe.play" %% "play-json" % "2.8.1",
  "com.typesafe.play" %% "play-json-joda" % "2.8.1",
  "com.auth0" % "java-jwt" % "3.10.3",
  "com.auth0" % "jwks-rsa" % "0.11.0", // https://github.com/auth0/jwks-rsa-java
  "com.nimbusds" % "nimbus-jose-jwt" % "8.16",
  "com.softwaremill.macwire" %% "macros" % "2.3.4" % "provided",
  "javax.xml.bind" % "jaxb-api" % "2.3.1",
  "com.sun.xml.bind" % "jaxb-core" % "2.3.0.1",
  "com.sun.xml.bind" % "jaxb-impl" % "2.3.0.1",

  jdbc,
  "org.postgresql" % "postgresql" % "42.2.18",
  "org.jooq" % "jooq" % "3.14.4",
  "org.jooq" % "jooq-meta" % "3.14.4",

  "org.reactivemongo" %% "play2-reactivemongo" % s"$reactiveMongoVersion-play28",
  "org.reactivemongo" %% "reactivemongo-play-json" % s"$reactiveMongoVersion-play28",
  "org.reactivemongo" %% "reactivemongo-akkastream" % s"$reactiveMongoVersion",
  "com.typesafe.akka" %% "akka-stream-kafka" % "2.0.2",
  "org.typelevel" %% "cats-core" % "2.1.1",
  "de.svenkubiak" % "jBCrypt" % "0.4.1",
  "com.lightbend.akka" %% "akka-stream-alpakka-s3" % "2.0.0",
  "com.amazonaws" % "aws-java-sdk-core" % "1.11.779",
  "com.googlecode.owasp-java-html-sanitizer" % "owasp-java-html-sanitizer" % "20191001.1",
  "com.amazonaws" % "aws-java-sdk-s3" % "1.11.893",
  "commons-logging" % "commons-logging" % "1.1.1",
)

scalacOptions ++= Seq(
  "-feature",
  "-language:higherKinds",
  "-language:implicitConversions",
  "-language:existentials",
  "-language:postfixOps",
//  "-Ypartial-unification",
  "-Xfatal-warnings"
)

resolvers += "bintray" at "https://jcenter.bintray.com"

resolvers += "Millhouse Bintray" at "https://dl.bintray.com/themillhousegroup/maven"

PlayKeys.devSettings := Seq("play.server.http.port" -> "9000")

sources in (Compile, doc) := Seq.empty
publishArtifact in (Compile, packageDoc) := false

scalafmtVersion in ThisBuild := "1.2.0"

/// ASSEMBLY CONFIG

mainClass in assembly := Some("play.core.server.ProdServerStart")
test in assembly := {}
assemblyJarName in assembly := "daikoku.jar"
fullClasspath in assembly += Attributed.blank(PlayKeys.playPackageAssets.value)
assemblyMergeStrategy in assembly := {
  //case PathList("META-INF", xs @ _*) => MergeStrategy.discard
  case PathList("javax", xs @ _*) =>
    MergeStrategy.first
  case PathList("org", "apache", "commons", "logging", xs @ _*) =>
    MergeStrategy.first
  case PathList("org", "apache", "commons", "lang", xs @ _*) =>
    MergeStrategy.first
  case PathList("org", "apache", "commons", "collections", xs @ _*) =>
    MergeStrategy.first
  case PathList(ps @ _*) if ps.last == "io.netty.versions.properties" =>
    MergeStrategy.first
  case PathList(ps @ _*) if ps.contains("reference-overrides.conf") =>
    MergeStrategy.concat
  case PathList(ps @ _*) if ps.last endsWith ".conf" => MergeStrategy.concat
  case PathList(ps @ _*) if ps.contains("buildinfo") =>
    MergeStrategy.discard
  case o =>
    val oldStrategy = (assemblyMergeStrategy in assembly).value
    oldStrategy(o)
}

lazy val packageAll = taskKey[Unit]("PackageAll")
packageAll := {
  (dist in Compile).value
  (assembly in Compile).value
}

/// DOCKER CONFIG

dockerExposedPorts := Seq(
  8080
)
packageName in Docker := "daikoku"
maintainer in Docker := "MAIF OSS Team <oss@maif.fr>"
dockerBaseImage := "openjdk:11-jre-slim"
dockerUsername := Some("maif")
dockerUpdateLatest := true
dockerCommands := dockerCommands.value.filterNot {
  case ExecCmd("CMD", args @ _*) => true
  case cmd                       => false
}
dockerPackageMappings in Docker += (baseDirectory.value / "docker" / "start.sh") -> "/opt/docker/bin/start.sh"
dockerEntrypoint := Seq("/opt/docker/bin/start.sh")
dockerUpdateLatest := true

// swaggerDomainNameSpaces := Seq("fr.maif.otoroshi.daikoku.domain")
// swaggerV3 := true
// swaggerPrettyJson := true

import sbtrelease.ReleasePlugin.autoImport.ReleaseTransformations._

releaseProcess := Seq[ReleaseStep](
  checkSnapshotDependencies, // : ReleaseStep
  inquireVersions, // : ReleaseStep
  runClean, // : ReleaseStep
  // runTest,                                // : ReleaseStep
  setReleaseVersion, // : ReleaseStep
  commitReleaseVersion, // : ReleaseStep, performs the initial git checks
  tagRelease, // : ReleaseStep
  // publishArtifacts,                       // : ReleaseStep, checks whether `publishTo` is properly set up
  setNextVersion, // : ReleaseStep
  commitNextVersion, // : ReleaseStep
  pushChanges // : ReleaseStep, also checks that an upstream branch is properly configured
)
