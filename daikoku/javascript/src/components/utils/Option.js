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
  fold: (ifEmpty, _f) => ifEmpty(),
  orElse: (x) => Option(x),
  getOrElse: (ifEmpty) => ifEmpty,
  getOrNull: () => undefined,
  isDefined: false,
  exists: () => false,
  filter: () => None,
};
