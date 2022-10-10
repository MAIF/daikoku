//@ts-nocheck //FIXME: typescript better with react-table ;)
import React, { useState, useEffect, useMemo, useContext, useImperativeHandle } from 'react';
import { useTable, usePagination, useSortBy, useFilters } from 'react-table';
import classNames from 'classnames';
import debounce from 'lodash/debounce';
import Pagination from 'react-paginate';
import Select from 'react-select';

import { Spinner } from '../utils';
import { DefaultColumnFilter } from '.';
import { I18nContext } from '../../core';

export function useForceUpdate() {
  const [, setTick] = useState(0);
  const update = React.useCallback(() => {
    setTick((tick) => tick + 1);
  }, []);
  return update;
}
export type TableRef = { update: () => void}
type Props = {
  columns: any[];
  fetchItems?: (...args: any[]) => any;
  injectTopBar?: () => JSX.Element,
  injectTable?: (...args: any[]) => void,
  defaultSort?: any,
  defaultSortDesc?: any,
  header?: boolean,
  footer?: boolean,
  onSelectRow?: any,
};

export const Table = React.forwardRef<any, Props>(
  (
    {
      fetchItems,
      columns,
      injectTopBar,
      injectTable,
      defaultSort,
      defaultSortDesc,
      header = true,
      footer = true,
      onSelectRow = undefined,
    },
    ref
  ) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(undefined);
    const forceUpdate = useForceUpdate();

    useImperativeHandle(ref, () => ({
      update() {
        update();
      },
    }));

    const { translate, Translation } = useContext(I18nContext);

    const filterTypes = React.useMemo(
      () => ({
        // "startWith"
        text: (rows: any, id: any, filterValue: any) => {
          return rows.filter((row: any) => {
            const rowValue = row.values[id];
            return rowValue !== undefined
              ? String(rowValue).toLowerCase().startsWith(String(filterValue).toLowerCase())
              : true;
          });
        },
      }),
      []
    );
    const EditableCell = ({
      value: initialValue,
      row: { index },
      column: { id },

      // This is a custom function that we supplied to our table instance
      updateMyData,

      editable
    }: any) => {
      // We need to keep and update the state of the cell normally
      const [value, setValue] = React.useState(initialValue);

      const onChange = (e: any) => {
        setValue(e.target.value);
      };

      // We'll only update the external data when the input is blurred
      const onBlur = () => {
        updateMyData(index, id, value);
      };

      // If the initialValue is changed externall, sync it up with our state
      React.useEffect(() => {
        setValue(initialValue);
      }, [initialValue]);

      if (!editable) {
        return `${initialValue}`;
      }

      return <input value={value} onChange={onChange} onBlur={onBlur} />;
    };
    const defaultColumn = React.useMemo(
      () => ({
        // Let's set up our default Filter UI
        Filter: DefaultColumnFilter,
        // And also our default editable cell
        Cell: EditableCell,
      }),
      []
    );

    const {
      getTableProps,
      getTableBodyProps,
      headerGroups,
      rows,
      prepareRow,
      page,
      pageOptions,
      gotoPage,
      setPageSize,
      state: { pageSize },
    } = useTable(
      {
        columns,
        data: items,
        defaultColumn,
        filterTypes,
        initialState: {
          pageSize: 10,
          pageIndex: 0,
          sortBy: useMemo(
            () => [
              {
                id: defaultSort || columns[0].title,
                desc: defaultSortDesc || false,
              },
            ],
            []
          ),
        },
      },
      useFilters,
      useSortBy,
      usePagination
    );

    useEffect(() => {
      const sizeListener = debounce(() => {
        forceUpdate();
      }, 400);
      window.addEventListener('resize', sizeListener);

      if (injectTable) {
        injectTable({ update: () => update() });
      }

      update();

      return () => {
        window.removeEventListener('resize', sizeListener);
      };
    }, []);

    useEffect(() => {
      if (error) {
        setLoading(false);
      }
    }, [error]);

    useEffect(() => {
      setError(undefined);
    }, [items]);

    const update = () => {
      setLoading(true);
      const isPromise = Boolean(fetchItems && typeof fetchItems().then === 'function');
      if (isPromise && fetchItems) {
        return fetchItems()
          .then(
            (rawItems: any) => {
              if (rawItems.error) {
                setError(rawItems);
              } else {
                setItems(rawItems);
                setLoading(false);
              }
            },
            (e: any) => setError(e)
          );
      } else if (fetchItems) {
        setItems(fetchItems());
        setLoading(false);
      } else {
        setLoading(false)
      }
    };

    useEffect(() => {
      if (fetchItems) {
        update();
      }
    }, [fetchItems]);

    if (error) {
      return <h3>{`Something went wrong: ${(error as any).error}`}</h3>;
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

    const tablePagination = (
      <div className="d-flex flex-row align-items-center justify-content-end flex-grow-1">
        <span>
          {rows.length}{' '}
          <Translation i18nkey="Result" isPlural={rows.length > 1}>
            Results
          </Translation>
        </span>
        <Select
          className="reactSelect reactSelect-pagination col-3 ms-3 me-3"
          value={{
            label: translate({key: 'Show.results', replacements: [pageSize]}),
            value: pageSize,
          }}
          options={[10, 20, 50, 100].map((x) => ({ label: `Show ${x}`, value: x }))}
          onChange={(e: any) => setPageSize(Number(e.value))}
          classNamePrefix="reactSelect"
          styles={customStyles}
        />
        <Pagination
          containerClassName="pagination"
          previousLabel={translate('<')}
          nextLabel={translate('>')}
          breakLabel={'...'}
          breakClassName={'break'}
          pageCount={pageOptions.length}
          marginPagesDisplayed={1}
          pageRangeDisplayed={5}
          onPageChange={({ selected }) => gotoPage(selected)}
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
    );

    return (
      <div>
        <div>
          <div className="rrow section">
            {header && (
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="col-md-12 d-flex">
                  {injectTopBar && <div style={{ fontSize: 14 }}>{injectTopBar()}</div>}
                  {tablePagination}
                </div>
              </div>
            )}
            <table {...getTableProps()} className="reactTableV7">
              <thead>
                {headerGroups.map((headerGroup: any, idx: any) => (
                  <tr key={`thead-tr-${idx}`} {...headerGroup.getHeaderGroupProps()}>
                    {headerGroup.headers.map((column: any, idx: any) => (
                      <th
                        key={`thead-th-${idx}`}
                        className={classNames({
                          '--sort-asc': column.isSorted && !column.isSortedDesc,
                          '--sort-desc': column.isSorted && column.isSortedDesc,
                        })}
                        style={column.style}
                      >
                        <div {...column.getHeaderProps(column.getSortByToggleProps())}>
                          {column.render('Header')}
                        </div>
                        <div className="my-2">
                          {column.canFilter ? column.render('Filter') : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody {...getTableBodyProps()}>
                {page.map((row: any, idx: any) => {
                  prepareRow(row);
                  return (
                    <tr
                      {...row.getRowProps()}
                      key={`tr-${idx}`}
                      onClick={() => {
                        if (onSelectRow) onSelectRow(row);
                      }}
                      style={{
                        cursor: onSelectRow ? 'pointer' : 'inherit',
                      }}
                    >
                      {row.cells.map((cell: any, idx: any) => {
                        return (
                          <td style={cell.column.style} {...cell.getCellProps()} key={`td-${idx}`}>
                            {cell.render('Cell')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {footer && tablePagination}
          </div>
        </div>
      </div>
    );
  }
);