package fr.maif.otoroshi.daikoku

import fr.maif.otoroshi.daikoku.modules.DaikokuComponentsInstances
import play.api.ApplicationLoader.Context
import play.api._

class DaikokuLoader extends ApplicationLoader {
  def load(context: Context): Application = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }
    new DaikokuComponentsInstances(context).application
  }
}