// export interface TOption<A> {
//   map<B>(f: (a: A) => B): TOption<B>;
//   flatMap<B>(f: (a: A) => TOption<B>): TOption<B>;
//   fold<B>(ifEmpty: B, f: (a: A) => B): B;
//   orElse<B extends A>(ob: TOption<B>): TOption<A>;
//   getOrElse<B extends A>(a: B): A;
//   getOrNull(): A | undefined
//   isDefined: boolean;
//   exists(f: (a: A) => boolean): boolean;
//   filter(f: (a: A) => boolean): TOption<A>;
// }

export const Option = (x) => (x === undefined || x === null ? None : Some(x));

export const Some = (x) => ({
  map: (f) => Option(f(x)),
  flatMap: (f) => f(x),
  fold: (_ifEmpty, f) => f(x),
  orElse: () => Option(x),
  getOrElse: () => x,
  getOrNull: () => x,
  isDefined: true,
  exists: (f) => Option(f(x)).isDefined,
  filter: (f) => (f(x) ? Option(x) : None),
});

export const None = {
  map: () => None,
  flatMap: () => None,
  fold: (ifEmpty) => ifEmpty(),
  orElse: (x) => Option(x),
  getOrElse: (ifEmpty) => ifEmpty,
  getOrNull: () => undefined,
  isDefined: false,
  exists: () => false,
  filter: () => None,
};
