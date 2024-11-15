import { Form, constraints, format, type } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import sortBy from 'lodash/sortBy';
import { useContext, useEffect, useState } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
import { useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { IApi, ITeamSimple, isError } from '../../../types';
import { teamApiInfoForm } from '../../backoffice/apis/TeamApiInfo';
import { api as API, Can, manage } from '../../utils';
import { reservedCharacters } from '../../utils/tenantUtils';

type Version = {
  label: string,
  value: string
}

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
  const { tenant, expertMode } = useContext(GlobalContext);

  const [versions, setApiVersions] = useState<Array<Version>>([]);

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
        setApiVersions(versions.map((v) => ({
          label: v,
          value: v
        })))
      );
  }, []);

  const informationForm = teamApiInfoForm(translate, ownerTeam, tenant);
  const transferSchema = {
    team: {
      type: type.string,
      label: translate('new.owner'),
      format: format.select,
      optionsFrom: Services.teams(ownerTeam)
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

  //FIXME: Beware of Admin API
  // if (api.visibility === 'AdminOnly') {
  //   return (
  //     <Form
  //       schema={informationForm.adminSchema}
  //       flow={informationForm.adminFlow}
  //       onSubmit={save}
  //       value={api}
  //     />
  //   )
  // }

  return (
    <section className="api__header col-12 mb-4 p-3 d-flex flex-row">
      <div className="container-fluid">
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
      </div>
      <div className='d-flex flex-row gap-1 align-items-center' style={{ position: 'absolute', top: 10, right: 10 }}>
        {versions.length > 1 && tab !== 'issues' && (
          <div style={{ minWidth: '125px', fontSize: 'initial' }}>
            <Select
              name="versions-selector"
              value={{ label: params.versionId, value: params.versionId }}
              options={versions}
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
          <More
            className="a-fake"
            aria-label={translate("api.home.config.api.aria.label")}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id={`${api._humanReadableId}-dropdownMenuButton`}
          />
          <div className="dropdown-menu" aria-labelledby={`${api._humanReadableId}-dropdownMenuButton`}>
            <span
              onClick={() => openRightPanel({
                title: translate("api.home.update.form.title"),
                content: <div className="text-center">
                  <Form
                    schema={informationForm.schema}
                    flow={informationForm.flow(expertMode)} //todo: get real flow, for admin api for example
                    onSubmit={(data) => {
                      Services.saveTeamApi(ownerTeam._id, data, data.currentVersion)
                        .then((response) => {
                          if (!isError(response)) {
                            queryClient.invalidateQueries({ queryKey: ["api"] });
                            closeRightPanel();
                            toast.success("update.api.sucecssful.toast.label");
                            navigate(`/${ownerTeam._humanReadableId}/${response._humanReadableId}/${response.currentVersion}/description`)
                          } else {
                            toast.error(response.error);
                          }
                        })
                    }}
                    value={api}
                  />
                </div>
              })
              }
              className="dropdown-item cursor-pointer"
            >
              {translate("api.home.update.api.btn.label")}
            </span>
            <div className="dropdown-divider" />
            <span
              className="dropdown-item cursor-pointer"
              onClick={() => Services.fetchNewApi()
                .then((e) => {
                  const clonedApi: IApi = { ...e, team: ownerTeam._id, name: `${api.name} copy`, state: 'created' };
                  return clonedApi
                })
                .then((newApi) => openRightPanel({
                  title: translate('api.home.create.api.form.title'),
                  content: <div className="">
                    <Form
                      schema={informationForm.schema}
                      flow={informationForm.flow(expertMode)} //todo: get real flow, for admin api for example
                      onSubmit={(data) => {
                        Services.createTeamApi(ownerTeam._id, data)
                          .then(() => closeRightPanel())
                          .then(() => toast.success("api.created.successful.toast"))
                          .then(() => queryClient.invalidateQueries({ queryKey: ["data"] }))
                      }}
                      value={newApi}
                    />
                  </div>
                }))}
            >
              {translate("api.home.clone.api.btn.label")}
            </span>
            <span
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
              {translate("api.home.create.version.api.btn.label")}
            </span>
            <div className="dropdown-divider" />
            <span
              className="dropdown-item cursor-pointer btn-outline-danger"
              onClick={() => openRightPanel({
                title: "api.transfer.title",
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
                />
              })}
            >
              {translate('api.home.transfer.api.btn.label')}
            </span>
            <span
              className="dropdown-item cursor-pointer btn-outline-danger"
              onClick={() => openFormModal(
                {
                  title: translate("apikeys.delete.confirm.modal.title"),
                  schema: {
                    validation: {
                      type: type.string,
                      label: translate("vous voulez supprimer cette api, remplir avec le noim exatct de l'api puis confirmez"),
                      constraints: [
                        constraints.required(translate('constraints.required.value')),
                        constraints.matches(new RegExp(`${api.name}`), translate('constraints.match.subscription'))
                      ],
                      defaultValue: ""
                    }
                  },
                  actionLabel: translate('Confirm'),
                  onSubmit: () => Services.deleteTeamApi(ownerTeam._id, api._id)
                    .then(() => toast.success(translate('api.deletion.succesful')))
                    .then(() => navigate('/apis'))
                }
              )}
            >
              {translate('api.home.delete.api.btn.label')}
            </span>
          </div>
        </Can>
      </div>
    </section>
  );
};