name := """daikoku-manual"""
organization := "fr.maif.daikoku"
version := "1.5"

lazy val root = (project in file(".")).
  enablePlugins(ParadoxPlugin).
  settings(
    name := "Daikoku",
    paradoxTheme := Some(builtinParadoxTheme("generic"))
  )