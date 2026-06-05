import classNames from 'classnames';
import debounce from 'lodash/debounce';
import { ChangeEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select, { MultiValue, OptionProps, ValueContainerProps, components } from 'react-select';
import Pagination from 'react-paginate';
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  Row,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { I18nContext } from '../../contexts';
import { Spinner } from '../utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> extends DynamicTableColumnMeta { }
}

type DynamicTableColumnMeta = {
  className?: string;
  /** Already-translated label used to draw the column header. */
  title?: string;
};

type FilterOption = {
  label: string;
  value: string;
};

export type FilterDef =
  | {
    id: string;
    type: 'multiselect';
    labelKey: string;
    labelKeyAll: string;
    options: FilterOption[];
    isLoading?: boolean;
    countKey?: string;
  }
  | {
    id: string;
    type: 'text';
    placeholder?: string;
    debounceMs?: number;
  }
  | {
    id: string;
    type: 'boolean';
    onLabel: string;
    offLabel: string;
    /** 'toggle' renders a two-button group (default), 'checkbox' renders a form-switch */
    style?: 'toggle' | 'checkbox';
  };

export type FetchResult<T> = {
  items: T[];
  total: number;
  totalFiltered?: number;
  totalSelectable?: number;
  filterCounts?: Record<string, Array<{ key: string; total: number }>>;
};

export type FetchData<T> = (params: {
  limit: number;
  offset: number;
  filters: ColumnFiltersState;
  sorting: SortingState;
}) => Promise<FetchResult<T>>;

export type BulkActionContext = {
  refetch: () => void;
  resetFilters: () => void;
};

export type BulkAction<T> = {
  label: string;
  onClick: (rows: T[], selectAll: boolean, ctx: BulkActionContext) => Promise<void>;
};

type ExtraSelectProps = {
  labelKey: string;
  labelKeyAll: string;
  getCount: (value: string) => number | undefined;
};

const SummaryValueContainer = (
  props: ValueContainerProps<FilterOption, true> & { selectProps: ExtraSelectProps }
) => {
  const { translate } = useContext(I18nContext);
  const { getValue, hasValue, selectProps, children } = props;
  const nbValues = getValue().length;
  const noun = translate({ key: selectProps.labelKey, plural: nbValues > 1 });

  // children = [selected chips array, input]. We hide chips, keep the input for search.
  const input = Array.isArray(children) ? children[1] : children;

  const summary = !hasValue || nbValues === 0
    ? translate(selectProps.labelKeyAll)
    : translate({
      key: 'table.filter.summary.label',
      plural: nbValues > 1,
      replacements: [`${nbValues} ${noun.toLowerCase()}`],
    });

  const isTyping = !!(selectProps as any).inputValue;

  const clearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (selectProps as any).onChange([], { action: 'clear' });
  };

  return (
    <components.ValueContainer {...props}>
      {!isTyping && (
        <span
          className="text-truncate"
          style={{ position: 'absolute', left: 8, right: nbValues > 0 ? 28 : 8, pointerEvents: 'none' }}
        >
          {summary}
        </span>
      )}
      {nbValues > 0 && !isTyping && (
        <button
          type="button"
          className="btn-close"
          style={{ position: 'absolute', right: 8, fontSize: '0.65em', zIndex: 1 }}
          onMouseDown={clearAll}
          aria-label="Clear selection"
        />
      )}
      {input}
    </components.ValueContainer>
  );
};

const CustomOption = (
  props: OptionProps<FilterOption, true> & { selectProps: ExtraSelectProps }
) => {
  const { data, selectProps } = props;
  const total = selectProps.getCount(data.value);

  return (
    <components.Option {...props}>
      <div className="d-flex justify-content-between align-items-center gap-2 w-100">
        <span>{data.label}</span>
        {!!total && <span className="badge badge-custom-warning">{total}</span>}
      </div>
    </components.Option>
  );
};

const menuStyle = {
  MenuPortal: (base: object) => ({ ...base, zIndex: 9999 }),
  menu: (base: object) => ({ ...base, width: 'max-content', minWidth: '100%', zIndex: 100 }),
  menuList: (base: object) => ({ ...base, whiteSpace: 'nowrap' as const }),
  control: (base: object) => ({ ...base, width: '220px', flexWrap: 'nowrap' as const }),
  valueContainer: (base: object) => ({ ...base, flexWrap: 'nowrap' as const, overflow: 'hidden' }),
};

export type DynamicTableColumnCtx = {
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  selectAll: boolean;
};

