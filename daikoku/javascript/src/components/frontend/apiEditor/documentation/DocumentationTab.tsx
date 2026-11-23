import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Download, FileText, Pencil, Plus, Settings2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import {
  IApi,
  IDocPage,
  IDocumentation,
  IDocumentationPage,
  IDocumentationPages,
  isError,
  ITeamSimple,
  IUsagePlan,
  ResponseError,
} from '../../../../types';
import { api as API, CanIDoAction, manage } from '../../../utils';
import { ApiDocPage } from '../../api/ApiDocumentation';
import { DocPageSideSheet } from './DocPageSideSheet';
import { useSharedEnvironment } from '../environments/sharedEnvironment';
import { DocumentationTree } from './DocumentationTree';

type DocumentationTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  documentation?: IDocumentation;
  getDocPage: (pageId: string) => Promise<IDocPage | ResponseError>;
  saveDocumentation: (documentation: IDocumentation) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  canImport: boolean;
};

type PageSheet = {
  page: IDocPage;
  creation: boolean;
};

const flattenPages = (pages: IDocumentationPages): Array<IDocumentationPage> =>
  pages.flatMap((page) => [page, ...flattenPages(page.children)]);

const removePage = (pages: IDocumentationPages, pageId: string): IDocumentationPages =>
  pages
    .filter((page) => page.id !== pageId)
    .map((page) => ({
      ...page,
      children: removePage(page.children, pageId),
    }));

const renamePage = (pages: IDocumentationPages, pageId: string, title: string): IDocumentationPages =>
  pages.map((page) => ({
    ...page,
    title: page.id === pageId ? title : page.title,
    children: renamePage(page.children, pageId, title),
  }));

