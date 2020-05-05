import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Pagination from 'react-paginate';
import classNames from 'classnames';
import { t } from '../../locales';

export const PaginatedComponent = (props) => {

  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);

  const pageNumber = props.count || 10;

  useEffect(() => {
    setOffset(selectedPage * pageNumber);
  }, [selectedPage]);


  const handlePageClick = data => {
    setSelectedPage(data.selected);
  };

  const pagedItems = props.items.slice(
    offset,
    offset + pageNumber
  );

  return (
    <div className="section p-2">
      <div className="row flex-column">
        <div
          className={classNames('d-flex flex-wrap', {
            'flex-wrap': props.wrap,
            'flex-column': props.columnMode,
            'flex-column-reverse': props.columnMode && props.reverse,
            'flex-row': !props.columnMode,
            'flex-row-reverse': !props.columnMode && props.reverse,
          })}>
          {pagedItems.map(item => {
            if (React.isValidElement(item)) {
              return item;
            }

            return props.formatter(item);
          })}
        </div>
        <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
          <Pagination
            previousLabel={props.previousLabel || t('Previous', props.currentLanguage)}
            nextLabel={props.nextLabel || t('Next', props.currentLanguage)}
            breakLabel={props.breakLabel || '...'}
            breakClassName={'break'}
            pageCount={Math.ceil(props.items.length / pageNumber)}
            marginPagesDisplayed={1}
            pageRangeDisplayed={5}
            onPageChange={data => handlePageClick(data)}
            containerClassName={'pagination'}
            pageClassName={'page-selector'}
            forcePage={selectedPage}
            activeClassName={'active'}
          />
        </div>
      </div>
    </div>
  );
};

PaginatedComponent.propTypes = {
  items: PropTypes.array.isRequired,
  formatter: PropTypes.func.isRequired,
  count: PropTypes.number,
  columnMode: PropTypes.bool,
  reverse: PropTypes.bool,
  previousLabel: PropTypes.string,
  nextLabel: PropTypes.string,
  breakLabel: PropTypes.string,
  currentLanguage: PropTypes.string,
};
