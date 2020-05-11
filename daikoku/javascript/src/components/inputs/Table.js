import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import ReactTable from 'react-table-6';

import {Spinner} from '../utils';
import { t } from '../../locales';

export function useForceUpdate() {
  const [, setTick] = useState(0);
  const update = React.useCallback(() => {
    setTick(tick => tick + 1);
  }, []);
  return update;
}

export const Table = ({ fetchItems, columns, injectTopBar, injectTable, currentLanguage, defaultSort, defaultSortDesc, search, pageSize = 15, mobileSize = 767}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const forceUpdate = useForceUpdate();

  useEffect(() => {
    const sizeListener = _.debounce(() => {
      forceUpdate();
    }, 400);
    window.addEventListener('resize', sizeListener);

    if (injectTable) {
      injectTable({update: () => update()});
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

  const windowWidth = window.innerWidth;
  const columnsConst = columns
    .filter((c) => {
      if (windowWidth > mobileSize) {
        return true;
      } else {
        return !c.noMobile;
      }
    })
    .map((c) => {
      return {
        Header: c.title,
        id: c.title,
        headerStyle: c.style,
        width: c.style && c.style.width ? c.style.width : undefined,
        style: { ...c.style },
        sortable: !c.notSortable,
        filterable: !c.notFilterable,
        accessor: (d) => (c.accessor ? d[c.accessor] : c.content ? c.content(d) : d),
        Filter: (d) => (// eslint-disable-line react/display-name
          <input
            type="text"
            className="form-control input-sm"
            value={d.filter ? d.filter.value : ''}
            onChange={(e) => d.onChange(e.target.value)}
            placeholder={t('Search ...', currentLanguage)}
          />
        ),
        Cell: (r) => {// eslint-disable-line react/display-name
          const value = r.value;
          const original = r.original;
          return c.cell ? (
            c.cell(value, original, this)
          ) : (
              <div>
                {value}
              </div>
            );
        },
      };
    });
    
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
            <div className="rrow">
              <ReactTable
                className="fulltable -striped -highlight"
                previousText={t('Previous', currentLanguage)}
                nextText={t('Next', currentLanguage)}
                noDataText={t('No rows found', currentLanguage)}
                pageText={t('Page', currentLanguage)}
                ofText={t('of', currentLanguage)}
                loadingText={t('loading', currentLanguage)}
                data={items}
                loading={loading}
                filterable={true}
                filterAll={true}
                defaultSorted={[
                  {
                    id: defaultSort || columns[0].title,
                    desc: defaultSortDesc || false,
                  },
                ]}
                defaultFiltered={
                  search
                    ? [{ id: columns[0].title, value: search }]
                    : []
                }
                defaultPageSize={pageSize}
                columns={columnsConst}
                LoadingComponent={Spinner}
                defaultFilterMethod={(filter, row) => {
                  const id = filter.pivotId || filter.id;
                  if (row[id] !== undefined) {
                    const value = String(row[id]);
                    return value.toLowerCase().indexOf(filter.value.toLowerCase()) > -1;
                  } else {
                    return true;
                  }
                }}
              />
            </div>
          </div>
      </div>
    );
};

Table.propTypes = {
  columns: PropTypes.array.isRequired,
  fetchItems: PropTypes.func.isRequired,
};
