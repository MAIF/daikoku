import React, { useState, useEffect, useMemo } from 'react';
import { useTable, usePagination, useSortBy } from 'react-table';
import classNames from 'classnames';
import _ from 'lodash';
import PropTypes from 'prop-types';

import { t } from '../../locales';
import { Spinner } from '../utils';

export function useForceUpdate() {
  const [, setTick] = useState(0);
  const update = React.useCallback(() => {
    setTick(tick => tick + 1);
  }, []);
  return update;
}

//todo: to upgrade tableWithV§ to tableWithV7:
//todo: - in column prop, rename title, content, cell in Header, accessor, Cell

//todo: implement sorting, search, resize
export const TableWithV7 = ({ fetchItems, columns, injectTopBar, injectTable, currentLanguage, defaultSort, defaultSortDesc, search, pageSizee = 15, mobileSize = 767 }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const forceUpdate = useForceUpdate();


  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize }
  } = useTable(
    {
      columns: useMemo(() => columns, []),
      data: items,
      initialState: { pageIndex: 0 }
    },
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

  // const windowWidth = window.innerWidth;
  // const columnsConst = columns
  //   .filter((c) => {
  //     if (windowWidth > mobileSize) {
  //       return true;
  //     } else {
  //       return !c.noMobile;
  //     }
  //   })
  //   .map((c) => {
  //     return {
  //       Header: c.title,
  //       id: c.title,
  //       headerStyle: c.style,
  //       width: c.style && c.style.width ? c.style.width : undefined,
  //       style: { ...c.style },
  //       sortable: !c.notSortable,
  //       filterable: !c.notFilterable,
  //       accessor: (d) => (c.accessor ? d[c.accessor] : c.content ? c.content(d) : d),
  //       Filter: (d) => (
  //         <input
  //           type="text"
  //           className="form-control input-sm"
  //           value={d.filter ? d.filter.value : ''}
  //           onChange={(e) => d.onChange(e.target.value)}
  //           placeholder={t('Search ...', currentLanguage)}
  //         />
  //       ),
  //       Cell: (r) => {
  //         const value = r.value;
  //         const original = r.original;
  //         return c.cell ? (
  //           c.cell(value, original, this)
  //         ) : (
  //             <div>
  //               {value}
  //             </div>
  //           );
  //       },
  //     };
  //   });

  if (loading) {
    return <Spinner />;
  }

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
                        })} {...column.getHeaderProps(column.getSortByToggleProps())}>
                          {column.render("Header")}
                        </th>
                    ))}
                  </tr>
              ))}
            </thead>
            <tbody {...getTableBodyProps()}>
              {rows.map((row, idx) => {
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

          <div className="text-center py-2">
            <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
              {"<<"}
            </button>{" "}
            <button onClick={() => previousPage()} disabled={!canPreviousPage}>
              {"<"}
            </button>{" "}
            <span className="mx-2">
          Page{" "}
              <strong>
            {pageIndex + 1} of {pageOptions.length}
          </strong>{" "}
        </span>
            <button onClick={() => nextPage()} disabled={!canNextPage}>
              {">"}
            </button>{" "}
            <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
              {">>"}
            </button>{" "}
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