export type DynamicTableProps<T> = {
  queryKey: unknown[];
  columns: ColumnDef<T, any>[] | ((ctx: DynamicTableColumnCtx) => ColumnDef<T, any>[]);
  fetchData: FetchData<T>;
  filters?: FilterDef[];
  defaultFilters?: ColumnFiltersState;
  defaultSorting?: SortingState;
  enableRowSelection?: boolean | ((row: Row<T>) => boolean);
  bulkActions?: BulkAction<T>[];
  pageSize?: number;
  persistFiltersInUrl?: boolean;
  toolbar?: ReactNode;
  getRowId?: (row: T) => string;
  getRowAriaLabel?: (row: T) => string;
  /** CSS class added to the `<div>` wrapping the rows. Default: 'notification-table table-rows' */
  dataClassName?: string;
  /** Translation key for the item noun (used with plural support). Shown as "{n} {label}" or "{filtered} {label} (sur {total})". */
  countLabelKey?: string;
  tableClassName?: string;
};

export function DynamicTable<T>({
  queryKey,
  columns,
  fetchData,
  filters = [],
  defaultFilters = [],
  defaultSorting = [],
  enableRowSelection,
  bulkActions = [],
  pageSize = 25,
  persistFiltersInUrl = true,
  toolbar,
  getRowId,
  getRowAriaLabel,
  dataClassName = 'notification-table table-rows',
  countLabelKey,
  tableClassName,
}: DynamicTableProps<T>) {
  const { translate } = useContext(I18nContext);
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => {
    if (!persistFiltersInUrl) return defaultFilters;
    const f = searchParams.get('filter');
    return f ? JSON.parse(decodeURIComponent(f)) : defaultFilters;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters);
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const [page, setPage] = useState(0);
  const [selectAll, setSelectAll] = useState(false);
  const [textInputVals, setTextInputVals] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    initialFilters.forEach((f: { id: string; value: unknown }) => {
      const def = filters.find(fd => fd.id === f.id);
      if (def?.type === 'text') vals[f.id] = f.value as string;
    });
    return vals;
  });

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (persistFiltersInUrl) {
      window.history.replaceState(null, '', `?filter=${JSON.stringify(columnFilters)}`);
    }
  }, [columnFilters, persistFiltersInUrl]);

  const dataQuery = useQuery({
    queryKey: [...queryKey, pageSize, columnFilters, sorting, page],
    queryFn: () =>
      fetchData({ limit: pageSize, offset: page * pageSize, filters: columnFilters, sorting }),
  });

  const items: T[] = dataQuery.data?.items ?? [];
  const total = dataQuery.data?.total ?? 0;
  const totalFiltered = dataQuery.data?.totalFiltered ?? total;
  const totalSelectable = dataQuery.data?.totalSelectable ?? 0;
  const filterCounts = dataQuery.data?.filterCounts;

  const resolvedColumns = useMemo(
    () => typeof columns === 'function' ? columns({ setColumnFilters, selectAll }) : columns,
    // setColumnFilters is stable from useState
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, selectAll]
  );

  const defaultData = useMemo(() => [], []);
  const table = useReactTable<T>({
    data: items.length ? items : defaultData,
    columns: resolvedColumns,
    getRowId,
    rowCount: totalFiltered,
    state: { pagination, columnFilters, sorting },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: enableRowSelection === undefined ? false : enableRowSelection,
    enableSubRowSelection: true,
    enableMultiRowSelection: true,
  });

  // Filter helpers
  const handleSelectChange = (data: MultiValue<FilterOption>, id: string) => {
    setColumnFilters([...columnFilters.filter(f => f.id !== id), { id, value: data.map(d => d.value) }]);
  };

  const clearFilter = (id: string, value: string) => {
    const existing = (columnFilters.find(c => c.id === id)?.value as string[]) ?? [];
    setColumnFilters([
      ...columnFilters.filter(c => c.id !== id),
      { id, value: existing.filter(v => v !== value) },
    ]);
  };

  const getMultiselectValue = (id: string, options: FilterOption[]) => {
    const selected = (columnFilters.find(f => f.id === id)?.value as string[]) ?? [];
    return options.filter(o => selected.includes(o.value));
  };

  const debouncedTextChange = useMemo(() => {
    const byId: Record<string, (e: ChangeEvent<HTMLInputElement>) => void> = {};
    filters.forEach(f => {
      if (f.type === 'text') {
        byId[f.id] = debounce((e: ChangeEvent<HTMLInputElement>) => {
          setColumnFilters(prev => [
            ...prev.filter(cf => cf.id !== f.id),
            { id: f.id, value: e.target.value },
          ]);
        }, f.debounceMs ?? 500);
      }
    });
    return byId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bulk actions
  const hasBulkActions =
    bulkActions.length > 0 &&
    enableRowSelection !== undefined &&
    enableRowSelection !== false;
  const someSelected = table.getIsSomeRowsSelected() || table.getIsAllRowsSelected();

  const handleBulkAction = async (action: BulkAction<T>) => {
    const rows = table.getSelectedRowModel().rows.map(r => r.original);
    const ctx: BulkActionContext = {
      refetch: () => queryClient.invalidateQueries({ queryKey }),
      resetFilters: () => setColumnFilters(defaultFilters),
    };
    await action.onClick(rows, selectAll, ctx);
    table.resetRowSelection();
    setSelectAll(false);
  };

  const renderFilterToolbar = () => {
    if (!filters.length) return null;
    return (
      <div className="d-flex flex-row gap-3 justify-content-start align-items-center flex-wrap">
        {filters.map(f => {
          if (f.type === 'multiselect') {
            const getCount = (v: string): number | undefined => {
              if (!f.countKey || !filterCounts) return undefined;
              return filterCounts[f.countKey]?.find(c => c.key === v)?.total;
            };
            return (
              <Select
                key={f.id}
                isMulti
                // @ts-ignore
                components={{ ValueContainer: SummaryValueContainer, Option: CustomOption, MultiValue: () => null }}
                options={f.options}
                isLoading={f.isLoading}
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                isSearchable
                isClearable={false}
                labelKey={f.labelKey}
                labelKeyAll={f.labelKeyAll}
                getCount={getCount}
                classNamePrefix="daikoku-select"
                styles={menuStyle}
                onChange={data => handleSelectChange(data, f.id)}
                value={getMultiselectValue(f.id, f.options)}
              />
            );
          }
          if (f.type === 'text') {
            return (
              <div key={f.id} className="position-relative">
                <input
                  type="text"
                  className="form-control pe-5"
                  placeholder={f.placeholder ?? ''}
                  value={textInputVals[f.id] ?? ''}
                  onChange={e => {
                    setTextInputVals(prev => ({ ...prev, [f.id]: e.target.value }));
                    debouncedTextChange[f.id]?.(e);
                  }}
                />
                <i
                  className="fas fa-search position-absolute"
                  style={{ right: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            );
          }
          if (f.type === 'boolean') {
            const boolVal = !!columnFilters.find(cf => cf.id === f.id)?.value;
            if (f.style === 'checkbox') {
              return (
                <div key={f.id} className="form-check form-switch">
                  <input
                    id={`filter-${f.id}`}
                    type="checkbox"
                    role="switch"
                    className="form-check-input"
                    checked={boolVal}
                    onChange={e =>
                      setColumnFilters(
                        e.target.checked
                          ? [...columnFilters.filter(cf => cf.id !== f.id), { id: f.id, value: true }]
                          : columnFilters.filter(cf => cf.id !== f.id)
                      )
                    }
                  />
                  <label className="form-check-label" htmlFor={`filter-${f.id}`}>
                    {f.onLabel}
                  </label>
                </div>
              );
            }
            return (
              <div key={f.id} className="btn-group" role="group">
                <button
                  className={classNames('btn btn-outline-secondary', { active: boolVal })}
                  aria-pressed={boolVal}
                  onClick={() =>
                    setColumnFilters([
                      ...columnFilters.filter(cf => cf.id !== f.id),
                      { id: f.id, value: true },
                    ])
                  }
                >
                  {f.onLabel}
                </button>
                <button
                  className={classNames('btn btn-outline-secondary', { active: !boolVal })}
                  aria-pressed={!boolVal}
                  onClick={() =>
                    setColumnFilters([
                      ...columnFilters.filter(cf => cf.id !== f.id),
                      { id: f.id, value: false },
                    ])
                  }
                >
                  {f.offLabel}
                </button>
              </div>
            );
          }
          return null;
        })}
        {!!columnFilters.length && (
          <button
            className="btn btn-outline-secondary"
            onClick={() => {
              setColumnFilters(defaultFilters);
              const textDefaults: Record<string, string> = {};
              filters.forEach(f => {
                if (f.type === 'text') textDefaults[f.id] = '';
              });
              setTextInputVals(textDefaults);
            }}
          >
            <i className="fas fa-rotate me-2" />
            {translate('table.filters.clear.label')}
          </button>
        )}
      </div>
    );
  };

  // When the table has a leading selection column, its header slot is the
  // "select all" checkbox rendered in renderBulkRow, so we skip it here.
  const renderColumnHeaders = (skipFirst = false) =>
    table
      .getVisibleLeafColumns()
      .slice(skipFirst ? 1 : 0)
      .map(column => (
        <div key={column.id} className={column.columnDef.meta?.className}>
          {column.columnDef.meta?.title}
        </div>
      ));

  const renderBulkRow = () => {
    if (!hasBulkActions) return null;
    return (
      <div className="select-all-row table-row">
        <label className="notification-table-header">
          <input
            type="checkbox"
            className="form-check-input"
            checked={table.getIsAllPageRowsSelected()}
            onChange={e => {
              if (selectAll) setSelectAll(false);
              table.getToggleAllPageRowsSelectedHandler()(e);
            }}
          />
        </label>
        {someSelected && (
          <span>
            {translate({
              key: 'table.rows.selected.count.label',
              plural: (selectAll ? totalSelectable : table.getSelectedRowModel().rows.length) > 1,
              replacements: [
                selectAll
                  ? `${totalSelectable}`
                  : `${table.getSelectedRowModel().rows.length}`,
              ],
            })}
          </span>
        )}
        {someSelected &&
          bulkActions.map((action, i) => (
            <button
              key={i}
              className="ms-2 btn btn-sm btn-outline-secondary"
              onClick={() => handleBulkAction(action)}
            >
              {action.label}
            </button>
          ))}
        {!selectAll &&
          table.getIsAllPageRowsSelected() &&
          table.getSelectedRowModel().rows.length < totalSelectable && (
            <button
              className="btn btn-sm btn-outline-secondary ms-3"
              onClick={() => setSelectAll(true)}
            >
              {translate({
                key: 'table.select.all.label',
                replacements: [totalSelectable.toLocaleString()],
              })}
            </button>
          )}
        {!someSelected && renderColumnHeaders(true)}
      </div>
    );
  };

  return (
    <div className={classNames('flex-grow-1', tableClassName)}>
      <div className="table-header">
        {(toolbar) && (
          <div className="d-flex flex-row justify-content-end align-items-center">
            {toolbar && <div>{toolbar}</div>}
          </div>
        )}
        {renderFilterToolbar()}
        {dataQuery.data && countLabelKey && (
          <div className="mt-2">
            <span className="text-muted small">
              {totalFiltered < total
                ? `${totalFiltered} ${translate({ key: countLabelKey, plural: totalFiltered > 1 })} (sur ${total})`
                : `${totalFiltered} ${translate({ key: countLabelKey, plural: totalFiltered > 1 })}`}
            </span>
          </div>
        )}
      </div>

      {dataQuery.isLoading && <Spinner />}

      {dataQuery.data && (
        <>
          <div className={dataClassName}>
            {hasBulkActions
              ? renderBulkRow()
              : (
                <div className="select-all-row table-row table-header">
                  {renderColumnHeaders()}
                </div>
              )
            }
            <ul className="table-rows">
              {table.getRowModel().rows.map(row => (
                <li key={row.id} tabIndex={-1}>
                  <article className="table-row" aria-label={getRowAriaLabel?.(row.original)}>
                    {row.getVisibleCells().map(cell => (
                      <div key={cell.id} className={cell.column.columnDef.meta?.className}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </article>
                </li>
              ))}
            </ul>
          </div>

          <div className="d-flex align-items-center justify-content-center" style={{ gap: 16 }}>
            <Pagination
              containerClassName="pagination pagination--ds"
              previousLabel="<"
              nextLabel=">"
              breakLabel="..."
              breakClassName="break"
              breakLinkClassName="btn --ghost"
              pageCount={Math.ceil(total / pageSize)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={3}
              onPageChange={({ selected }) => setPage(selected)}
              pageClassName="page-selector"
              pageLinkClassName="btn --ghost"
              previousLinkClassName="btn --tertiary"
              nextLinkClassName="btn --tertiary"
              disabledLinkClassName="--disabled"
              activeClassName="active"
            />
          </div>

          {/* <div className="d-flex justify-content-center mt-3">
            <Pagination
              previousLabel={translate('Previous')}
              nextLabel={translate('Next')}
              breakLabel="..."
              breakClassName="break"
              pageCount={Math.ceil(total / pageSize)}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={data => setPage(data.selected)}
              containerClassName="pagination"
              pageClassName="page-selector"
              forcePage={page}
              activeClassName="active"
            />
          </div> */}
        </>
      )}
    </div>
  );
}
