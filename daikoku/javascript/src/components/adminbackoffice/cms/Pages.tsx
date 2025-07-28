import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ModalContext } from '../../../contexts';
import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { Table, TableRef } from '../../inputs';
import { CONTENT_TYPES } from './cmsUtils';
import { ICmsPageGQL } from '../../../types';

type PagesProps = {
  pages: Array<ICmsPageGQL>
  reload: any
}

export const Pages = ({
  pages,
  reload
}: PagesProps) => {
  const table = useRef<TableRef>()
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    if (table.current)
      //@ts-ignore
      table.current.setPageSize(500)
  }, [table])

  const { confirm, alert } = useContext(ModalContext);

  const navigate = useNavigate();

  const columnHelper = createColumnHelper<ICmsPageGQL>();
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
    columnHelper.display({
      header: 'Actions',
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const value = info.row.original;

        const itemPath = value.path ? (value.path.startsWith('/') ? `/_${value.path}` : `/_/${value.path}`) : '#'

        return (
          <div className="d-flex align-items-center justify-content-center">
            <Link
              to={`/settings/pages/${value.id}`}
              onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-outline-info btn-sm me-1">
                <i className="fas fa-pen" />
              </button>
            </Link>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger me-1"
              title={translate('Delete page')}
              onClick={e => {
                e.stopPropagation();
                confirm({ message: translate('Delete page') })
                  .then((ok) => {
                    if (ok) {
                      Services.removeCmsPage(value.id).then((res) => {
                        if (res.error)
                          alert({ message: res });
                        else {
                          reload()
                        }
                      });
                    }
                  });
              }}
            >
              <i className="fas fa-trash" />
            </button>
            {value.path && <Link
              to={itemPath}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}>
              <button
                className="btn btn-outline-info btn-sm me-1"
              >
                <i className="fas fa-eye" />
              </button>
            </Link>}
          </div>
        );
      },
    }),
  ];

  return (
    <div>
      <Table
        ref={table}
        columns={columns}
        className="reactTableV7--small"
        defaultSort="path"
        defaultSortDesc={true}
        header={false}
        fetchItems={() => pages}
        noPagination
        onSelectRow={(row: any) => {
          if (row.original) navigate(`edit/${row.original.id}`);
        }}
      />
    </div>
  );
};
