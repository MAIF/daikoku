import { getApolloContext, gql } from '@apollo/client';
import { Form, constraints, format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { IApi, ITeamSimple, isError } from '../../../types';
import { IPage } from '../../adminbackoffice/cms';
import { api as API, Can, CanIDoAction, manage } from '../../utils';
import { deleteApi } from '../../utils/apiUtils';
import { ApiFormRightPanel } from '../../utils/sidebar/panels/AddPanel';
import { reservedCharacters } from '../../utils/tenantUtils';
import { CmsViewer } from '../CmsViewer';

type ApiHeaderProps = {
  api: IApi
  ownerTeam: ITeamSimple
  tab: string
}

export const ApiHeader = ({
  api,
  ownerTeam,
  tab
}: ApiHeaderProps) => {
  const navigate = useNavigate();
  const params = useParams();

  const queryClient = useQueryClient();
  const { openRightPanel, closeRightPanel, prompt, openFormModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const { tenant, expertMode, connectedUser } = useContext(GlobalContext);

  const [versions, setApiVersions] = useState<Array<string>>([]);

  const createNewVersion = (newVersion: string) => {
    Services.createNewApiVersion(api._humanReadableId, ownerTeam._id, newVersion)
      .then((res) => {
        if (res.error) {
          toast.error(res.error)
        } else {
          toast.success(translate('version.creation.success.message'));
          navigate(`/${ownerTeam._id}/${api._humanReadableId}/${newVersion}/description`);
        }
      });
  };

  useEffect(() => {
    Services.getAllApiVersions(ownerTeam._id, params.apiId! || params.apiGroupId!)
      .then((versions) =>
        setApiVersions(versions)
      );
  }, []);

  const cmsPagesQuery = () => ({
    query: gql`
    query CmsPages {
      pages {
        id
        name
        path
        contentType
        lastPublishedDate
        metadata
      }
    }
  `,
  });
  const { client } = useContext(getApolloContext());
  const getCmsPages = (): Promise<Array<IPage>> =>
    client!.query(cmsPagesQuery())
      .then(res => res.data.pages as Array<IPage>)
  const transferSchema = {
    team: {
      type: type.string,
      label: translate('new.owner'),
      format: format.select,
      optionsFrom: () => Services.teams(ownerTeam)
        .then((teams) => {
          if (!isError(teams)) {
            return sortBy(teams.filter((team: any) => team._id !== api.team), 'name')
          } else {
            return []
          }
        }
        ),
      transformer: (team: any) => ({
        label: team.name,
        value: team._id
      }),
      constraints: [constraints.required(translate('constraints.required.team'))],
    },
    comfirm: {
      type: type.string,
      label: translate({ key: 'type.api.name.confirmation', replacements: [api.name] }),
      constraints: [
        constraints.oneOf(
          [api.name],
          translate({ key: 'constraints.type.api.name', replacements: [api.name] })
        ),
      ],
    },
  };

  return (
    <section className="api__header col-12 mb-4 p-3 d-flex flex-row" style={{ position: 'relative' }}>
      {!!api.customHeaderCmsPage && <CmsViewer pageId={api.customHeaderCmsPage} fields={{ api }} />}
      {!api.customHeaderCmsPage && <div className="container-fluid">
        {!api.header && (
          <>
            <h1 className="jumbotron-heading" style={{ position: 'relative' }}>
              {api.name}
              <div
                style={{ position: 'absolute', right: 0, bottom: 0 }}
                className="d-flex align-items-center">
              </div>
            </h1>
            <p className="lead">{api.smallDescription}</p>
          </>
        )}
        {api.header && (
          <div
            className="api-description"
            dangerouslySetInnerHTML={{
              __html: converter.makeHtml(api.header
                .replace('{{title}}', api.name)
                .replace('{{description}}', api.smallDescription))
            }}
          />
        )}
      </div>}
      <div className='d-flex flex-row gap-1 align-items-center' style={{ position: 'absolute', top: 10, right: 10 }}>
        {versions.length > 1 && tab !== 'issues' && (
          <div style={{ minWidth: '125px', fontSize: 'initial' }}>
            <Select
              name="versions-selector"
              value={{ label: params.versionId, value: params.versionId }}
              options={versions.map(label => ({ label, value: label }))}
              onChange={(e) =>
                navigate(`/${params.teamId}/${params.apiId}/${e?.value}/${tab}`)
              }
              classNamePrefix="reactSelect"
              className="me-2"
              menuPlacement="auto"
              menuPosition="fixed"
            />
          </div>
        )}
        <Can I={manage} a={API} team={ownerTeam}>
          <button
            className="btn btn-sm btn-outline-primary px-3"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            aria-haspopup="menu"
            aria-controls="api-action-menu"
            id={`${api._humanReadableId}-dropdownMenuButton`} >
            {translate('api.home.config.api.btn.label')}
          </button>
          <ul
            role="menu"
            id="api-action-menu"
            className="dropdown-menu"
            aria-labelledby={`${api._humanReadableId}-dropdownMenuButton`}>
            <li role='none'>
              <button
                role='menuitem'
                onClick={() => openRightPanel({
                  title: translate("api.home.config.api.menu.configure"),
                  content: <ApiFormRightPanel team={ownerTeam} api={api} apigroup={!!api.apis} handleSubmit={(updatedApi) => {
                    return Services.saveTeamApi(ownerTeam._id, updatedApi, api.currentVersion)
                      .then((response) => {
                        if (!isError(response)) {
                          queryClient.invalidateQueries({ queryKey: ["api"] });
                          toast.success(translate("update.api.successful.toast.label"));
                          navigate(`/${ownerTeam._humanReadableId}/${response._humanReadableId}/${response.currentVersion}/description`)
                        } else {
                          toast.error(response.error);
                        }
                      })
                  }} />
                })}
                className="dropdown-item cursor-pointer"
              >
                {translate("api.home.update.api.btn.label")}
              </button>
            </li>
            {api.visibility !== 'AdminOnly' && <>
              <div className="dropdown-divider" role='none' />
              <li role='none'>
                <button
                  role='menuitem'
                  className="dropdown-item cursor-pointer"
                  onClick={() => Services.fetchNewApi()
                    .then((e) => {
                      const clonedApi: IApi = { ...api, _id: e._id, name: `${api.name} copy`, state: 'created' };
                      return clonedApi
                    })
                    .then((newApi) => openRightPanel({
                      title: translate('api.home.create.api.form.title'),
                      content: <ApiFormRightPanel team={ownerTeam} api={newApi} apigroup={!!newApi.apis} handleSubmit={(api) =>
                        Services.createTeamApi(ownerTeam._id, api)
                          .then(() => queryClient.invalidateQueries({ queryKey: ["data"] }))
                          .then(() => toast.success("api.created.successful.toast")) //todo: move to new API
                      } />
                    }))}
                >
                  {translate("api.home.config.api.menu.clone")}
                </button>
              </li>
              {!api.apis && <li role='none'>
                <button
                  role='menuitem'
                  className="dropdown-item cursor-pointer"
                  onClick={() => prompt({
                    placeholder: translate('Version number'),
                    title: translate('New version'),
                    value: api.currentVersion,
                    okLabel: translate('Create')
                  })
                    .then((newVersion) => {
                      if (newVersion) {
                        if ((newVersion || '').split('').find((c) => reservedCharacters.includes(c)))
                          toast.error(translate({ key: "semver.error.message", replacements: [reservedCharacters.join(' | ')] }));
                        else
                          createNewVersion(newVersion);
                      }
                    })}
                >
                  {translate("api.home.config.api.menu.new_version")}
                </button>
              </li>}
              <div className="dropdown-divider" role='none'/>
              {!api.apis && <li role='none'>
                <button
                  role='menuitem'
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => openRightPanel({
                    title: translate('api.home.right.panel.transfer.title'),
                    content: <Form
                      schema={transferSchema}
                      onSubmit={(data) => {
                        Services.transferApiOwnership(data.team, api.team, api._id)
                          .then((r) => {
                            if (r.notify) {
                              toast.info(translate('team.transfer.notified'));
                            } else if (r.error) {
                              toast.error(r.error);
                            } else {
                              toast.error(translate('issues.on_error'));
                            }
                          })
                          .then(closeRightPanel);
                      }}
                      options={{
                        actions: {
                          submit: { label: translate('Save') }
                        }
                      }}
                    />
                  })}
                >
                  {translate('api.home.config.api.menu.transfer')}
                </button>
              </li>}
              <li role='none'>
                <button
                  role='menuitem'
                  className="dropdown-item cursor-pointer danger"
                  onClick={() => deleteApi({
                    api,
                    versions,
                    team: ownerTeam,
                    translate,
                    openFormModal,
                    handleSubmit: () => navigate('/apis')
                  })}
                >
                  {translate('api.home.config.api.menu.delete')}
                </button>
              </li>
            </>}
          </ul>
        </Can>
      </div >
    </section >
  );
};