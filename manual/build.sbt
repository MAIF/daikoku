name := """daikoku-manual"""
organization := "fr.maif.daikoku"

lazy val root = (project in file(".")).
  enablePlugins(ParadoxPlugin).
  settings(
    name := "Daikoku",
    paradoxTheme := Some(builtinParadoxTheme("generic"))
  )

import sbtrelease.ReleasePlugin.autoImport.ReleaseTransformations._

releaseProcess := Seq[ReleaseStep](
  // checkSnapshotDependencies, // : ReleaseStep
  inquireVersions, // : ReleaseStep
  // runClean, // : ReleaseStep
  // runTest,                                // : ReleaseStep
  setReleaseVersion, // : ReleaseStep
  commitReleaseVersion, // : ReleaseStep, performs the initial git checks
  // tagRelease, // : ReleaseStep
  // publishArtifacts,                       // : ReleaseStep, checks whether `publishTo` is properly set up
  // setNextVersion, // : ReleaseStep
  // commitNextVersion, // : ReleaseStep
  // pushChanges // : ReleaseStep, also checks that an upstream branch is properly configured
)