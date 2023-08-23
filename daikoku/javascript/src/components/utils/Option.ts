interface ISome<A> extends IOption<A> {}
interface INone extends IOption<undefined> {}

export interface IOption<A> {
  map<B>(f: (a: A) => B): ISome<B> | INone;
  flatMap<B>(f: (a: A) => IOption<B>): IOption<B> | INone;
  fold<B>(ifEmpty: B, f: (a: A) => B): B;
  orElse<B>(ob: B): IOption<A> | IOption<B> | INone;
  getOrElse<B>(b: B): A | B;
  getOrNull(): A | undefined
  isDefined: boolean;
  exists(f: (a: A) => boolean): boolean;
  filter(f: (a: A) => boolean): IOption<A> | INone;
}


export const Option = <T>(x: T) => (x === undefined || x === null ? None : Some(x));

export const Some = <T>(x: T) => ({
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
