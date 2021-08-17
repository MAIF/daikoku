import React, { useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import Pagination from 'react-paginate';
import classNames from 'classnames';
import { I18nContext } from '../../core/i18n-context';

export const PaginatedComponent = (props) => {
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);

  const { translateMethod } = useContext(I18nContext)

  const pageNumber = props.count || 10;

  useEffect(() => {
    setOffset(selectedPage * pageNumber);
  }, [selectedPage]);

  const handlePageClick = (data) => {
    setSelectedPage(data.selected);
  };

  const pagedItems = props.items.slice(offset, offset + pageNumber);

  return (
    <div className="section p-2">
      <div className="flex-column">
        {props.help && (
          <i
            className="far fa-question-circle ml-1 cursor-pointer"
            style={{ fontSize: '20px' }}
            onClick={() => props.help()}
          />
        )}
        <div
          className={classNames('d-flex flex-wrap', {
            'flex-wrap': props.wrap,
            'flex-column': props.columnMode,
            'flex-column-reverse': props.columnMode && props.reverse,
            'flex-row': !props.columnMode,
            'flex-row-reverse': !props.columnMode && props.reverse,
          })}>
          {pagedItems.map((item) => {
            if (React.isValidElement(item)) {
              return item;
            }

            return props.formatter(item);
          })}
        </div>
        <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
          <Pagination
            previousLabel={props.previousLabel || translateMethod('Previous')}
            nextLabel={props.nextLabel || translateMethod('Next')}
            breakLabel={props.breakLabel || '...'}
            breakClassName={'break'}
            pageCount={Math.ceil(props.items.length / pageNumber)}
            marginPagesDisplayed={1}
            pageRangeDisplayed={5}
            onPageChange={(data) => handlePageClick(data)}
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
  breakLabel: PropTypes.string
};
