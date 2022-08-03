import moment from 'moment';
import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { Table } from '../../inputs';

const CONTENT_TYPES = [
  { value: 'text/html', label: 'HTML' },
  { value: 'text/css', label: 'CSS' },
  { value: 'text/javascript', label: 'JS' },
  { value: 'text/markdown', label: 'MD' },
  { value: 'text/plain', label: 'PLAIN' },
  { value: 'text/xml', label: 'XML' },
  { value: 'application/json', label: 'JSON' },
];

export const Pages = ({
  pages,
  removePage
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const navigate = useNavigate();

  let table;

  const columns = [
    {
      Header: ' ',
      style: {
        textAlign: 'center',
        maxWidth: 60,
      },
      disableFilters: true,
      accessor: (item: any) => item.contentType,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const { contentType } = original;
        const item = CONTENT_TYPES.find((f) => f.value === contentType);
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <img
            style={{ width: '24px' }}
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            src={`/assets/file-icons/${item.value
              .replace('text/', '')
              .replace('application/', '')}.svg`}
          />
        );
      },
    },
    {
      Header: translateMethod('cms.pages.name'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.name,
    },
    {
      Header: translateMethod('cms.pages.path'),
      style: {
        textAlign: 'left',
        fontStyle: 'italic',
      },
      accessor: (item: any) => item.path,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) =>
        original.path || (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <span className="badge bg-dark">{translateMethod('cms.pages.block')}</span>
        ),
    },
    {
      Header: translateMethod('cms.pages.publish_date'),
      style: { textAlign: 'left', maxWidth: 220 },
      disableFilters: true,
      accessor: (item: any) => item.lastPublishedDate ? moment(item.lastPublishedDate).format('DD MMM (HH:mm)') : '-',
    },
    {
      Header: 'Actions',
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item: any) => item._id,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        const value = original;
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex justify-content-center">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link
              to={`/_${value.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="m-1"
              onClick={(e) => e.stopPropagation()}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-eye" style={{ color: '#000' }} />
            </Link>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              className="m-1"
              style={{
                border: 'none',
                background: 'none',
              }}
              onClick={(e) => {
                e.stopPropagation();
                (window.confirm(translateMethod('cms.pages.remove_confirm')) as any).then((ok: any) => {
    if (ok) {
        Services.removeCmsPage(value.id).then((res) => {
            if (res.error)
                window.alert(res.error);
            else
                removePage(value.id);
        });
    }
});
              }}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-trash" style={{ color: 'var(--danger-color, #dc3545)' }} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Table
        // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
        selfUrl="pages"
        defaultTitle="Pages"
        defaultValue={pages}
        fetchItems={() => pages}
        itemName="page"
        columns={columns}
        showActions={false}
        showLink={false}
        extractKey={(item: any) => item.id}
        injectTable={(t: any) => table = t}
        defaultSort="path"
        defaultSortDesc={true}
        header={false}
        onSelectRow={(row: any) => {
          if (row.original) navigate(`edit/${row.original.id}`);
        }}
      />
    </div>
  );
};