export const DocumentationTab = (props: DocumentationTabProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm, openApiDocumentationSelectModal } = useContext(ModalContext);
  const { connectedUser } = useContext(GlobalContext);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [managing, setManaging] = useState(false);
  const [sheet, setSheet] = useState<PageSheet>();
  const [pendingPages, setPendingPages] = useState<IDocumentationPages>();

  const isOwner = CanIDoAction(connectedUser, manage, API, props.ownerTeam);

  const pages = pendingPages ?? props.documentation?.pages ?? [];
  const orderedPages = flattenPages(pages);
  const currentIndex = Math.max(
    0,
    orderedPages.findIndex((page) => page.id === searchParams.get('page'))
  );
  const currentPage = orderedPages[currentIndex];
  const previousPage = orderedPages[currentIndex - 1];
  const nextPage = orderedPages[currentIndex + 1];

  const notifyError = (error?: ResponseError) => toast.error(translate(error?.error ?? 'issues.on_error'));

  const goTo = (pageId: string) =>
    setSearchParams((params) => {
      params.set('page', pageId);
      return params;
    });

  const persistPages = (updated: IDocumentationPages) => {
    setPendingPages(updated);

    const documentation = props.documentation
      ? Promise.resolve(props.documentation)
      : Services.fetchNewApiDoc();

    return documentation
      .then((doc) =>
        props.saveDocumentation({
          ...doc,
          pages: updated,
        })
      )
      .then((result) => {
        if (isError(result)) {
          throw result;
        }

        return props.refresh();
      })
      .finally(() => setPendingPages(undefined));
  };

  const openNewPage = () =>
    Services.fetchNewApiDocPage().then((page) =>
      setSheet({
        page,
        creation: true,
      })
    );

  const openPage = (pageId: string) =>
    props.getDocPage(pageId).then((page) => {
      if (isError(page)) {
        toast.error(page.error);
      } else {
        setSheet({
          page,
          creation: false,
        });
      }
    });

  const createPage = (page: IDocPage) =>
    Services.createDocPage(props.ownerTeam._id, page).then((created) => {
      if (isError(created)) {
        throw created;
      }

      const entry = {
        id: created._id,
        title: created.title,
        children: [],
      };

      return persistPages([...pages, entry]).then(() => goTo(created._id));
    });

  const updatePage = (page: IDocPage, original: IDocPage) =>
    Services.saveDocPage(props.ownerTeam._id, page)
      .then((saved) => {
        if (isError(saved)) {
          throw saved;
        }

        return saved.title === original.title ? undefined : persistPages(renamePage(pages, saved._id, saved.title));
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ['page'] }));

  const savePage = (page: IDocPage, current: PageSheet) => {
    const save = current.creation ? createPage(page) : updatePage(page, current.page);

    return save
      .then(() => {
        toast.success(translate(current.creation ? 'doc.page.create.successfull' : 'doc.page.save.successfull'));
        setSheet(undefined);
      })
      .catch(notifyError);
  };

  const deletePage = (page: IDocumentationPage) =>
    confirm({ message: translate('delete.documentation.page.confirm') }).then((ok) => {
      if (!ok) {
        return;
      }

      const removedIds = flattenPages([page]).map(({ id }) => id);

      return persistPages(removePage(pages, page.id))
        .then(() => Promise.all(removedIds.map((id) => Services.deleteDocPage(props.ownerTeam._id, id))))
        .then(() => toast.success(translate('doc.page.deletion.successfull')))
        .catch(notifyError);
    });

  const movePages = (updated: IDocumentationPages) => persistPages(updated).catch(notifyError);

  const importPages = () =>
    openApiDocumentationSelectModal({
      api: props.api,
      teamId: props.ownerTeam._id,
      getDocumentationPages: () =>
        Services.getAllApiDocumentation(props.ownerTeam._id, props.api._id, props.api.currentVersion),
      importPages: (pageIds: Array<string>, linked?: boolean) =>
        Services.importApiPages(props.ownerTeam._id, props.api._id, pageIds, props.api.currentVersion, linked),
      onClose: () => {
        toast.success(translate('doc.page.import.successfull'));
        props.refresh();
      },
    });

  const sheetNode = sheet && (
    <DocPageSideSheet
      ownerTeam={props.ownerTeam}
      page={sheet.page}
      creation={sheet.creation}
      onSave={(page) => savePage(page, sheet)}
      onClose={() => setSheet(undefined)}
    />
  );

  if (!currentPage) {
    return (
      <div className="api-doc">
        <div className="api-doc__empty">
          <FileText size={32} aria-hidden="true" />
          <h3 className="api-doc__empty-title">{translate('doc.empty.title')}</h3>
          <p className="api-doc__empty-text">
            {translate(isOwner ? 'doc.empty.owner.description' : 'doc.empty.description')}
          </p>

          {isOwner && (
            <div className="d-flex justify-content-center gap-2">
              <button type="button" className="btn --primary" onClick={openNewPage}>
                <Plus size={16} />
                {translate('doc.empty.create')}
              </button>

              {props.canImport && (
                <button type="button" className="btn --secondary" onClick={importPages}>
                  <Download size={16} />
                  {translate('doc.import')}
                </button>
              )}
            </div>
          )}
        </div>

        {sheetNode}
      </div>
    );
  } else {
    return (
      <div className="api-doc">
        <nav className="api-doc__sidebar" aria-label={translate('doc.tree.title')}>
          <div className="api-doc__sidebar-header">
            <span className="api-doc__sidebar-title">{translate('doc.tree.title')}</span>

            {isOwner && (
              <button
                type="button"
                className="btn --tertiary --small"
                aria-pressed={managing}
                onClick={() => setManaging(!managing)}
              >
                {managing ? <Check size={14} /> : <Settings2 size={14} />}
                {translate(managing ? 'doc.tree.manage.done' : 'doc.tree.manage')}
              </button>
            )}
          </div>

          <DocumentationTree
            pages={pages}
            currentPageId={currentPage.id}
            managing={managing}
            onSelect={goTo}
            onEdit={openPage}
            onDelete={deletePage}
            onMove={movePages}
          />

          {managing && (
            <div className="api-doc__sidebar-actions">
              <button type="button" className="btn --secondary --small" onClick={openNewPage}>
                <Plus size={14} />
                {translate('doc.tree.add')}
              </button>

              {props.canImport && (
                <button type="button" className="btn --tertiary --small" onClick={importPages}>
                  <Download size={14} />
                  {translate('doc.import')}
                </button>
              )}
            </div>
          )}
        </nav>

        <article className="api-doc__content">
          <header className="api-doc__content-header">
            <h2 className="api-doc__page-title">{currentPage.title}</h2>

            {isOwner && (
              <button type="button" className="btn --secondary --small" onClick={() => openPage(currentPage.id)}>
                <Pencil size={14} />
                {translate('doc.page.edit')}
              </button>
            )}
          </header>

          <ApiDocPage pageId={currentPage.id} getDocPage={props.getDocPage} api={props.api} />

          {(previousPage || nextPage) && (
            <footer className="api-doc__pager">
              {previousPage && (
                <button type="button" className="api-doc__pager-link" onClick={() => goTo(previousPage.id)}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span>
                    <span className="api-doc__pager-label">{translate('Previous page')}</span>
                    {previousPage.title}
                  </span>
                </button>
              )}

              {nextPage && (
                <button type="button" className="api-doc__pager-link --next" onClick={() => goTo(nextPage.id)}>
                  <span>
                    <span className="api-doc__pager-label">{translate('Next page')}</span>
                    {nextPage.title}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </footer>
          )}
        </article>

        {sheetNode}
      </div>
    );
  }
};

type EnvironmentsDocumentationTabProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  plans: Array<IUsagePlan>;
  refresh: () => Promise<unknown>;
};

export const EnvironmentsDocumentationTab = (props: EnvironmentsDocumentationTabProps) => {
  const { translate } = useContext(I18nContext);

  const { environment: plan } = useSharedEnvironment(props.plans, 'documentation');

  if (!plan) {
    return (
      <div className="api-doc">
        <div className="api-doc__empty">
          <FileText size={32} aria-hidden="true" />
          <p className="api-doc__empty-text">{translate('doc.environments.empty')}</p>
        </div>
      </div>
    );
  } else {
    return (
      <>
        <DocumentationTab
          key={plan._id}
          api={props.api}
          ownerTeam={props.ownerTeam}
          documentation={plan.documentation}
          getDocPage={(pageId) => Services.getUsagePlanDocPage(props.api._id, plan._id, pageId)}
          saveDocumentation={(documentation) =>
            Services.updatePlan(props.ownerTeam._id, props.api._id, props.api.currentVersion, {
              ...plan,
              documentation,
            })
          }
          refresh={props.refresh}
          canImport={false}
        />
      </>
    );
  }
};
