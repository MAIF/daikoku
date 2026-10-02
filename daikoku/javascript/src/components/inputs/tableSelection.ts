export function updateSelectedRowCache<T>(
  previous: ReadonlyMap<string, T>,
  items: T[],
  selection: Record<string, boolean>,
  getRowId: (row: T) => string
): ReadonlyMap<string, T> {
  const next = new Map([...previous].filter(([id]) => selection[id]));
  for (const item of items) {
    const id = getRowId(item);
    if (selection[id]) next.set(id, item);
  }

  if (next.size === previous.size && [...next].every(([id, row]) => previous.get(id) === row)) {
    return previous;
  }
  return next;
}
