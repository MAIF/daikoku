import { constraints, Form, format, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { GraphQLClient } from 'graphql-request';
import hljs from 'highlight.js';
import { useContext, useEffect, useState } from 'react';
import More from 'react-feather/dist/icons/more-vertical';
import Navigation from 'react-feather/dist/icons/navigation';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';
import sortBy from 'lodash/sortBy';

import { ApiDocumentation, ApiIssue, ApiPost, ApiPricing, ApiRedoc, ApiSwagger } from '.';
import { I18nContext, ModalContext, useApiFrontOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { ApiState, IApi, ISubscription, ITeamFullGql, ITeamSimple, IUsagePlan, isError } from '../../../types';
import { teamApiInfoForm } from '../../backoffice/apis/TeamApiInfo';
import { api as API, ActionWithTeamSelector, Can, CanIDoAction, Option, Spinner, apikey, manage, teamGQLToSimple } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import StarsButton from './StarsButton';

import 'highlight.js/styles/monokai.css';
import { reservedCharacters } from '../../utils/tenantUtils';

(window as any).hljs = hljs;

type ApiDescriptionProps = {
  api: IApi
  ownerTeam: ITeamSimple
}
export const ApiDescription = ({
  api,
  ownerTeam
}: ApiDescriptionProps) => {

  const queryClient = useQueryClient();
  const { openRightPanel, closeRightPanel } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);


  useEffect(() => {
    (window as any).$('pre code').each((i: any, block: any) => {
      hljs.highlightElement(block);
    });
  }, []);

  return (
    <div className="d-flex col flex-column p-3 section" style={{ position: 'relative' }}>
      <div
        className="api-description"
        dangerouslySetInnerHTML={{ __html: converter.makeHtml(api.description) }}
      />
      <Can I={manage} a={API} team={ownerTeam}>
        <More
          className="a-fake"
          aria-label={translate('update.api.description.btn.label')}
          data-bs-toggle="dropdown"
          aria-expanded="false"
          id={`${api._humanReadableId}-dropdownMenuButton`}
          style={{ position: "absolute", right: 0 }} />
        <div className="dropdown-menu" aria-labelledby={`${api._humanReadableId}-dropdownMenuButton`}>
          <span
            onClick={() => openRightPanel({
              title: translate('update.api.description.panel.title'),
              content: <div>
                <Form
                  schema={{
                    description: {
                      type: type.string,
                      format: format.markdown,
                      label: translate('Description'),
                    },
                  }}
                  onSubmit={(data) => {
                    Services.saveTeamApi(ownerTeam._id, data, data.currentVersion)
                      .then(() => queryClient.invalidateQueries({ queryKey: ["api"] })) //todo: get the right keys
                      .then(() => closeRightPanel())
                      .then(() => toast.success("update.api.sucecssful.toast.label"))
                  }}
                  value={api}
                />
              </div>
            })}
            className="dropdown-item cursor-pointer"
          >
            {translate('update.api.description.btn.label')}
          </span>
        </div>
      </Can>
    </div>
  );
};

type Version = {
  label: string,
  value: string
}

type ApiHeaderProps = {
  api: IApi
  ownerTeam: ITeamSimple
  toggleStar: () => void
  tab: string
}

export const ApiHeader = ({
  api,
  ownerTeam,
  toggleStar,
  tab
}: ApiHeaderProps) => {
  const navigate = useNavigate();
  const params = useParams();

  const queryClient = useQueryClient();
  const { openRightPanel, closeRightPanel, prompt, openFormModal } = useContext(ModalContext);
  const { translate } = useContext(I18nContext);
  const { tenant, connectedUser, expertMode } = useContext(GlobalContext);

  const [versions, setApiVersions] = useState<Array<Version>>([]);

  const createNewVersion = (newVersion: string) => {
    Services.createNewApiVersion(api._humanReadableId, ownerTeam._id, newVersion)
      .then((res) => {
        if (res.error) toast.error(res.error);
        else {
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

  if (api.header) {
    const apiHeader = api.header
      .replace('{{title}}', api.name)
      .replace('{{description}}', api.smallDescription);

    return (
      <section className="api__header col-12 mb-4">
        <div
          className="api-description"
          dangerouslySetInnerHTML={{ __html: converter.makeHtml(apiHeader) }}
        />
        <button>test</button>
      </section>
    );
  } else {

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
          <h1 className="jumbotron-heading" style={{ position: 'relative' }}>
            {api.name}
            <div
              style={{ position: 'absolute', right: 0, bottom: 0 }}
              className="d-flex align-items-center"
            >
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
              <StarsButton
                stars={api.stars}
                starred={connectedUser.starredApis.includes(api._id)}
                toggleStar={toggleStar}
              />
            </div>
          </h1>
          <p className="lead">{api.smallDescription}</p>
        </div>
        <Can I={manage} a={API} team={ownerTeam}>
          <More
            className="a-fake"
            aria-label={translate("update.api.btn.label")}
            data-bs-toggle="dropdown"
            aria-expanded="false"
            id={`${api._humanReadableId}-dropdownMenuButton`}
          />
          <div className="dropdown-menu" aria-labelledby={`${api._humanReadableId}-dropdownMenuButton`}>
            <span
              onClick={() => openRightPanel({
                title: translate("update.api.form.title"),
                content: <div className="text-center">
                  <Form
                    schema={informationForm.schema}
                    flow={informationForm.flow(expertMode)} //todo: get real flow, for admin api for example
                    onSubmit={(data) => {
                      Services.saveTeamApi(ownerTeam._id, data, data.currentVersion)
                        .then(() => queryClient.invalidateQueries({ queryKey: ["api"] }))
                        .then(() => closeRightPanel())
                        .then(() => toast.success("update.api.sucecssful.toast.label"))
                    }}
                    value={api}
                  />
                </div>
              })
              }
              className="dropdown-item cursor-pointer"
            >
              {translate("update.api.btn.label")}
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
                  title: translate('create.new.api.title'),
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
              {translate("clone.api.btn.label")}
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
              {translate("new.version.api.btn.label")}
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
              {translate('api.transfer.label')}
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
              {translate('delet.api.btn.label')}
            </span>
          </div>
        </Can>
      </section>
    );
  }
};

type ApiHomeProps = {
  groupView?: boolean
}
export const ApiHome = ({
  groupView
}: ApiHomeProps) => {

  const { connectedUser, tenant, reloadContext } = useContext(GlobalContext)

  const navigate = useNavigate();
  const defaultParams = useParams();
  const apiGroupMatch = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab*');
  const params = Option(apiGroupMatch)
    .map((match: any) => match.params)
    .getOrElse(defaultParams);

  const { translate, Translation } = useContext(I18nContext);

  const queryClient = useQueryClient();
  const apiQuery = useQuery({
    queryKey: ["api", params.versionId],
    queryFn: () => Services.getVisibleApi(params.apiId, params.versionId)
  })

  const visibleApisQuery = useQuery({
    queryKey: ["api", "visibleApis"],
    queryFn: () => Services.getVisibleApi(params.apiId, params.versionId)
  })

  const mySubscriptionQuery = useQuery({
    queryKey: ["mySubscription"],
    queryFn: () => Services.getMySubscriptions(params.apiId, params.versionId)
  })

  const ownerTeamQuery = useQuery({
    queryKey: ["ownerTeam"],
    queryFn: () => Services.team((apiQuery.data as IApi).team),
    enabled: apiQuery.isSuccess && !!apiQuery.data
  })

  const graphqlEndpoint = `${window.location.origin}/api/search`;
  const customGraphQLClient = new GraphQLClient(graphqlEndpoint);

  const MY_TEAMS_QUERY = `
  query MyTeams {
    myTeams {
      name
      _humanReadableId
      _id
      tenant {
        id
      }
      type
      apiKeyVisibility
      apisCreationPermission
      verified
      users {
        user {
          userId: id
        }
        teamPermission
      }
    }
  }
`;

  const myTeamsQuery = useQuery({
    queryKey: ["myTeamsGQL"],
    queryFn: () => customGraphQLClient.request<{ myTeams: Array<ITeamFullGql> }>(MY_TEAMS_QUERY),
    select: d => d.myTeams,
    enabled: true, // Assure que la requête est activée
    refetchOnWindowFocus: false, // Désactive le refetch automatique pour tester
  });


  const { addMenu } = groupView && apiQuery.data && !isError(apiQuery) && ownerTeamQuery.data && !isError(ownerTeamQuery.data) ?
    { addMenu: () => { } } : useApiFrontOffice((apiQuery.data as IApi), (ownerTeamQuery.data as ITeamSimple));

  useEffect(() => {
    if (apiQuery.data && !isError(apiQuery.data) && myTeamsQuery.data && mySubscriptionQuery.data && !groupView) {
      const subscriptions = mySubscriptionQuery.data.subscriptions;
      const myTeams = myTeamsQuery.data;
      const api = apiQuery.data;

      const subscribingTeams = myTeams
        .filter((team) => subscriptions.some((sub) => sub.team === team._id))
        .map(teamGQLToSimple);

      const viewApiKeyLink = (
        <Can I={manage} a={apikey} teams={subscribingTeams}>
          <ActionWithTeamSelector
            title={translate('teamapi.select.title')}
            teams={subscribingTeams.filter((t) => CanIDoAction(connectedUser, manage, apikey, t))}
            action={(teams) => {
              const team = myTeams.find((t) => teams.includes(t._id));
              if (!team) {
                return;
              }
              navigate(
                `/${team._humanReadableId}/settings/apikeys/${api?._humanReadableId}/${api?.currentVersion}`
              );
            }}
            actionLabel={translate('View your api keys')}
            allTeamSelector={false}
          >
            <span className="block__entry__link">
              <Translation i18nkey="View your api keys">View your api keys</Translation>
            </span>
          </ActionWithTeamSelector>
        </Can>
      );

      addMenu({
        blocks: {
          actions: { links: { viewApiKey: { label: 'view apikey', component: viewApiKeyLink } } },
        },
      });
    }
  }, [mySubscriptionQuery.data, myTeamsQuery.data, apiQuery.data]);


  const askForApikeys = ({ team, plan, apiKey, motivation }:
    { team: string, plan: IUsagePlan, apiKey?: ISubscription, motivation?: object }) => {
    const planName = formatPlanType(plan, translate);
    const myTeams = myTeamsQuery.data || []
    const api = apiQuery.data as IApi

    if (api) {
      return (
        apiKey
          ? Services.extendApiKey(api._id, apiKey._id, team, plan._id, motivation)
          : Services.askForApiKey(api._id, team, plan._id, motivation)
      ).then((result) => {

        if (isError(result)) {
          return toast.error(result.error);
        } else if (Services.isCheckoutUrl(result)) {
          window.location.href = result.checkoutUrl
        } else if (result.creation === 'done') {
          const teamName = myTeams.find((t) => t._id === result.subscription.team)!.name;
          return toast.success(translate({ key: 'subscription.plan.accepted', replacements: [planName, teamName] }), {
            actionButtonStyle: {
              color: 'inherit',
              backgroundColor: 'inherit'
            },
            action: <Navigation size='1.5rem' className="cursor-pointer"
              onClick={() => navigate(`/${result.subscription.team}/settings/apikeys/${api._humanReadableId}/${api.currentVersion}`)} />,

          });
        } else if (result.creation === 'waiting') {
          const teamName = myTeams.find((t) => t._id === team)!.name;
          return toast.info(translate({ key: 'subscription.plan.waiting', replacements: [planName, teamName] }));
        }

      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["mySubscription"] }));
    } else {
      return Promise.reject(false)
    }
  };

  const toggleStar = (api: IApi) => {
    Services.toggleStar(api._id)
      .then(() => reloadContext());
  };

  const saveApi = (api: IApi) => {
    return (
      Promise.resolve(console.debug({ api }))
        .then(() => toast.success('Bravo'))
    )
  }

  if (
    apiQuery.isLoading ||
    mySubscriptionQuery.isLoading ||
    ownerTeamQuery.isLoading ||
    myTeamsQuery.isLoading ||
    visibleApisQuery.isLoading
  ) {
    return (
      <Spinner />
    )
  } else if (
    apiQuery.data && !isError(apiQuery.data) ||
    mySubscriptionQuery.data &&
    ownerTeamQuery.data && !isError(ownerTeamQuery.data) &&
    myTeamsQuery.data &&
    visibleApisQuery.data && !isError(visibleApisQuery.data)
  ) {
    const api = apiQuery.data as IApi;
    const ownerTeam = ownerTeamQuery.data as ITeamSimple;
    const myTeams = myTeamsQuery.data!.map(teamGQLToSimple);
    const subscriptions = mySubscriptionQuery.data!.subscriptions;
    const pendingSubscriptions = mySubscriptionQuery.data!.requests;


    document.title = `${tenant.title} - ${api ? api.name : 'API'}`;

    return (
      <main role="main">
        <ApiHeader api={api} ownerTeam={ownerTeam} toggleStar={() => toggleStar(api)} tab={params.tab} />
        <div className="album py-2 me-4 min-vh-100" style={{ position: 'relative' }}>
          <div className={classNames({
            'container-fluid': params.tab === 'swagger',
            container: params.tab !== 'swagger'
          })}>
            <div className="row pt-3">
              {params.tab === 'description' && (<ApiDescription api={api} ownerTeam={ownerTeam} />)}
              {params.tab === 'pricing' && (<ApiPricing api={api} myTeams={myTeams} ownerTeam={ownerTeam}
                subscriptions={subscriptions} askForApikeys={askForApikeys} inProgressDemands={pendingSubscriptions} />)}
              {params.tab === 'documentation' && <ApiDocumentation entity={api} ownerTeam={ownerTeam}
                documentation={api.documentation} getDocPage={(pageId) => Services.getApiDocPage(api._id, pageId)} />}
              {params.tab === 'testing' && (<ApiSwagger
                _id={api._id}
                testing={api.testing}
                swagger={api.swagger}
                swaggerUrl={`/api/teams/${params.teamId}/apis/${params.apiId}/${params.versionId}/swagger`}
                callUrl={`/api/teams/${ownerTeam._id}/testing/${api._id}/call`}
                ownerTeam={ownerTeam}
                entity={api}
                save={saveApi}
              />)}
              {params.tab === 'swagger' && (<ApiRedoc save={saveApi} entity={api} ownerTeam={ownerTeam}
                swaggerUrl={`/api/teams/${api.team}/apis/${api._id}/${api.currentVersion}/swagger`} swaggerConf={api.swagger} />)}
              {params.tab === 'news' && (<ApiPost api={api} ownerTeam={ownerTeam} versionId={params.versionId} />)}
              {(params.tab === 'issues' || params.tab === 'labels') && (<ApiIssue api={api} ownerTeam={ownerTeam} />)}
            </div>
          </div>
        </div>
      </main>);
  }

};
