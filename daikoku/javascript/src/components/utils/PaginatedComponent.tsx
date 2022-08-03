import React, { useState, useEffect, useContext } from 'react';
import Pagination from 'react-paginate';
import classNames from 'classnames';
// @ts-expect-error TS(6142): Module '../../locales/i18n-context' was resolved t... Remove this comment to see the full error message
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
};

export const PaginatedComponent = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState(0);
  const [offset, setOffset] = useState(0);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const pageNumber = props.count || 10;

  useEffect(() => {
    setOffset(selectedPage * pageNumber);
  }, [selectedPage]);

  const handlePageClick = (data: any) => {
    setSelectedPage(data.selected);
  };

  const pagedItems = props.items.slice(offset, offset + pageNumber);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div className="section p-2">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="flex-column">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {(props as any).help && (<i className="far fa-question-circle ms-1 cursor-pointer" style={{ fontSize: '20px' }} onClick={() => (props as any).help()}/>)}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="apis__pagination d-flex justify-content-center" style={{ width: '100%' }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Pagination previousLabel={props.previousLabel || translateMethod('Previous')} nextLabel={props.nextLabel || translateMethod('Next')} breakLabel={props.breakLabel || '...'} breakClassName={'break'} pageCount={Math.ceil(props.items.length / pageNumber)} marginPagesDisplayed={1} pageRangeDisplayed={5} onPageChange={(data) => handlePageClick(data)} containerClassName={'pagination'} pageClassName={'page-selector'} forcePage={selectedPage} activeClassName={'active'}/>
        </div>
      </div>
    </div>);
};
