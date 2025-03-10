import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { GraphQLClient } from 'graphql-request';
import { useContext, useEffect } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiDocumentation, ApiIssue, ApiPost, ApiPricing, ApiRedoc, ApiSwagger } from '.';
import { ApiGroupApis, TeamApiConsumption, TeamApiSubscriptions, TeamPlanConsumption, read } from '../..';
import { I18nContext, ModalContext, NavContext, useApiFrontOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ISubscription, ITeamFullGql, ITeamSimple, IUsagePlan, isError } from '../../../types';
import { SimpleApiKeyCard } from '../../backoffice/apikeys/TeamApiKeysForApi';
import { Can, Option, Spinner, apikey, teamGQLToSimple } from '../../utils';
import { CmsViewer } from '../CmsViewer';
import { ApiDescription } from './ApiDescription';
import { ApiHeader } from './ApiHeader';
import { ApiSubscriptions } from './ApiSubscriptions';

type ApiHomeProps = {
  groupView?: boolean
}
export const ApiHome = ({
  groupView
}: ApiHomeProps) => {

  const { tenant } = useContext(GlobalContext);
  const { openRightPanel } = useContext(ModalContext);
  const { setApiGroup } = useContext(NavContext);

  const navigate = useNavigate();
  const defaultParams = useParams();
  const apiGroupMatch = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab*');

  const consumptionMatch = useMatch('/:teamId/:apiId/:version/consumption/plan/:planId');

  const params = Option(apiGroupMatch)
    .map((match: any) => match.params)
    .getOrElse(defaultParams);

  const { translate, Translation } = useContext(I18nContext);

  const queryClient = useQueryClient();
  const apiQuery = useQuery({
    queryKey: ["api", params.apiId, params.versionId],
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
    queryKey: ["ownerTeam", apiQuery.data],
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


  const { addMenu, isAdminApi, isApiGroup } = groupView && apiQuery.data && !isError(apiQuery) && ownerTeamQuery.data && !isError(ownerTeamQuery.data) ?
    { addMenu: () => { }, isAdminApi: false, isApiGroup: false } : useApiFrontOffice((apiQuery.data as IApi), (ownerTeamQuery.data as ITeamSimple));

  useEffect(() => {
    return () => {
      setApiGroup(undefined)
    }
  }, [])

  useEffect(() => {
    if (apiQuery.data && !isError(apiQuery.data) && myTeamsQuery.data && mySubscriptionQuery.data && ownerTeamQuery.data && !isError(ownerTeamQuery.data) && !groupView) {
      const subscriptions = mySubscriptionQuery.data.subscriptions;
      const myTeams = myTeamsQuery.data;
      const api = apiQuery.data;
      const ownerTeam = ownerTeamQuery.data

      const subscribingTeams = myTeams
        .filter((team) => subscriptions.some((sub) => sub.team === team._id))
        .map(teamGQLToSimple);

      const viewApiKeyLink = (
        <Can I={read} a={apikey} teams={subscribingTeams}>
          <span
            className="block__entry__link"
            onClick={() => navigate(`/${ownerTeam._humanReadableId}/${api?._humanReadableId}/${api?.currentVersion}/apikeys`)}>
            <Translation i18nkey="API keys">API keys</Translation>
          </span>
        </Can>
      );

      addMenu({
        blocks: {
          links: { links: { viewApiKey: { label: 'view apikey', component: viewApiKeyLink } } },
        },
      });
    }
  }, [mySubscriptionQuery.data, myTeamsQuery.data, apiQuery.data, ownerTeamQuery.data]);

  const askForApikeys = ({ team, plan, apiKey, motivation }:
    { team: string, plan: IUsagePlan, apiKey?: ISubscription, motivation?: object }) => {
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
        } else if (Services.isCreationDone(result)) {
          openRightPanel({
            title: translate('api.pricing.created.subscription.panel.title'),
            content: <SimpleApiKeyCard
              api={api!}
              plan={plan!}
              apiTeam={ownerTeamQuery.data as ITeamSimple} //FIXME: maybe better code ;)
              subscription={result.subscription}
            />
          })
        } else if (result.creation === 'waiting') {
          const teamName = myTeams.find((t) => t._id === team)!.name;
          return toast.info(translate({ key: 'subscription.plan.waiting', replacements: [plan.customName, teamName] }));
        }

      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["mySubscription"] }));
    } else {
      return Promise.reject(false)
    }
  };

  const saveApi = (api: IApi) => {
    return (
      Promise.resolve(Services.saveTeamApi((ownerTeamQuery.data as ITeamSimple)._id, api, api.currentVersion))
        .then(() => toast.success(translate('update.api.successful.toast.label')))
        .then(() => queryClient.invalidateQueries({ queryKey: ['api'] }))
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

    const subscribingTeams = myTeams
      .filter((team) => subscriptions.some((sub) => sub.team === team._id));


    document.title = `${tenant.title} - ${api ? api.name : 'API'}`;

    return (
      <main role="main">
        {api.customHeaderCmsPage ?
          <CmsViewer pageId={api.customHeaderCmsPage} fields={{ api }} /> :
          <ApiHeader api={api} ownerTeam={ownerTeam} tab={params.tab} />
        }
        <div className="album me-4 min-vh-100" style={{ position: 'relative' }}>
          <div className={classNames("p-4", {
            // 'container-fluid': params.tab === 'swagger',
            // container: params.tab !== 'swagger'
          })}>
            <div className="row">
              {params.tab === 'description' && (api.descriptionCmsPage ? <CmsViewer pageId={api.descriptionCmsPage} fields={{ api }} /> : <ApiDescription api={api} ownerTeam={ownerTeam} />)}
              {params.tab === 'apis' && (<ApiGroupApis apiGroup={api} ownerTeam={ownerTeam} />)}
              {params.tab === 'pricing' && (<ApiPricing api={api} myTeams={myTeams} ownerTeam={ownerTeam}
                subscriptions={subscriptions} askForApikeys={askForApikeys} inProgressDemands={pendingSubscriptions} />)}
              {params.tab === 'documentation' && <ApiDocumentation entity={api} ownerTeam={ownerTeam} api={api}
                documentation={api.documentation} getDocPage={(pageId) => Services.getApiDocPage(api._id, pageId)}
                refreshEntity={() => queryClient.invalidateQueries({ queryKey: ['api'] })}
                savePages={(pages) => Services.saveTeamApi(ownerTeam._id, { ...api, documentation: { ...api.documentation!, pages } }, api.currentVersion)} />}
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
              {(params.tab === 'subscriptions') && (<TeamApiSubscriptions api={api} currentTeam={ownerTeam} />)}
              {params.tab === 'consumption' && !consumptionMatch && <TeamApiConsumption api={api} currentTeam={ownerTeam} />}
              {params.tab === 'consumption' && consumptionMatch?.params.planId && (<TeamPlanConsumption api={api} currentTeam={ownerTeam} />)}
              {params.tab === 'apikeys' && (<ApiSubscriptions api={api} ownerTeam={ownerTeam} subscribingTeams={subscribingTeams} />)}

            </div>
          </div>
        </div>
      </main>);
  }
};
