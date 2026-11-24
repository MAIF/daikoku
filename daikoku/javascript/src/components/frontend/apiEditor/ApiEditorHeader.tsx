import { constraints, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CopyPlus, Download, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useContext, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { IApi, isError, ITeamSimple } from '../../../types';
import { api as API, Can, manage } from '../../utils';
import { deleteApi } from '../../utils/apiUtils';
import { reservedCharacters } from '../../utils/tenantUtils';
import { useExportEntity } from '../../utils/useExportEntity';
import StarsButton from '../api/StarsButton';
import { CmsViewer } from '../CmsViewer';
import { ApiSideSheet } from './sheets/ApiSideSheet';
import { withoutGeneratedKey } from './sheets/TestingSideSheet';
import { TransferApiSideSheet } from './sheets/TransferApiSideSheet';

type ApiEditorHeaderProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  tab: string;
};

type HeaderSheet = 'edit' | 'clone' | 'transfer';

export const ApiEditorHeader = ({ api, ownerTeam, tab }: ApiEditorHeaderProps) => {
  const { translate } = useContext(I18nContext);
  const { connectedUser, customGraphQLClient } = useContext(GlobalContext);
  const { prompt, openFormModal, openContactModal } = useContext(ModalContext);
  const { canExport, exportEntity } = useExportEntity();

  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();

  const [sheet, setSheet] = useState<HeaderSheet>();

  const versionsQuery = useQuery({
    queryKey: ['apiVersions', ownerTeam._id, api._humanReadableId],
    queryFn: () => Services.getAllApiVersions(ownerTeam._id, api._humanReadableId),
  });
  const versions: Array<string> = versionsQuery.data ?? [];

  const isStruck = api.state === 'deprecated' || api.state === 'blocked';

  const saveApi = (updatedApi: IApi): Promise<boolean> =>
    Services.saveTeamApi(ownerTeam._id, updatedApi, api.currentVersion).then((response) => {
      if (isError(response)) {
        toast.error(response.error);
        return false;
      }

      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(translate('update.api.successful.toast.label'));
      navigate(`/${ownerTeam._humanReadableId}/${response._humanReadableId}/${response.currentVersion}/${tab}`);
      return true;
    });

  const confirmBlocking = (updatedApi: IApi): Promise<boolean> =>
    customGraphQLClient
      .request<{ apiApiSubscriptions: { total: number } }>(Services.graphql.getApiSubscriptionsTotal, {
        apiId: api._id,
        teamId: ownerTeam._id,
        version: api.currentVersion,
        limit: 0,
        offset: 0,
      })
      .then((response) => {
        const description = (
          <div className="alert alert-danger" role="alert">
            <h4 className="alert-heading">{translate('Warning')}</h4>
            <p>{translate({ key: 'api.lifecycle.blocking.confirm.modal.description.1', replacements: [api.name] })}</p>
            <ul>
              <li>
                {translate({
                  key: 'api.lifecycle.blocking.confirm.modal.description.2',
                  replacements: [response.apiApiSubscriptions.total.toString()],
                })}
              </li>
            </ul>
          </div>
        );

        return new Promise<boolean>((resolve) =>
          openFormModal({
            title: translate('Confirm'),
            description,
            schema: {
              confirm: {
                type: type.string,
                label: translate({ key: 'delete.item.confirm.modal.confirm.label', replacements: [api.name] }),
                constraints: [
                  constraints.oneOf([api.name], translate({ key: 'constraints.type.api.name', replacements: [api.name] })),
                ],
              },
            },
            onSubmit: () => saveApi(updatedApi).then(resolve),
            onCancel: () => resolve(false),
            actionLabel: translate('Confirm'),
          })
        );
      });

  const createApi = (newApi: IApi): Promise<boolean> =>
    Services.createTeamApi(ownerTeam._id, newApi).then((response) => {
      if (isError(response)) {
        toast.error(response.error);
        return false;
      }

      toast.success(translate({ key: 'api.created.successful.toast', replacements: [newApi.name] }));
      navigate(`/${ownerTeam._humanReadableId}/${response._humanReadableId}/${response.currentVersion}/description`);
      return true;
    });

  const askNewVersion = () =>
    prompt({
      placeholder: translate('Version number'),
      title: translate('New version'),
      value: api.currentVersion,
      okLabel: translate('Create'),
    }).then((newVersion) => {
      if (!newVersion) {
        return;
      }

      if (newVersion.split('').some((c) => reservedCharacters.includes(c))) {
        toast.error(translate({ key: 'semver.error.message', replacements: [reservedCharacters.join(' | ')] }));
        return;
      }

      Services.createNewApiVersion(api._humanReadableId, ownerTeam._id, newVersion).then((res) => {
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(translate('version.creation.success.message'));
          navigate(`/${ownerTeam._id}/${api._humanReadableId}/${newVersion}/description`);
        }
      });
    });

  const cloneApi = (): IApi => ({
    ...api,
    name: `${api.name} copy`,
    state: 'created',
    testing: withoutGeneratedKey(api.testing),
  });

  return (
    <section className="api-editor__header">
      <div className="api-editor__identity">
        {!!api.customHeaderCmsPage && <CmsViewer pageId={api.customHeaderCmsPage} fields={{ api }} />}

        {!api.customHeaderCmsPage && !!api.header && (
          <div
            className="api-description"
            dangerouslySetInnerHTML={{
              __html: converter.makeHtml(
                api.header.replace('{{title}}', api.name).replace('{{description}}', api.smallDescription)
              ),
            }}
          />
        )}

        {!api.customHeaderCmsPage && !api.header && (
          <>
            <div className="d-flex flex-row flex-wrap align-items-center gap-2">
              <h1 className={isStruck ? 'api-editor__title text-decoration-line-through' : 'api-editor__title'}>
                {api.name}
              </h1>
              <StarsButton
                starred={connectedUser.starredApis.includes(api._id)}
                toggleStar={() => Services.toggleStar(api._id)}
              />
              {api.state === 'deprecated' && <span className="badge --warning">{translate('api.deprecated')}</span>}
              {api.state === 'blocked' && <span className="badge --danger">{translate('api.blocked')}</span>}
              {versions.length > 1 && tab !== 'issues' && (
                <div className="api-editor__versions">
                  <Select
                    name="versions-selector"
                    aria-label={translate('api.editor.version.selector.label')}
                    value={{ label: params.versionId, value: params.versionId }}
                    options={versions.map((label) => ({ label, value: label }))}
                    onChange={(e) => navigate(`/${params.teamId}/${params.apiId}/${e?.value}/${tab}`)}
                    classNamePrefix="reactSelect"
                    menuPlacement="auto"
                  />
                </div>
              )}
            </div>
            <p className="api-editor__description">{api.smallDescription}</p>
          </>
        )}
      </div>

      <div className="api-editor__actions">
        {connectedUser.isGuest ? (
          <a className="btn --tertiary" href={`mailto:${ownerTeam.contact}`}>
            {translate({ key: 'contact.team', replacements: [ownerTeam.name] })}
          </a>
        ) : (
          <button
            type="button"
            className="btn --tertiary"
            onClick={() => openContactModal({ team: api.team, api: api._id })}
          >
            {translate({ key: 'contact.team', replacements: [ownerTeam.name] })}
          </button>
        )}

        <Can I={manage} a={API} team={ownerTeam}>
          <button
            type="button"
            className="btn --secondary"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            aria-haspopup="menu"
            id="api-settings-menu-button"
          >
            <Settings size={16} />
            {translate('api.editor.settings.button.label')}
          </button>
          <ul role="menu" className="dropdown-menu" aria-labelledby="api-settings-menu-button">
            <li role="none">
              <button role="menuitem" className="dropdown-item d-flex gap-2 align-items-center" onClick={() => setSheet('edit')}>
                <Pencil size={16} />
                {translate('api.home.update.api.btn.label')}
              </button>
            </li>
            {api.visibility !== 'AdminOnly' && (
              <>
                <li role="none">
                  <button role="menuitem" className="dropdown-item d-flex gap-2 align-items-center" onClick={() => setSheet('clone')}>
                    <CopyPlus size={16} />
                    {translate('api.home.config.api.menu.clone')}
                  </button>
                </li>
                {!api.apis && (
                  <li role="none">
                    <button role="menuitem" className="dropdown-item d-flex gap-2 align-items-center" onClick={askNewVersion}>
                      <Plus size={16} />
                      {translate('api.home.config.api.menu.new_version')}
                    </button>
                  </li>
                )}
                {canExport && (
                  <li role="none">
                    <button
                      role="menuitem"
                      className="dropdown-item d-flex gap-2 align-items-center"
                      onClick={() => exportEntity('api', api._id)}
                    >
                      <Download size={16} />
                      {translate('remote-catalog.exportEntity.button')}
                    </button>
                  </li>
                )}
                {!api.apis && (
                  <li role="none">
                    <button role="menuitem" className="dropdown-item d-flex gap-2 align-items-center" onClick={() => setSheet('transfer')}>
                      <ArrowLeftRight size={16} />
                      {translate('api.home.config.api.menu.transfer')}
                    </button>
                  </li>
                )}
                <li role="none">
                  <button
                    role="menuitem"
                    className="dropdown-item d-flex gap-2 align-items-center danger"
                    onClick={() =>
                      deleteApi({
                        api,
                        versions,
                        team: ownerTeam,
                        translate,
                        openFormModal,
                        handleSubmit: () => navigate('/apis'),
                      })
                    }
                  >
                    <Trash2 size={16} />
                    {translate('api.home.config.api.menu.delete')}
                  </button>
                </li>
              </>
            )}
          </ul>
        </Can>
      </div>

      {sheet === 'edit' && (
        <ApiSideSheet
          title={translate('api.home.update.api.btn.label')}
          team={ownerTeam}
          api={api}
          hasSubscriptions={(api.subscriptionCount ?? 0) > 0}
          onSubmit={(updatedApi) => (updatedApi.state === 'blocked' ? confirmBlocking(updatedApi) : saveApi(updatedApi))}
          onClose={() => setSheet(undefined)}
        />
      )}

      {sheet === 'clone' && (
        <ApiSideSheet
          title={translate('api.home.create.api.form.title')}
          team={ownerTeam}
          api={cloneApi()}
          onSubmit={(newApi) =>
            Services.fetchNewApi().then((fresh) => createApi({ ...newApi, _id: fresh._id }))
          }
          onClose={() => setSheet(undefined)}
        />
      )}

      {sheet === 'transfer' && (
        <TransferApiSideSheet api={api} ownerTeam={ownerTeam} onClose={() => setSheet(undefined)} />
      )}
    </section>
  );
};
