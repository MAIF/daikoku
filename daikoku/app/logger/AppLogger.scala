package fr.maif.otoroshi.daikoku.logger

import play.api.{Logger, MarkerContext}

object AppLogger {
  val logger: Logger = Logger("application")

  def debug(message: => String)(implicit mc: MarkerContext): Unit = {
    logger.debug(message)
  }

  def info(message: => String)(implicit mc: MarkerContext): Unit = {
    logger.info(message)
  }

  def warn(message: => String)(implicit mc: MarkerContext): Unit = {
    logger.warn(message)
  }

  def warn(message: => String, error: => Throwable)(implicit
      mc: MarkerContext
  ): Unit = {
    logger.warn(message, error)
  }

  def error(message: => String)(implicit mc: MarkerContext): Unit = {
    logger.error(message)
  }

  def error(message: => String, error: => Throwable)(implicit
      mc: MarkerContext
  ): Unit = {
    logger.error(message, error)
  }

}
