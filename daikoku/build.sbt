import com.typesafe.sbt.packager.docker.ExecCmd

name := """daikoku"""
organization := "fr.maif.otoroshi"
maintainer := "oss@maif.fr"
Universal / packageName := "daikoku"

scalaVersion := "3.3.6"

Global / onChangedBuildSource := ReloadOnSourceChanges

lazy val wiremockVersion = "3.13.2"
lazy val awsJavaSdkVersion = "2.41.29"
lazy val akkaHttp2Version = "10.2.10"
val pekkoVersion = "1.1.5"
val pekkoHttpVersion = "1.1.0"
lazy val jacksonVersion = "2.17.3"

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

lazy val excludesJackson = Seq(
  ExclusionRule(organization = "com.fasterxml.jackson.core"),
  ExclusionRule(organization = "com.fasterxml.jackson.datatype"),
  ExclusionRule(organization = "com.fasterxml.jackson.dataformat"),
  ExclusionRule(organization = "com.fasterxml.jackson.databind"),
)

libraryDependencies ++= Seq(
  jdbc,
  ws,
  filters,
  "org.scalatestplus.play" %% "scalatestplus-play" % "7.0.2" % Test,
  "com.themillhousegroup" %% "scoup" % "1.0.0" % Test,
  "org.wiremock" % "wiremock" % wiremockVersion % Test,
//  "org.wiremock" % "wiremock-jre8" % wiremockVersion % Test,
  "org.testcontainers" % "testcontainers" % "2.0.3" % Test,
  "com.dimafeng" %% "testcontainers-scala-scalatest" % "0.44.1" % Test,
  "org.apache.commons" % "commons-lang3" % "3.20.0",
  "org.bouncycastle" % "bcprov-jdk18on" % "1.83",
  // play framework
  "org.playframework" %% "play-json" % "3.0.6",
  "org.playframework" %% "play-pekko-http2-support" % "3.0.10",
  // pekko
  "org.apache.pekko" %% "pekko-connectors-kafka" % "1.1.0",
  "org.apache.pekko" %% "pekko-connectors-s3" % "1.2.0",
  "com.auth0" % "java-jwt" % "4.5.1" excludeAll (excludesJackson: _*),
  "com.auth0" % "jwks-rsa" % "0.23.0" excludeAll (excludesJackson: _*), // https://github.com/auth0/jwks-rsa-java
  "com.nimbusds" % "nimbus-jose-jwt" % "10.7",
  "com.softwaremill.macwire" %% "macros" % "2.6.7" % "provided",
  "io.vertx" % "vertx-pg-client" % "5.0.8",
  "com.ongres.scram" % "common" % "2.1",
  "com.ongres.scram" % "client" % "2.1",
  "io.nayuki" % "qrcodegen" % "1.8.0",
  "com.eatthepath" % "java-otp" % "0.4.0",
  "com.sun.mail" % "jakarta.mail" % "2.0.2",
  "org.gnieh" %% "diffson-play-json" % "4.6.1" excludeAll ExclusionRule(
    organization = "com.typesafe.akka"
  ),
  "org.typelevel" %% "cats-core" % "2.13.0",
  "de.svenkubiak" % "jBCrypt" % "0.4.3",
  "software.amazon.awssdk" % "aws-core" % awsJavaSdkVersion,
  "software.amazon.awssdk" % "s3" % awsJavaSdkVersion,
  "com.googlecode.owasp-java-html-sanitizer" % "owasp-java-html-sanitizer" % "20260102.1",
  "commons-logging" % "commons-logging" % "1.3.5",
  "com.github.jknack" % "handlebars" % "4.5.0",
  "org.sangria-graphql" %% "sangria" % "4.2.15",
  "org.sangria-graphql" %% "sangria-play-json" % "2.0.2" excludeAll ExclusionRule(
    organization = "com.typesafe.play"
  ),
  "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.17.3",
  "org.apache.logging.log4j" % "log4j-api" % "2.25.3",
  "com.github.blemale" %% "scaffeine" % "5.3.0",
  "com.github.slugify" % "slugify" % "3.0.7",
  "joda-time" % "joda-time" % "2.14.0"
)

