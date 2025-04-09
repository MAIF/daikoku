import { useContext } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api as API, CanIDoAction, Option, Spinner, manage } from '../..';
import { ModalContext } from '../../../../contexts';
import { I18nContext } from '../../../../contexts/i18n-context';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, isError, ITeamSimple } from '../../../../types';
import { teamSchema } from '../../../backoffice/teams/TeamEdit';
import { Form } from '@maif/react-forms';
import { teamApiInfoForm } from '../../../backoffice/apis/TeamApiInfo';
import { getApolloContext, gql } from '@apollo/client';
import { IPage } from '../../../adminbackoffice/cms';
import { actions } from 'xstate';

export const AddPanel = () => {
  const { translate } = useContext(I18nContext);
  const { openFormModal, openTeamSelectorModal, openRightPanel, closeRightPanel } = useContext(ModalContext);

  const { tenant, connectedUser, apiCreationPermitted, expertMode, toggleExpertMode } = useContext(GlobalContext);
  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/*');
  const queryClient = useQueryClient();

  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

  const createTeam = () => {
    Services.fetchNewTeam()
      .then((team) => openFormModal({
        title: translate('Create a new team'),
        schema: teamSchema(team, translate),
        onSubmit: (data) => Services.createTeam(data)
          .then(r => {
            if (r.error) {
              toast.error(r.error)
            } else {
              queryClient.invalidateQueries({ queryKey: ['teams'] })
              queryClient.invalidateQueries({ queryKey: ['myTeams'] })
              toast.info(translate("mailValidation.sent.body"))
              toast.success(translate({ key: "Team %s created successfully", replacements: [data.name] }))
            }
          }),
        actionLabel: translate('Create'),
        value: team
      }));
  };

  const createApi = (teamId?: string) => {
    if (apiCreationPermitted && !myTeamsRequest.isLoading && myTeamsRequest.data && !isError(myTeamsRequest.data)) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('api.creation.title.modal'),
          description: translate('api.creation.description.modal'),
          teams: myTeamsRequest.data
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApi(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

        if (!team) {
          toast.warning('toast.no.team.found')
        } else {
          return openRightPanel({
            title: translate('api.creation.right.panel.title'),
            content: <ApiFormRightPanel team={team} apigroup={false} handleSubmit={(api) => Services.createTeamApi(team._id, api)
              .then((maybeApi) => {
                queryClient.invalidateQueries({ queryKey: ["data"] })
                return maybeApi
              })
              .then((maybeApi) => {
                toast.success(translate({ key: "api.created.successful.toast", replacements: [api.name] }))
                return maybeApi
              })
              .then((maybeApi) => {
                if (!isError(maybeApi)) {
                  navigate(`${team._humanReadableId}/${maybeApi._humanReadableId}/${maybeApi.currentVersion}/description`)
                }
              })
            } />
          })
        }
      }
    }
  };

  const createApiGroup = (teamId) => {
    if (apiCreationPermitted && !myTeamsRequest.isLoading && myTeamsRequest.data && !isError(myTeamsRequest.data)) {
      if (!teamId) {
        return openTeamSelectorModal({
          allTeamSelector: false,
          title: translate('apigroup.creation.title.modal'),
          description: translate('apigroup.creation.description.modal'),
          teams: myTeamsRequest.data
            .filter((t) => t.type !== 'Admin')
            .filter((t) => !tenant.creationSecurity || t.apisCreationPermission)
            .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted)),
          action: (teams) => createApiGroup(teams[0]),
          actionLabel: translate('Create')
        });
      } else {
        const team = myTeamsRequest.data.find((t) => teamId === t._id);

        if (!team) {
          toast.warning('toast.no.team.found')
        } else {
          return openRightPanel({
            title: translate('apigroup.creation.right.panel.title'),
            content: <ApiFormRightPanel team={team} apigroup={true} handleSubmit={(api) => Services.createTeamApi(team._id, api)
              .then((maybeApi) => {
                queryClient.invalidateQueries({ queryKey: ["data"] })
                return maybeApi
              })
              .then((maybeApi) => {
                toast.success(translate({ key: "apigroup.created.successful.toast", replacements: [api.name] }))
                return maybeApi
              })
              .then((maybeApi) => {
                if (!isError(maybeApi)) {
                  navigate(`${team._humanReadableId}/${maybeApi._humanReadableId}/${maybeApi.currentVersion}/description`)
                }
              })
            } />
          })
        }
      }
    }
  };

  const createTenant = () => {
    Services.fetchNewTenant()
      .then((newTenant) => {
        navigate(`/settings/tenants/${newTenant._id}/general`, {
          state: {
            newTenant,
          },
        });
      });
  }

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    const teams = myTeamsRequest.data
    const maybeTeam: string | undefined = Option(match)
      .map((m) => m.params)
      .map((p) => p.teamId)
      .map((id) => teams.find((t) => t._humanReadableId === id))
      .filter((t) => CanIDoAction(connectedUser, manage, API, t, apiCreationPermitted))
      .map((t) => t._id)
      .getOrNull();

    return (
      <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
        {/* todo: add a title if API page or tenant or Team */}
        <div>
          <h3>{translate('Create')}</h3>
        </div>
        <div className="blocks">
          <div className="mb-3 block">
            <div className="block__entries d-flex flex-column">
              {connectedUser.isDaikokuAdmin && (
                <span
                  className="block__entry__link d-flex align-items-center justify-content-between"
                  onClick={createTenant}>
                  <span>{translate('Tenant')}</span>
                  <button className="btn btn-sm btn-outline-primary me-1">
                    <i className="fas fa-plus-circle" />
                  </button>
                </span>
              )}
              <span
                className="block__entry__link d-flex align-items-center justify-content-between"
                onClick={createTeam}
              >
                <span>{translate('Team')}</span>
                <button className="btn btn-sm btn-outline-primary me-1">
                  <i className="fas fa-plus-circle" />
                </button>
              </span>
              <span
                className="block__entry__link d-flex align-items-center justify-content-between"
                onClick={() => createApi(maybeTeam)}
              >
                <span>{translate('API')}</span>
                <button className="btn btn-sm btn-outline-primary me-1">
                  <i className="fas fa-plus-circle" />
                </button>
              </span>
              <span
                className="block__entry__link d-flex align-items-center justify-content-between"
                onClick={() => createApiGroup(maybeTeam)}
              >
                <span>{translate('API group')}</span>
                <button className="btn btn-sm btn-outline-primary me-1">
                  <i className="fas fa-plus-circle" />
                </button>
              </span>
            </div>
          </div>
          {/* todo: add a block in function of context to create plan...otoroshi or whatever */}
        </div>
      </div>
    );
  } else {
    return <span>Error while fetching teams</span>
  }

};

