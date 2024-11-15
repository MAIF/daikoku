import { useQuery, useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import { GraphQLClient } from 'graphql-request';
import { useContext, useEffect } from 'react';
import Navigation from 'react-feather/dist/icons/navigation';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiDocumentation, ApiIssue, ApiPost, ApiPricing, ApiRedoc, ApiSwagger } from '.';
import { I18nContext, useApiFrontOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, ISubscription, ITeamFullGql, ITeamSimple, IUsagePlan, isError } from '../../../types';
import { ActionWithTeamSelector, Can, CanIDoAction, Option, Spinner, apikey, manage, teamGQLToSimple } from '../../utils';
import { formatPlanType } from '../../utils/formatters';
import { ApiDescription } from './Apidescription';
import { ApiHeader } from './ApiHeader';

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
        <ApiHeader api={api} ownerTeam={ownerTeam} tab={params.tab} />
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
