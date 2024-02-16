import { createColumnHelper } from '@tanstack/react-table';
import classNames from 'classnames';
import moment from 'moment';
import React, { useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IPage } from '..';
import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { Table, TableRef } from '../../inputs';

const CONTENT_TYPES = [
  { value: 'text/html', label: 'HTML' },
  { value: 'text/css', label: 'CSS' },
  { value: 'text/javascript', label: 'JS' },
  { value: 'text/markdown', label: 'MD' },
  { value: 'text/plain', label: 'PLAIN' },
  { value: 'text/xml', label: 'XML' },
  { value: 'application/json', label: 'JSON' },
];

type PagesProps = {
  pages: Array<IPage>,
  removePage: (page: string) => void
}
export const Pages = ({
  pages,
  removePage
}: PagesProps) => {
  const table = useRef<TableRef>()
  const { translate } = useContext(I18nContext);
  const { alert, confirm } = useContext(ModalContext);

  const navigate = useNavigate();

  const columnHelper = createColumnHelper<IPage>();
  const columns = [
    columnHelper.display({
      header: ' ',
      meta: {
        style: {
          textAlign: 'center',
          width: '60px',
        }
      },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const { contentType } = info.row.original;
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
    }),
    columnHelper.accessor('name', {
      header: translate('cms.pages.name'),
      meta: { style: { textAlign: 'left' } },
    }),
    columnHelper.accessor('path', {
      header: translate('cms.pages.path'),
      meta: {
        style: {
          textAlign: 'left',
        }
      },
      cell: (info) =>
        info.getValue() || <span className="badge bg-dark">{translate('cms.pages.block')}</span>
    }),
    columnHelper.accessor(row => row.lastPublishedDate ? moment(row.lastPublishedDate).format(translate('moment.date.format')) : '-', {
      header: translate('cms.pages.publish_date'),
      meta: { style: { textAlign: 'left', width: '200px' } },
      enableColumnFilter: false,
    }),
    columnHelper.display({
      header: 'Actions',
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const value = info.row.original;
        return (
          <div className="d-flex justify-content-center align-items-center">
            <Link
              to={`/settings/pages/edit/${value.id}`}
              onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-outline-primary me-1" >
                <i className="fas fa-pen" />
              </button>
            </Link>
            <Link
              className={classNames({link__disabled: !value.path})}
              to={value.path ? `/_${value.path}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}>
              <button
                className="btn btn-outline-primary me-1"
                disabled={!value.path}
              >
                <i className="fas fa-eye" />
              </button>
            </Link>
            <button
              className="m-1 btn btn-outline-danger"
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
              <i className="fas fa-trash" />
            </button>
          </div>
        );
      },
    }),
  ];

  return (
    <div>
      <Table
        fetchItems={() => pages}
        columns={columns}
        ref={table}
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
