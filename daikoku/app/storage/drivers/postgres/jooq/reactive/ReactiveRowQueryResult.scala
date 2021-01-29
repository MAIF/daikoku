package storage.drivers.postgres.jooq.reactive

import io.vertx.core.json.{JsonArray, JsonObject}
import io.vertx.sqlclient.Row
import org.jooq.tools.Convert
import org.jooq.{Converter, Field, JSON, JSONB, Record, Table}
import storage.drivers.postgres.jooq.api.QueryResult

import java.util

case class ReactiveRowQueryResult(current: Row) extends QueryResult {

  def get[T](field: Field[T]): T =
    handleValue(current.getValue(field.getName), field.getConverter).get

  override def get[T](index: Int, `type`: Class[T]): T =
    Convert.convert(current.getValue(index), `type`)

  def get[T](index: Int, field: Field[T]): T =
    handleValue(current.getValue(index), field.getConverter).get

  override def get[T](columnName: String, `type`: Class[T]): T =
    Convert.convert(current.getValue(columnName), `type`)

  private def handleValue[T](value: Any, converter: Converter[_, T]): Option[T] = {
    if (value == null)
      return None

    value match {
      case array: JsonArray =>
        if (converter != null && converter.fromType.equals(classOf[JSON]))
          return Some(Convert.convert(JSON.valueOf(array.encode), converter))
        else if (converter != null && converter.fromType.equals(classOf[JSONB]))
          return Some(Convert.convert(JSONB.valueOf(array.encode), converter))
      case jsonObject: JsonObject =>
        if (converter != null && converter.fromType.equals(classOf[JSON]))
          return Some(Convert.convert(JSON.valueOf(jsonObject.encode), converter))
        else if (converter != null && converter.fromType.equals(classOf[JSONB]))
          return Some(Convert.convert(JSONB.valueOf(jsonObject.encode), converter))
    }

    // When incoming null value (null JSON value, not the database null value)
    // we'll read the value as an object (not a sub class)
    if (value.getClass == classOf[Any])
      return Some(JSON.valueOf("null").asInstanceOf[T])

    Some(Convert.convert(value, converter))
  }

  override def toRecord[T <: Record](table: Table[T]): T =
    toRecord(table.newRecord)

  override def toRecord[T <: Record](record: T): T = {
    util.Arrays.stream(record.fields).forEach((field: Field[_]) => record.set(field.asInstanceOf[Nothing], this.get(field)))
    record
  }
}
