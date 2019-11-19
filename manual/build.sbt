name := """daikoku-manual"""
organization := "fr.maif.daikoku"
version := "1.0.0-dev"

lazy val docs = (project in file("."))
  .enablePlugins(ParadoxPlugin)
  .settings(
    name := "Daikoku",
    paradoxTheme := Some(builtinParadoxTheme("generic"))
  )