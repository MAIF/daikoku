import React, { useState, useEffect, useContext } from 'react';
import Pagination from 'react-paginate';
import classNames from 'classnames';
import { I18nContext } from '../../locales/i18n-context';

type Props = {
  items: any[];
  formatter: (...args: any[]) => any;
  count?: number;
  columnMode?: boolean;
  reverse?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  breakLabel?: string;
  help?: any
};

export const PaginatedComponent = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);

  const { translateMethod } = useContext(I18nContext);

  const pageNumber = props.count || 10;

  useEffect(() => {
    setOffset(selectedPage * pageNumber);
  }, [selectedPage]);

  const handlePageClick = (data: any) => {
    setSelectedPage(data.selected);
  };

  const pagedItems = props.items.slice(offset, offset + pageNumber);

  return (<div className="section p-2">
    <div className="flex-column">
      {(props as any).help && (<i className="far fa-question-circle ms-1 cursor-pointer" style={{ fontSize: '20px' }} onClick={() => (props as any).help()} />)}
      <div className={classNames('d-flex flex-wrap', {
        'flex-wrap': (props as any).wrap,
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
        <Pagination previousLabel={props.previousLabel || translateMethod('Previous')} nextLabel={props.nextLabel || translateMethod('Next')} breakLabel={props.breakLabel || '...'} breakClassName={'break'} pageCount={Math.ceil(props.items.length / pageNumber)} marginPagesDisplayed={1} pageRangeDisplayed={5} onPageChange={(data) => handlePageClick(data)} containerClassName={'pagination'} pageClassName={'page-selector'} forcePage={selectedPage} activeClassName={'active'} />
      </div>
    </div>
  </div>);
};
