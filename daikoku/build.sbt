import com.typesafe.sbt.packager.docker.{Cmd, ExecCmd}
import com.typesafe.sbt.packager.docker.DockerChmodType
import com.typesafe.sbt.packager.docker.DockerPermissionStrategy

name := """daikoku"""
organization := "fr.maif.otoroshi"
maintainer := "oss@maif.fr"
Universal / packageName := "daikoku"

scalaVersion := "2.13.15"

Global / onChangedBuildSource := ReloadOnSourceChanges

lazy val wiremockVersion = "3.3.1"
lazy val awsJavaSdkVersion = "1.12.582"
lazy val akkaHttp2Version = "10.2.10"

lazy val root = (project in file("."))
  .enablePlugins(
    PlayScala,
    DockerPlugin,
    BuildInfoPlugin,
    PlayPekkoHttp2Support
  )
  .disablePlugins(PlayFilters)
  .settings(
    buildInfoKeys := Seq[BuildInfoKey](name, version, scalaVersion, sbtVersion),
    buildInfoPackage := "daikoku"
  )

Test / javaOptions += "-Dconfig.file=conf/application.test.conf"

assembly / assemblyMergeStrategy := {
  case PathList("org", "apache", "commons", "logging", xs @ _*) =>
    MergeStrategy.first
  case PathList(ps @ _*) if ps.contains("module-info.class") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("ModuleUtil.class") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("reflection-config.json") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("mime.types") =>
    MergeStrategy.first // ???
  case PathList(ps @ _*) if ps.contains("native-image") =>
    MergeStrategy.first // ???
  case "META-INF/mailcap.default"   => MergeStrategy.last
  case "META-INF/mimetypes.default" => MergeStrategy.last
  case x =>
    val oldStrategy = (assembly / assemblyMergeStrategy).value
    oldStrategy(x)
}

ThisBuild / evictionErrorLevel := Level.Info
ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)

libraryDependencies ++= Seq(
  jdbc,
  ws,
  filters,
  "org.scalatestplus.play" %% "scalatestplus-play" % "7.0.0" % Test,
  "com.themillhousegroup" %% "scoup" % "1.0.0" % Test,
  "org.wiremock" % "wiremock" % wiremockVersion % Test,
//  "org.wiremock" % "wiremock-jre8" % wiremockVersion % Test,
  "org.testcontainers" % "testcontainers" % "1.20.0" % Test,
  "com.dimafeng" %% "testcontainers-scala-scalatest" % "0.40.14" % Test,
  "com.dimafeng" %% "testcontainers-scala-postgresql" % "0.40.14" % Test,
  "org.apache.commons" % "commons-lang3" % "3.13.0",
  "org.bouncycastle" % "bcprov-jdk18on" % "1.76",
  // play framework
  "org.playframework" %% "play-json" % "3.0.1",
  "org.playframework" %% "play-pekko-http2-support" % "3.0.0",
  // pekko
  "org.apache.pekko" %% "pekko-connectors-kafka" % "1.0.0",
  "org.apache.pekko" %% "pekko-connectors-s3" % "1.0.1",
  "com.auth0" % "java-jwt" % "4.4.0",
  "com.auth0" % "jwks-rsa" % "0.22.1", // https://github.com/auth0/jwks-rsa-java
  "com.nimbusds" % "nimbus-jose-jwt" % "9.37",
  "com.softwaremill.macwire" %% "macros" % "2.5.9" % "provided",
  "io.vertx" % "vertx-pg-client" % "4.4.6",
  "com.ongres.scram" % "common" % "2.1",
  "com.ongres.scram" % "client" % "2.1",
  "io.nayuki" % "qrcodegen" % "1.6.0",
  "com.eatthepath" % "java-otp" % "0.4.0",
  "com.sun.mail" % "jakarta.mail" % "2.0.1",
  "org.gnieh" %% "diffson-play-json" % "4.5.0" excludeAll ExclusionRule(
    organization = "com.typesafe.akka"
  ),
  "org.typelevel" %% "cats-core" % "2.10.0",
  "de.svenkubiak" % "jBCrypt" % "0.4.3",
  "com.amazonaws" % "aws-java-sdk-core" % awsJavaSdkVersion,
  "com.amazonaws" % "aws-java-sdk-s3" % awsJavaSdkVersion,
  "com.googlecode.owasp-java-html-sanitizer" % "owasp-java-html-sanitizer" % "20220608.1",
  "commons-logging" % "commons-logging" % "1.2",
  "com.github.jknack" % "handlebars" % "4.3.1",
  "org.sangria-graphql" %% "sangria" % "4.0.2",
  "org.sangria-graphql" %% "sangria-play-json" % "2.0.2" excludeAll ExclusionRule(
    organization = "com.typesafe.play"
  ),
  "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.15.3",
  "org.apache.logging.log4j" % "log4j-api" % "2.19.0",
  "com.github.blemale" %% "scaffeine" % "5.2.1",
  "com.github.slugify" % "slugify" % "3.0.6"
)

