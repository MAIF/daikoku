package fr.maif.daikoku

import fr.maif.daikoku.modules.DaikokuComponentsInstances
import play.api.*
import play.api.ApplicationLoader.Context

class DaikokuApplicationLoader extends ApplicationLoader {
  def load(context: Context): Application = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }
    new DaikokuComponentsInstances(context).application
  }
}