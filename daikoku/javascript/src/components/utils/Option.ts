type mapper<In, Out> = (t: In) => Out | undefined | null
type strictMapper<In, Out> = (t: In) => Out

export interface OptionType<DataType> {
  map<Out>(f: mapper<DataType, Out>): OptionType<Out>

  flatMap<Out>(f: mapper<DataType, OptionType<Out>>): OptionType<Out>

  fold<Out> (_ifEmpty: () => Out, f: strictMapper<DataType, Out>): Out

  orElse(x: DataType | undefined): OptionType<DataType>

  getOrElse(other: DataType): DataType

  getOrNull(): DataType | undefined

  isDefined(): boolean

  exists(f: (data: DataType) => any): boolean

  filter(f: (data: DataType) => boolean): OptionType<DataType>  
}

export function Option<DataType>(x: DataType | undefined | null): OptionType<DataType> {
  return (x === undefined || x === null ? None : Some(x))
}

export const Some: <T>(x: T) => OptionType<T> =  (x) => {
  return {
  map: (f) => Option(f(x)),
  flatMap: (f) => Option(f(x)).getOrElse(None),
  fold: (_ifEmpty, f) => f(x),
  orElse: () => Option(x),
  getOrElse: () => x,
  getOrNull: () => x,
  isDefined: () => true,
  exists: (f) => Option(f(x)).isDefined(),
  filter: (f) => (f(x) ? Option(x) : None)
}}

export const None: OptionType<any> = {
  map: () => None,
  flatMap: () => None,
  fold: (ifEmpty: () => any) => ifEmpty(),
  orElse: (x: any) => Option(x),
  getOrElse: (ifEmpty) => ifEmpty,
  getOrNull: () => undefined,
  isDefined: () => false,
  exists: () => false,
  filter: () => None
};