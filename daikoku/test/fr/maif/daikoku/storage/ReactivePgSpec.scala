package fr.maif.daikoku.storage

import fr.maif.daikoku.storage.drivers.postgres.ReactivePg
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Sink
import org.scalatestplus.play.PlaySpec

import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext}

class ReactivePgSpec extends PlaySpec with DaikokuSpecHelper {

  "A streamed query" should {
    "give its connection back when the client stops reading" in {
      given Materializer = daikokuComponents.env.defaultMaterializer
      given ExecutionContext = daikokuComponents.env.defaultExecutionContext

      val reactivePg =
        new ReactivePg(
          daikokuComponents.pgPool,
          daikokuComponents.configuration
        )
      val poolSize =
        daikokuComponents.configuration.get[Int]("daikoku.postgres.poolSize")

      (1 to poolSize + 1).foreach { _ =>
        val first = reactivePg
          .queryStreamSource("SELECT generate_series(1, 1000) AS n")(row =>
            Some(row.getInteger("n").intValue)
          )
          .runWith(Sink.head)

        Await.result(first, 5.seconds) mustBe 1
      }
    }
  }
}
