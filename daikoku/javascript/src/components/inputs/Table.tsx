import React, { useState, useEffect, useContext, useImperativeHandle, MutableRefObject } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
  Column,
  Table as ReactTable,
  ColumnFiltersState,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues
} from '@tanstack/react-table';
import classNames from 'classnames';
import Pagination from 'react-paginate';
import Select from 'react-select';

import { Spinner } from '../utils';
import { I18nContext } from '../../core';
import { isError, isPromise, ResponseError } from '../../types';

export function useForceUpdate() {
  const [, setTick] = useState(0);
  const update = React.useCallback(() => {
    setTick((tick) => tick + 1);
  }, []);
  return update;
}
export type TableRef = { update: () => void }

type MetaStyle = {
  style: {
    textAlign?: 'left' | 'center' | 'right'
    width?: string
  }
}

type TableProps<T> = {
  columns: ColumnDef<T, any>[];
  fetchItems: () => Array<T> | Promise<Array<T> | ResponseError>;
  injectTopBar?: () => JSX.Element,
  injectTable?: (ref: TableRef) => void,
  defaultSort?: string,
  defaultSortDesc?: boolean,
  header?: boolean,
  footer?: boolean,
  onSelectRow?: (row: any) => void,
  ref?: MutableRefObject<TableRef | undefined>
};

const TableComponent = <T extends unknown>(props: TableProps<T>, ref: React.Ref<TableRef>) => {
  const [items, setItems] = useState<Array<T>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  )

  useImperativeHandle(ref, () => ({
    update() {
      update();
    },
  }));

  const { translate } = useContext(I18nContext);

  const table = useReactTable({
    data: items,
    columns: props.columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: {
      columnFilters
    },
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });


  // useEffect(() => {
  //   const sizeListener = debounce(() => {
  //     forceUpdate();
  //   }, 400);
  //   window.addEventListener('resize', sizeListener);

  //   if (injectTable) {
  //     injectTable({ update: () => update() });
  //   }

  //   update();

  //   return () => {
  //     window.removeEventListener('resize', sizeListener);
  //   };
  // }, []);

  // useEffect(() => {
  //   if (error) {
  //     setLoading(false);
  //   }
  // }, [error]);

  // useEffect(() => {
  //   setError(undefined);
  // }, [items]);

  const update = () => {
    setLoading(true);
    const resp = props.fetchItems()

    if (isPromise(resp)) {
      return resp
        .then(
          (rawItems) => {
            if (isError(rawItems)) {
              setError(rawItems.error);
            } else {
              setItems([...rawItems]);
              setLoading(false);
            }
          }
        );
    } else {
      setItems(resp);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (items.length === 0) {
      update();
    }
  }, []);

  if (error) {
    return <h3>{`Something went wrong: ${error}`}</h3>;
  }

  if (loading) {
    return <Spinner />;
  }

  const customStyles = {
    control: (base: any) => ({
      ...base,
      height: 30,
      minHeight: 30
    }),
  };

  const tablePagination =
    <div className="d-flex flex-row align-items-center justify-content-end flex-grow-1">
      <span>
        {`${table.getPrePaginationRowModel().rows.length} ${translate({ key: 'Result', plural: table.getPrePaginationRowModel().rows.length > 1 })}`}
      </span>
      <Select
        className="reactSelect reactSelect-pagination col-3 ms-3 me-3"
        value={{
          label: translate({ key: 'Show.results', replacements: [table.getState().pagination.pageSize.toLocaleString()] }),
          value: table.getState().pagination.pageSize,
        }}
        options={[10, 20, 50, 100].map((x) => ({ label: translate({ key: 'Show.results', replacements: [`${x}`] }), value: x }))}
        onChange={(value) => table.setPageSize(Number(value?.value || 10))}
        classNamePrefix="reactSelect"
        styles={customStyles}
      />
      <Pagination
        containerClassName="pagination"
        previousLabel={translate('<')}
        nextLabel={translate('>')}
        breakLabel={'...'}
        breakClassName={'break'}
        pageCount={table.getPageCount()}
        marginPagesDisplayed={1}
        pageRangeDisplayed={5}
        onPageChange={({ selected }) => table.setPageIndex(selected)}
        pageClassName={'page-selector'}
        activeClassName={'active'}
      />
      <button
        type="button"
        className="ms-3 btn btn-sm btn-access-negative float-right"
        title={translate('Reload the table content')}
        onClick={update}
      >
        <span className="fas fa-sync-alt" />
      </button>
    </div>

  return (
    <div>
      <div>
        <div className="rrow section">
          {props.injectTopBar && (
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="col-md-12 d-flex">
                {<div style={{ fontSize: 14 }}>{props.injectTopBar()}</div>}
              </div>
            </div>
          )}
          <table className="reactTableV7">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={`${headerGroup.id}`}>
                  {headerGroup.headers.map((header) => {
                    const style = (header.column.columnDef.meta as MetaStyle)?.style

                    return (<th
                      key={header.id}
                      style={{ textAlign: style?.textAlign || 'left', width: style?.width || 'auto' }}
                      className={classNames({
                        '--sort-asc': header.column.getIsSorted() === 'asc',
                        '--sort-desc': header.column.getIsSorted() === 'desc',
                      })}>
                      <div
                        className={classNames({ 'cursor-pointer': header.column.getCanSort() })}
                        onClick={header.column.getToggleSortingHandler()}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      </div>
                      {header.column.getCanFilter() ? (
                        <div className='my-2'>
                          <Filter column={header.column} table={table} />
                        </div>
                      ) : null}
                    </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const style = (cell.column.columnDef.meta as MetaStyle)?.style
                    return (
                      <td key={cell.id}
                        style={{ textAlign: style?.textAlign || 'left', width: style?.width || 'auto' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {tablePagination}
        </div>
      </div>
    </div>
  );
}

function Filter({
  column,
  table
}: {
  column: Column<any, any>;
  table: ReactTable<any>;
}) {
  const { translate } = useContext(I18nContext);

  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();

  return typeof firstValue === "number" ? (
    <div className="flex space-x-2">
      <input
        type="number"
        value={(columnFilterValue as [number, number])?.[0] ?? ""}
        onChange={(e) =>
          column.setFilterValue((old: [number, number]) => [
            e.target.value,
            old?.[1]
          ])
        }
        placeholder={`Min`}
        className="form-control form-control-sm"
      />
      <input
        type="number"
        value={(columnFilterValue as [number, number])?.[1] ?? ""}
        onChange={(e) =>
          column.setFilterValue((old: [number, number]) => [
            old?.[0],
            e.target.value
          ])
        }
        placeholder={`Max`}
        className="form-control form-control-sm"
      />
    </div>
  ) : (
    <input
      type="text"
      value={(columnFilterValue ?? "") as string}
      onChange={(e) => column.setFilterValue(e.target.value)}
      placeholder={translate('Search')}
      className="form-control form-control-sm"
    />
  );
}

export const Table = React.forwardRef(TableComponent) as <T, >(props: TableProps<T>, ref?: React.Ref<TableRef>) => React.ReactElement

