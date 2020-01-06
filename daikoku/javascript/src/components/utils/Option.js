export const Option = x => (x === undefined || x === null ? None : Some(x));

export const Some = x => ({
  map: f => Option(f(x)),
  flatMap: f => f(x),
  fold: (ifEmpty, f) => f(x),
  getOrElse: () => x,
});

export const None = {
  map: () => None,
  flatMap: () => None,
  fold: (ifEmpty, f) => ifEmpty(),
  getOrElse: ifEmpty => ifEmpty,
};
