import { format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Code, Eye, Trash2 } from 'lucide-react';
import { useContext } from 'react';
import { Link } from 'react-router-dom';

import { I18nContext, ModalContext, useTenantBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { ICmsPageGQL } from '../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import { Can, manage, tenant } from '../../utils';

export const CMSOffice = () => {
  useTenantBackOffice();

  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const { confirm, alert, openFormModal } = useContext(ModalContext);

  const queryClient = useQueryClient();
  const queryKey = ['cms-pages'];

  const fetchData = clientFetchData<ICmsPageGQL>(
    () =>
      customGraphQLClient
        .request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
        .then((r) => r.pages),
    { searchable: (page) => [page.name, page.path] }
  );

  // The list query doesn't carry the page body, so it is fetched on demand and
  // shown in a read-only form modal — the content is generated, never edited
  // from here.
  const showContent = (page: ICmsPageGQL) =>
    customGraphQLClient
      .request<{ cmsPage: ICmsPageGQL }>(Services.graphql.getCmsPage(page.id))
      .then(({ cmsPage }) =>
        openFormModal<{ content: string }>({
          title: page.name,
          schema: {
            content: {
              type: type.string,
              format: format.code,
              label: translate('cms.create.content'),
              disabled: true,
            },
          },
          flow: ['content'],
          value: { content: cmsPage.body },
          onSubmit: () => { },
          actionLabel: translate('Close'),
        })
      );

  const deletePage = (page: ICmsPageGQL) =>
    confirm({ message: translate('Delete page') })
      .then((ok) => {
        if (ok) {
          Services.removeCmsPage(page.id).then((res) => {
            if (res.error) {
              alert({ message: res });
            } else {
              queryClient.invalidateQueries({ queryKey });
            }
          });
        }
      });

  const columnHelper = createColumnHelper<DynamicTableFeatures, ICmsPageGQL>();
  const columns = [
    columnHelper.accessor('name', {
      meta: { title: translate('cms.pages.name'), size: 25 },
    }),
    columnHelper.accessor('path', {
      meta: { title: translate('cms.pages.path'), size: 25 },
      cell: (info) =>
        info.getValue() || <span className="badge bg-dark">{translate('cms.pages.block')}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      meta: { title: translate('Actions'), size: 10, className: 'action-cell' },
      cell: (info) => {
        const page = info.row.original;
        const itemPath = page.path
          ? (page.path.startsWith('/') ? `/_${page.path}` : `/_/${page.path}`)
          : '#';

        return (
          <div className="d-flex align-items-center justify-content-end gap-1">
            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              title={translate('cms.create.content')}
              onClick={() => showContent(page)}
            >
              <Code />
            </button>
            <button
              type="button"
              className="btn --tertiary --small --icon-only"
              title={translate('Delete page')}
              onClick={() => deletePage(page)}
            >
              <Trash2 />
            </button>
            {page.path && (
              <Link to={itemPath} target="_blank" rel="noopener noreferrer">
                <button className="btn --tertiary --small --icon-only">
                  <Eye />
                </button>
              </Link>
            )}
          </div>
        );
      },
    }),
  ];

  const filters: FilterDef[] = [
    { id: 'search', type: 'text', placeholder: translate('Search') },
  ];

  return (
    <Can I={manage} a={tenant} dispatchError>
      <div className="p-3">
        <div className="d-flex flex-row align-items-center justify-content-between mb-2">
          <h1 className="mb-0">Pages</h1>
        </div>

        <DynamicTable<ICmsPageGQL>
          queryKey={queryKey}
          columns={columns}
          fetchData={fetchData}
          filters={filters}
          pageSize={25}
          defaultSorting={[{ id: 'path', desc: true }]}
          getRowId={row => row.id}
          getRowAriaLabel={row => row.name}
          countLabelKey="Pages"
        />
      </div>
    </Can>
  );
};