dependencyOverrides ++= Seq(
  // Netty 4.2.x (aligned for Vert.x 5 + Play/Pekko)
  "io.netty" % "netty-buffer" % "4.2.10.Final",
  "io.netty" % "netty-codec" % "4.2.10.Final",
  "io.netty" % "netty-codec-base" % "4.2.10.Final",
  "io.netty" % "netty-codec-http" % "4.2.10.Final",
  "io.netty" % "netty-codec-http2" % "4.2.10.Final",
  "io.netty" % "netty-codec-compression" % "4.2.10.Final",
  "io.netty" % "netty-codec-dns" % "4.2.10.Final",
  "io.netty" % "netty-codec-socks" % "4.2.10.Final",
  "io.netty" % "netty-common" % "4.2.10.Final",
  "io.netty" % "netty-handler" % "4.2.10.Final",
  "io.netty" % "netty-handler-proxy" % "4.2.10.Final",
  "io.netty" % "netty-resolver" % "4.2.10.Final",
  "io.netty" % "netty-resolver-dns" % "4.2.10.Final",
  "io.netty" % "netty-transport" % "4.2.10.Final",
  "io.netty" % "netty-transport-native-unix-common" % "4.2.10.Final",
  //jackson
  "com.fasterxml.jackson.core" % "jackson-core" % jacksonVersion,
  "com.fasterxml.jackson.core" % "jackson-databind" % jacksonVersion,
  "com.fasterxml.jackson.core" % "jackson-annotations" % jacksonVersion,
  "com.fasterxml.jackson.module" %% "jackson-module-scala" % jacksonVersion,
  "com.fasterxml.jackson.module" % "jackson-module-parameter-names" % jacksonVersion,
  "com.fasterxml.jackson.datatype" % "jackson-datatype-jsr310" % jacksonVersion,
  "com.fasterxml.jackson.datatype" % "jackson-datatype-jdk8" % jacksonVersion,
  "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % jacksonVersion,
  // Pekko Core
  "org.apache.pekko" %% "pekko-actor" % pekkoVersion,
  "org.apache.pekko" %% "pekko-actor-typed" % pekkoVersion,
  "org.apache.pekko" %% "pekko-stream" % pekkoVersion,
  "org.apache.pekko" %% "pekko-slf4j" % pekkoVersion,
  "org.apache.pekko" %% "pekko-serialization-jackson" % pekkoVersion,
  "org.apache.pekko" %% "pekko-protobuf-v3" % pekkoVersion,

  // Pekko HTTP
  "org.apache.pekko" %% "pekko-http" % pekkoHttpVersion,
  "org.apache.pekko" %% "pekko-http-core" % pekkoHttpVersion,
  "org.apache.pekko" %% "pekko-parsing" % pekkoHttpVersion,
  "org.apache.pekko" %% "pekko-http-xml" % pekkoHttpVersion,
)

Test / fork := true

scalacOptions ++= Seq(
  "-feature",
  "-language:higherKinds",
  "-language:implicitConversions",
  "-language:existentials",
  "-language:postfixOps",
  "-Wconf:msg=possible missing interpolator:silent",
  "-Wconf:src=conf/routes:silent",  // Exact path
  "-Wconf:src=views/.*:silent",
  "-Wconf:msg=discarded non-Unit value:s",
)

//scalacOptions ++= {
//  CrossVersion.partialVersion(scalaVersion.value) match {
//    case Some((2, _)) => {
//      Seq("-Xsource:3", "-quickfix:cat=scala3-migration")
//    }
//    case Some((3, _)) => {
//      Seq(
//        "-explain-cyclic",
//        "-explain",
//        "-Xmax-inlines:64"
//      )
//    }
//    case _ => sys.error("Unsupported scala version")
//  }
//}

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

import sbtrelease.ReleasePlugin.autoImport.ReleaseTransformations.*

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
