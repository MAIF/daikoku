package storage.drivers.postgres.jooq.api

import org.jooq.{Field, Record, Table}

trait QueryResult {
  /**
   * Returns a value for a {@code Field}.
   *
   * @param field the {@code Field} to get.
   * @param <     T>
   * @return The field's value or {@code null}.
   */
  def get[T](field: Field[T]): T

  /**
   * Returns a value by index. Because jOOQ-{@code Converters} are not respected by all implementations favor
   * {@code jooq_async_reactive.QueryResult#get(Field<T>)} method.
   *
   * @param index the index of the column's value you wish to get.
   * @param type  the expected type of that column.
   * @param <     T>
   * @return The field's value or {@code null}.
   * @throws ClassCastException If the column is mapped by a jOOQ-{@code Converter}, the underlying implementation
   *                            might throw a {@code ClassCastException} because the non-jOOQ drivers are not aware of converters. For correct
   *                            handling for fields with converters favor {@code jooq_async_reactive.QueryResult#get(Field<T>)} method.
   */
  def get[T](index: Int, `type`: Class[T]): T

  /**
   * Returns a value by index. Because jOOQ-{@code Converters} are not respected by all implementations favor
   *
   * @param index the index of the column's value you wish to get.
   * @param field the expected type of that column.
   * @param <     T>
   * @return
   */
  def get[T](index: Int, field: Field[T]): T

  /**
   * Returns a value by name. Because jOOQ-{@code Converters} are not respected by all implementations favor
   * {@code jooq_async_reactive.QueryResult#get(Field<T>)} method.
   *
   * @param columnName the name of the column you wish to get.
   * @param type       the expected type of that column.
   * @param <          T>
   * @return The field's value or {@code null}.
   * @throws ClassCastException If the column is mapped by a jOOQ-{@code Converter}, the underlying implementation
   *                            might throw a {@code ClassCastException} because the non-jOOQ drivers are not aware of converters. For correct
   *                            handling for fields with converters favor {@code jooq_async_reactive.QueryResult#get(Field<T>)} method.
   */
  def get[T](columnName: String, `type`: Class[T]): T

  def toRecord[T <: Record](table: Table[T]): T

  def toRecord[T <: Record](record: T): T
}
