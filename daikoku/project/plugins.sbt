addSbtPlugin("org.playframework" % "sbt-plugin" % "3.0.0")
//addSbtPlugin("io.get-coursier" % "sbt-coursier" % "2.0.8")
addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")
addSbtPlugin("com.github.gseitz" % "sbt-release" % "1.0.12")
addSbtPlugin("org.scoverage" % "sbt-scoverage" % "2.0.9")
addSbtPlugin("com.eed3si9n" % "sbt-buildinfo" % "0.11.0")
addSbtPlugin("io.spray" % "sbt-revolver" % "0.10.0")
addSbtPlugin("com.github.sbt" % "sbt-license-report" % "1.6.1")
addDependencyTreePlugin

// See https://github.com/scala/bug/issues/12632
ThisBuild / libraryDependencySchemes ++= Seq(
  "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
)