type ApiFormRightPanelProps = {
  team: ITeamSimple,
  api?: IApi
  handleSubmit: (api: IApi) => Promise<any>
  apigroup: boolean
}
export const ApiFormRightPanel = (props: ApiFormRightPanelProps) => {
  const { translate } = useContext(I18nContext);
  const { closeRightPanel } = useContext(ModalContext);

  const { tenant, expertMode, toggleExpertMode } = useContext(GlobalContext);
  const { client } = useContext(getApolloContext());
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
  const getCmsPages = (): Promise<Array<IPage>> =>
    client!.query(cmsPagesQuery())
      .then(res => res.data.pages as Array<IPage>)

  const informationForm = teamApiInfoForm(translate, props.team, tenant, getCmsPages, props.apigroup);

  const newApiQuery = useQuery({
    queryKey: ['newapi'],
    queryFn: () => (props.apigroup ? Services.fetchNewApiGroup() : Services.fetchNewApi())
      .then((e) => {
        const newApi = { ...e, team: props.team._id };
        return newApi
      }),
    enabled: !props.api
  })

  if (!props.api && (newApiQuery.isLoading || !newApiQuery.data)) {
    return (
      <Spinner />
    )
  }

  return (
    <div className="">
      <button onClick={() => toggleExpertMode()} className="btn btn-sm btn-outline-info">
        {expertMode && translate('Standard mode')}
        {!expertMode && translate('Expert mode')}
      </button>
      <Form
        schema={props.api?.visibility === 'AdminOnly' ? informationForm.adminSchema : informationForm.schema}
        flow={props.api?.visibility === 'AdminOnly' ? informationForm.adminFlow : informationForm.flow(expertMode)}
        onSubmit={(data) => {
          props.handleSubmit(data)
            .then(() => closeRightPanel())
        }}
        value={props.api || newApiQuery.data}
        options={{
          actions: {
            submit: {
              label: translate('Save')
            }
          }
        }}
      />
    </div>
  )
}
