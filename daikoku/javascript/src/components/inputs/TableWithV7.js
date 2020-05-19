import React, { useState, useEffect, useMemo } from 'react';
import { useTable, usePagination, useSortBy, useFilters } from 'react-table';
import classNames from 'classnames';
import _ from 'lodash';
import PropTypes from 'prop-types';
import Pagination from 'react-paginate';
import Select from 'react-select';

import { t } from '../../locales';
import { Spinner } from '../utils';
import {fuzzyTextFilterFn, DefaultColumnFilter} from './'

export function useForceUpdate() {
  const [, setTick] = useState(0);
  const update = React.useCallback(() => {
    setTick(tick => tick + 1);
  }, []);
  return update;
}

export const TableWithV7 = ({ fetchItems, columns, injectTopBar, injectTable, defaultSort, defaultSortDesc, search, pageSizee = 15, mobileSize = 767, currentLanguage }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const forceUpdate = useForceUpdate();

  const filterTypes = React.useMemo(
    () => ({
      // Add a new fuzzyTextFilterFn filter type.
      fuzzyText: fuzzyTextFilterFn,
      // Or, override the default text filter to use
      // "startWith"
      text: (rows, id, filterValue) => {
        return rows.filter(row => {
          const rowValue = row.values[id]
          return rowValue !== undefined
            ? String(rowValue)
              .toLowerCase()
              .startsWith(String(filterValue).toLowerCase())
            : true
        })
      },
    }),
    []
  )
  const EditableCell = ({
    value: initialValue,
    row: { index },
    column: { id },
    updateMyData, // This is a custom function that we supplied to our table instance
    editable,
  }) => {
    // We need to keep and update the state of the cell normally
    const [value, setValue] = React.useState(initialValue)

    const onChange = e => {
      setValue(e.target.value)
    }

    // We'll only update the external data when the input is blurred
    const onBlur = () => {
      updateMyData(index, id, value)
    }

    // If the initialValue is changed externall, sync it up with our state
    React.useEffect(() => {
      setValue(initialValue)
    }, [initialValue])

    if (!editable) {
      return `${initialValue}`
    }

    return <input value={value} onChange={onChange} onBlur={onBlur} />
  }
  const defaultColumn = React.useMemo(
    () => ({
      // Let's set up our default Filter UI
      Filter: DefaultColumnFilter,
      // And also our default editable cell
      Cell: EditableCell,
    }),
    []
  )


  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    setFilter,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize, sortBy, filters }
  } = useTable(
    {
      columns: useMemo(() => columns, []),
      data: items,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 2,
        pageIndex: 0,
        sortBy: useMemo(() => [
          {
            id: defaultSort || columns[0].title,
            desc: defaultSortDesc || false,
          },
        ], [])}
    },
    useFilters,
    useSortBy,
    usePagination,
  );

  useEffect(() => {
    const sizeListener = _.debounce(() => {
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
    if (hasError) {
      setLoading(false);
    }
  }, [hasError]);

  useEffect(() => {
    setLoading(false);
  }, [items]);

  const update = () => {
    setLoading(true);
    return fetchItems()
      .then(
        (rawItems) => {
          setItems(rawItems);
        },
        () => setHasError(true));
  };

  if (hasError) {
    return <h3>Something went wrong !!!</h3>;
  }

  if (loading) {
    return <Spinner />;
  }

  const customStyles = {
    control: base => ({
      ...base,
      height: 30,
      minHeight: 30
    })
  };

  return (
    <div>
      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="col-md-12">
            <button
              type="button"
              className="btn btn-sm btn-access-negative float-right"
              title={t('Reload the table content', currentLanguage)}
              onClick={update}>
              <span className="fas fa-sync-alt" />
            </button>
            {injectTopBar && (
              <div style={{ fontSize: 14 }}>{injectTopBar()}</div>
            )}
          </div>
        </div>
        <div className="rrow section">
          <table {...getTableProps()} className="reactTableV7">
            <thead>
              {headerGroups.map(headerGroup => (
                  <tr {...headerGroup.getHeaderGroupProps()}>
                    {headerGroup.headers.map(column => (
                        <th className={classNames({
                          "--sort-asc": column.isSorted && !column.isSortedDesc,
                          "--sort-desc": column.isSorted && column.isSortedDesc
                        })}>
                        <div {...column.getHeaderProps(column.getSortByToggleProps())}>{column.render("Header")}</div>
                          <div className="my-2">{column.canFilter ? column.render('Filter') : null}</div>
                        </th>
                    ))}
                  </tr>
              ))}
            </thead>
            <tbody {...getTableBodyProps()}>
              {page.map((row, idx) => {
                prepareRow(row);
                return (
                  <tr {...row.getRowProps()} key={`tr-${idx}`}>
                    {row.cells.map((cell, idx) => {
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

          <div className="d-flex flex-row align-items-baseline justify-content-end mr-3">
            <span>XXX results</span>
            <span className="ml-4">Show :</span>
            <Select
                className="reactSelect col-1 mr-3"
                value={{ label: pageSize, value: pageSize }}
                options={[2, 10, 20, 50, 100].map(x => ({ label:  `${x}`, value: x }))} //todo: remove "2" option aafter tests
              onChange={(e) => setPageSize(Number(e.value))}
              classNamePrefix="reactSelect"
                styles={customStyles}
            />
            <Pagination
              containerClassName="col-9"
              previousLabel={t('<', currentLanguage)}
              nextLabel={t('>', currentLanguage)}
              breakLabel={'...'}
              breakClassName={'break'}
              pageCount={pageOptions.length}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={({ selected }) => gotoPage(selected)}
              containerClassName={'pagination'}
              pageClassName={'page-selector'}
              activeClassName={'active'}
            />

            
          </div>
          
        </div>
        </div>
      </div>
  );
};

TableWithV7.propTypes = {
  columns: PropTypes.array.isRequired,
  fetchItems: PropTypes.func.isRequired,
};
