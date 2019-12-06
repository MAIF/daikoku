import com.typesafe.sbt.packager.docker.{Cmd, ExecCmd}

name := """daikoku"""
organization := "fr.maif.otoroshi"
version := "1.0.0-dev"
maintainer := "oss@maif.fr"
packageName in Universal := "daikoku"

scalaVersion := "2.12.8"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala, DockerPlugin)
  .disablePlugins(PlayFilters)

libraryDependencies ++= Seq(
  ws,
  filters,
  "org.gnieh"                %% "diffson-play-json"        % "3.1.1" excludeAll (ExclusionRule(organization = "com.typesafe.akka")),
  "org.scalatestplus.play"   %% "scalatestplus-play"       % "3.1.2" % Test,
  "com.themillhousegroup"    %% "scoup"                    % "0.4.6" % Test,
  "com.typesafe.play"        %% "play-json"                % "2.6.10",
  "com.typesafe.play"        %% "play-json-joda"           % "2.6.10",
  "com.auth0"                % "java-jwt"                  % "3.4.0",
  "com.auth0"                % "jwks-rsa"                  % "0.7.0", // https://github.com/auth0/jwks-rsa-java
  "com.nimbusds"             % "nimbus-jose-jwt"           % "6.0",
  "com.softwaremill.macwire" %% "macros"                   % "2.3.0" % "provided",
  "javax.xml.bind"           % "jaxb-api"                  % "2.3.0",
  "com.sun.xml.bind"         % "jaxb-core"                 % "2.3.0",
  "com.sun.xml.bind"         % "jaxb-impl"                 % "2.3.0",
  "org.reactivemongo"        %% "play2-reactivemongo"      % "0.16.0-play26",
  "org.reactivemongo"        %% "reactivemongo-akkastream" % "0.16.0",
  "com.typesafe.akka"        %% "akka-stream-kafka"        % "0.21",
  "org.typelevel"            %% "cats-core"                % "1.3.1",
  "de.svenkubiak"            % "jBCrypt"                   % "0.4.1",
  "com.propensive"           %% "kaleidoscope"             % "0.1.0",
  "com.lightbend.akka"       %% "akka-stream-alpakka-s3"   % "1.0.1",
  "com.github.tomakehurst"   % "wiremock"                  % "1.33" % "test"
)

scalacOptions ++= Seq(
  "-feature",
  "-language:higherKinds",
  "-language:implicitConversions",
  "-language:existentials",
  "-language:postfixOps",
  "-Ypartial-unification",
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
    MergeStrategy.discard
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

dockerCommands :=
  dockerCommands.value.flatMap {
    case ExecCmd("ENTRYPOINT", args @ _*) => Seq(Cmd("ENTRYPOINT", args.mkString(" ")))
    case v                                => Seq(v)
  }

dockerUpdateLatest := true

// swaggerDomainNameSpaces := Seq("fr.maif.otoroshi.daikoku.domain")
// swaggerV3 := true
// swaggerPrettyJson := true

import ReleaseTransformations._

releaseProcess := Seq[ReleaseStep](
  checkSnapshotDependencies,              // : ReleaseStep
  inquireVersions,                        // : ReleaseStep
  runClean,                               // : ReleaseStep
  // runTest,                                // : ReleaseStep
  setReleaseVersion,                      // : ReleaseStep
  commitReleaseVersion,                   // : ReleaseStep, performs the initial git checks
  tagRelease,                             // : ReleaseStep
  // publishArtifacts,                       // : ReleaseStep, checks whether `publishTo` is properly set up
  setNextVersion,                         // : ReleaseStep
  commitNextVersion,                      // : ReleaseStep
  pushChanges                             // : ReleaseStep, also checks that an upstream branch is properly configured
)
