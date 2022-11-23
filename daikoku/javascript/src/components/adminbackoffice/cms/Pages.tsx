import moment from 'moment';
import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ModalContext } from '../../../contexts';
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
  const { translate } = useContext(I18nContext);
  const { alert, confirm } = useContext(ModalContext);

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
          <img
            style={{ width: '24px' }}
            src={`/assets/file-icons/${item?.value
              .replace('text/', '')
              .replace('application/', '')}.svg`}
          />
        );
      },
    },
    {
      Header: translate('cms.pages.name'),
      style: { textAlign: 'left' },
      accessor: (item: any) => item.name,
    },
    {
      Header: translate('cms.pages.path'),
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
          <span className="badge bg-dark">{translate('cms.pages.block')}</span>
        ),
    },
    {
      Header: translate('cms.pages.publish_date'),
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
          <div className="d-flex justify-content-center">
            <Link
              to={`/_${value.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="m-1"
              onClick={(e) => e.stopPropagation()}
            >
              <i className="fas fa-eye" style={{ color: '#000' }} />
            </Link>
            <button
              className="m-1"
              style={{
                border: 'none',
                background: 'none',
              }}
              onClick={(e) => {
                e.stopPropagation();
                (confirm({ message: translate('cms.pages.remove_confirm') }))
                  .then((ok) => {
                    if (ok) {
                      Services.removeCmsPage(value.id).then((res) => {
                        if (res.error)
                          alert({ message: res.error });
                        else
                          removePage(value.id);
                      });
                    }
                  });
              }}
            >
              <i className="fas fa-trash" style={{ color: 'var(--danger-color, #dc3545)' }} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <Table
        fetchItems={() => pages}
        columns={columns}
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