dependencyOverrides += "io.netty" % "netty-handler" % "4.1.100.Final"

Test / fork := true

scalacOptions ++= Seq(
  "-feature",
  "-language:higherKinds",
  "-language:implicitConversions",
  "-language:existentials",
  "-language:postfixOps",
//  "-Ypartial-unification",
//  "-Xfatal-warnings",
  "-Wconf:msg=possible missing interpolator:silent",
  "-Wconf:any:warning-verbose",  // Debug: montre d'où viennent les warnings
  "-Wconf:src=conf/routes:silent",  // Exact path
  "-Wconf:src=views/.*:silent",
  "-Wconf:msg=discarded non-Unit value:s",
  "-deprecation", // Avertit sur les APIs dépréciées
  "-unchecked", // Avertit sur les pattern matching non exhaustifs
  "-Xlint", // Active tous les lints
  "-Ywarn-dead-code", // Code mort
  "-Ywarn-numeric-widen", // Conversions numériques implicites
  "-Ywarn-value-discard", // Valeurs jetées
  "-Xsource:3" // ⭐ CRUCIAL : émule le comportement de Scala 3
)

PlayKeys.devSettings := Seq("play.server.http.port" -> "9000")

// sources in (Compile, doc) := Seq.empty
// publishArtifact in (Compile, packageDoc) := false
// scalafmtVersion in ThisBuild := "1.2.0"

/// ASSEMBLY CONFIG

assembly / mainClass := Some("play.core.server.ProdServerStart")
assembly / test := {}
assembly / assemblyJarName := "daikoku.jar"
assembly / fullClasspath += Attributed.blank(PlayKeys.playPackageAssets.value)
assembly / assemblyMergeStrategy := {
  // case PathList("META-INF", xs @ _*) => MergeStrategy.discard
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
    val oldStrategy = (assembly / assemblyMergeStrategy).value
    oldStrategy(o)
}

lazy val packageAll = taskKey[Unit]("PackageAll")
packageAll := {
  (Compile / dist).value
  (Compile / assembly).value
}

/// DOCKER CONFIG

dockerExposedPorts := Seq(
  8080
)
Docker / packageName := "daikoku"
Docker / maintainer := "MAIF OSS Team <oss@maif.fr>"
dockerBaseImage := "eclipse-temurin:21.0.1_12-jre-ubi9-minimal"
dockerUsername := Some("maif")
dockerUpdateLatest := true
dockerCommands := dockerCommands.value.filterNot {
  case ExecCmd("CMD", args @ _*) => true
  case cmd                       => false
}
Docker / dockerPackageMappings += (baseDirectory.value / "docker" / "start.sh") -> "/opt/docker/bin/start.sh"
dockerEntrypoint := Seq("/opt/docker/bin/start.sh")
dockerUpdateLatest := true
dockerEnvVars := Map("daikoku.containerized" -> "true")

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
