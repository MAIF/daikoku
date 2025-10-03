import classNames from 'classnames';
import React, { ReactNode, useContext, useEffect, useState } from 'react';
import Pagination from 'react-paginate';
import { I18nContext } from '../../contexts/i18n-context';

type Props<T> = {
  items: T[];
  formatter: (...args: T[]) => ReactNode | undefined;
  count?: number;
  columnMode?: boolean;
  reverse?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  breakLabel?: string;
  help?: any
};

export const PaginatedComponent = <T extends object>(props: Props<T>) => {
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);

  const { translate } = useContext(I18nContext);

  const pageNumber = props.count || 10;

  useEffect(() => {
    setOffset(selectedPage * pageNumber);
  }, [selectedPage]);

  const handlePageClick = (data: any) => {
    setSelectedPage(data.selected);
  };

  const pagedItems = props.items.slice(offset, offset + pageNumber);

  return (<div className="section">
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
        <Pagination previousLabel={props.previousLabel || translate('Previous')} nextLabel={props.nextLabel || translate('Next')} breakLabel={props.breakLabel || '...'} breakClassName={'break'} pageCount={Math.ceil(props.items.length / pageNumber)} marginPagesDisplayed={1} pageRangeDisplayed={5} onPageChange={(data) => handlePageClick(data)} containerClassName={'pagination'} pageClassName={'page-selector'} forcePage={selectedPage} activeClassName={'active'} />
      </div>
    </div>
  </div>);
};
