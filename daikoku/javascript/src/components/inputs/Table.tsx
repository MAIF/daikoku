import React, { useState, useEffect, useMemo, useContext, useImperativeHandle } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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

type Props = {
    columns: any[];
    fetchItems: (...args: any[]) => any;
};

export const Table = React.forwardRef<any, Props>(
  (
    {
      fetchItems,
      columns,
      // @ts-expect-error TS(2339): Property 'injectTopBar' does not exist on type 'Pr... Remove this comment to see the full error message
      injectTopBar,
      // @ts-expect-error TS(2339): Property 'injectTable' does not exist on type 'Pro... Remove this comment to see the full error message
      injectTable,
      // @ts-expect-error TS(2339): Property 'defaultSort' does not exist on type 'Pro... Remove this comment to see the full error message
      defaultSort,
      // @ts-expect-error TS(2339): Property 'defaultSortDesc' does not exist on type ... Remove this comment to see the full error message
      defaultSortDesc,
      // @ts-expect-error TS(2339): Property 'header' does not exist on type 'PropsWit... Remove this comment to see the full error message
      header = true,
      // @ts-expect-error TS(2339): Property 'footer' does not exist on type 'PropsWit... Remove this comment to see the full error message
      footer = true,
      // @ts-expect-error TS(2339): Property 'onSelectRow' does not exist on type 'Pro... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
    const { translateMethod, Translation } = useContext(I18nContext);

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

      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      if (isPromise) {
        return fetchItems().then(
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
      } else {
        setItems(fetchItems());
        setLoading(false);
      }
    };

    useEffect(() => {
      // @ts-expect-error TS(2774): This condition will always return true since this ... Remove this comment to see the full error message
      if (fetchItems) {
        update();
      }
    }, [fetchItems]);

    if (error) {
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <h3>{`Something went wrong: ${(error as any).error}`}</h3>;
    }

    if (loading) {
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div className="d-flex flex-row align-items-center justify-content-end flex-grow-1">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span>
          {rows.length}{' '}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Result" isPlural={rows.length > 1}>
            Results
          </Translation>
        </span>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Select
          className="reactSelect reactSelect-pagination col-3 ms-3 me-3"
          value={{
            label: translateMethod('Show.results', false, `Show ${pageSize}`, pageSize),
            value: pageSize,
          }}
          options={[10, 20, 50, 100].map((x) => ({ label: `Show ${x}`, value: x }))}
          // @ts-expect-error TS(2531): Object is possibly 'null'.
          onChange={(e) => setPageSize(Number(e.value))}
          classNamePrefix="reactSelect"
          styles={customStyles}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Pagination
          containerClassName="pagination"
          previousLabel={translateMethod('<')}
          nextLabel={translateMethod('>')}
          breakLabel={'...'}
          breakClassName={'break'}
          pageCount={pageOptions.length}
          marginPagesDisplayed={1}
          pageRangeDisplayed={5}
          onPageChange={({ selected }) => gotoPage(selected)}
          pageClassName={'page-selector'}
          activeClassName={'active'}
        />
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          type="button"
          className="ms-3 btn btn-sm btn-access-negative float-right"
          title={translateMethod('Reload the table content')}
          onClick={update}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="fas fa-sync-alt" />
        </button>
      </div>
    );

    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="rrow section">
            {header && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className="row" style={{ marginBottom: 10 }}>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-md-12 d-flex">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {injectTopBar && <div style={{ fontSize: 14 }}>{injectTopBar()}</div>}
                  {tablePagination}
                </div>
              </div>
            )}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <table {...getTableProps()} className="reactTableV7">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <thead>
                {headerGroups.map((headerGroup: any, idx: any) => (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <tr key={`thead-tr-${idx}`} {...headerGroup.getHeaderGroupProps()}>
                    {headerGroup.headers.map((column: any, idx: any) => (
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <th
                        key={`thead-th-${idx}`}
                        className={classNames({
                          '--sort-asc': column.isSorted && !column.isSortedDesc,
                          '--sort-desc': column.isSorted && column.isSortedDesc,
                        })}
                        style={column.style}
                      >
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <div {...column.getHeaderProps(column.getSortByToggleProps())}>
                          {column.render('Header')}
                        </div>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <div className="my-2">
                          {column.canFilter ? column.render('Filter') : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <tbody {...getTableBodyProps()}>
                {page.map((row: any, idx: any) => {
                  prepareRow(row);
                  return (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
                          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
