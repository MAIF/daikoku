package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture

import scala.concurrent.Future

object future {

  implicit final class EnhancedObject[A](any: A) {
    def asFuture: Future[A] = FastFuture.successful(any)
    def future: Future[A] = FastFuture.successful(any)
  }

}
