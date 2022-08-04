export const Option = (x: any) => x === undefined || x === null ? None : Some(x);

export const Some = (x: any) => ({
    map: (f: any) => Option(f(x)),
  flatMap: (f: any) => f(x),
  fold: (_ifEmpty: any, f: any) => f(x),
  orElse: () => Option(x),
  getOrElse: () => x,
  getOrNull: () => x,
  isDefined: true,
  exists: (f: any) => Option(f(x)).isDefined,
  filter: (f: any) => f(x) ? Option(x) : None
});

export const None = {
  map: () => None,
  flatMap: () => None,
  fold: (ifEmpty: any) => ifEmpty(),
  orElse: (x: any) => Option(x),
  getOrElse: (ifEmpty: any) => ifEmpty,
  getOrNull: () => undefined,
  isDefined: false,
  exists: () => false,
  filter: () => None,
};
