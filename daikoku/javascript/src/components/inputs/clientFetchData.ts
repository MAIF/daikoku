import { isError, ResponseError } from '../../types';
import { FetchData, FetchResult } from './DynamicTable';

// `DynamicTable` is built for server-side pagination: it asks `fetchData` for a
// single page and trusts the returned totals. A few tables have no paginated
// endpoint to call — either because the data is already in memory client-side
// (tenant sub-forms, i18n translations) or because the REST route still returns
// the whole collection at once. `clientFetchData` bridges the two: it loads the
// full list and applies filtering, sorting and slicing in memory, so the caller
// looks exactly like a server-paginated one.
//
// Swapping a table over to a real paginated endpoint later means replacing the
// `clientFetchData(...)` call with a plain `FetchData` — nothing else changes.

type Loader<T> = () => Array<T> | Promise<Array<T> | ResponseError>;

export type ClientTableOptions<T> = {
  /**
   * Values scanned by text filters. When omitted, a text filter matches against
   * the item field named after the filter id.
   */
  searchable?: (item: T) => Array<string | undefined | null>;
  /** Per-filter-id predicates, for filters the default matching can't express. */
  filterFns?: Record<string, (item: T, value: any) => boolean>;
  /**
   * Per-column-id sort keys. Needed for columns built from an accessor function
   * (their id maps to no field), optional for plain field accessors.
   */
  sortValues?: Record<string, (item: T) => unknown>;
};

const readPath = (item: unknown, path: string): unknown =>
  path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), item);

const compare = (a: unknown, b: unknown): number => {
  // Missing values sort last whichever direction is asked, like TanStack's
  // default `sortUndefined: 1`.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export function clientFetchData<T>(
  load: Loader<T>,
  options: ClientTableOptions<T> = {}
): FetchData<T> {
  const { searchable, filterFns = {}, sortValues = {} } = options;

  const matches = (item: T, id: string, value: unknown): boolean => {
    const filterFn = filterFns[id];
    if (filterFn) return filterFn(item, value);

    if (typeof value === 'string') {
      const needle = value.trim().toLowerCase();
      if (!needle) return true;
      const haystack = searchable ? searchable(item) : [readPath(item, id)];
      return haystack.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
    }
    // A multiselect filter with nothing selected matches everything.
    if (Array.isArray(value)) return value.length === 0 || value.includes(readPath(item, id));
    return readPath(item, id) === value;
  };

  const sortKey = (id: string) => sortValues[id] ?? ((item: T) => readPath(item, id));

  return ({ limit, offset, filters, sorting }) =>
    Promise.resolve(load()).then((loaded): FetchResult<T> => {
      if (isError(loaded)) throw new Error(loaded.error);

      const filtered = filters.reduce(
        (rows, { id, value }) => rows.filter((item) => matches(item, id, value)),
        loaded
      );

      const sorted = sorting.length
        ? [...filtered].sort((a, b) => {
          for (const { id, desc } of sorting) {
            const get = sortKey(id);
            const result = compare(get(a), get(b));
            if (result !== 0) return desc ? -result : result;
          }
          return 0;
        })
        : filtered;

      return {
        items: sorted.slice(offset, offset + limit),
        total: loaded.length,
        totalFiltered: filtered.length,
      };
    });
}
