import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { I18nContext } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import {
  Display,
  IApi,
  isError,
  ISubscription,
  ISubscriptionDemand,
  ITeamFullGql,
  ITeamSimple,
  IUsagePlan,
} from '../../../types';
import { Spinner, tabPanelId, Tabs, teamGQLToSimple } from '../../utils';
import {
  ApiDescription,
  ApiGroupApis,
  ApiRedoc,
  ApiTest,
  toTestingKeys,
} from '../api';
import { ApiSubscriptions } from '../api/ApiSubscriptions';
import { ApiEditorHeader } from './ApiEditorHeader';
import { DocumentationTab, EnvironmentsDocumentationTab } from './documentation/DocumentationTab';
import { EnvironmentScopedTab, EnvironmentScopedTabId } from './environments/EnvironmentScopedTab';
import { EnvironmentsTab } from './environments/EnvironmentsTab';
import { EnvironmentSwitcher } from './environments/EnvironmentSwitcher';
import { isEnvironmentScope, SHARED_ENVIRONMENT_PARAM } from './environments/sharedEnvironment';
import { AskForApikeys } from './keyRequest/ApiKeyRequestSideSheet';
import { IssuesTab } from './issues/IssuesTab';
import { NewsTab } from './news/NewsTab';
import { SubscriptionsTab } from './subscriptions/SubscriptionsTab';
import { ApiTab, useApiTabs } from './useApiTabs';

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

const SHARED_PARAMS = [SHARED_ENVIRONMENT_PARAM, 'team'];

const isEnvironmentScoped = (tab: ApiTab): tab is EnvironmentScopedTabId => tab === 'swagger' || tab === 'testing';

export const ApiEditor = () => {
  const { tenant, customGraphQLClient } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const params = useParams();
  const queryClient = useQueryClient();

  const apiQuery = useQuery({
    queryKey: ['api', params.apiId, params.versionId],
    queryFn: () => Services.getVisibleApi(params.apiId!, params.versionId!),
  });
  const api = apiQuery.data && !isError(apiQuery.data) ? apiQuery.data : undefined;

  const mySubscriptionQuery = useQuery({
    queryKey: ['mySubscription', params.apiId, params.versionId],
    queryFn: () => Services.getMySubscriptions(params.apiId!, params.versionId!),
  });

  const ownerTeamQuery = useQuery({
    queryKey: ['ownerTeam', api?.team],
    queryFn: () => Services.team(api!.team),
    enabled: !!api,
  });
  const ownerTeam = ownerTeamQuery.data && !isError(ownerTeamQuery.data) ? ownerTeamQuery.data : undefined;

  const plansQuery = useQuery({
    queryKey: ['plans', 'visible', params.apiId, params.versionId],
    queryFn: () =>
      Services.getVisiblePlans(params.apiId!, params.versionId!).then((plans) => (isError(plans) ? [] : plans)),
  });

  const myTeamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => customGraphQLClient.request<{ myTeams: Array<ITeamFullGql> }>(MY_TEAMS_QUERY),
    select: (d) => d.myTeams.map(teamGQLToSimple),
    refetchOnWindowFocus: false,
  });

  const loading =
    apiQuery.isLoading ||
    ownerTeamQuery.isLoading ||
    mySubscriptionQuery.isLoading ||
    myTeamsQuery.isLoading ||
    plansQuery.isLoading;

  if (loading) {
    return <Spinner />;
  }

  if (!api || !ownerTeam || !mySubscriptionQuery.data || !myTeamsQuery.data) {
    return (
      <main role="main" className="flex-grow-1 p-4">
        <div className="alert alert-danger">{translate('api.editor.loading.error')}</div>
      </main>
    );
  }

  document.title = `${tenant.title} - ${api.name}`;

  return (
    <ApiEditorContent
      api={api}
      ownerTeam={ownerTeam}
      myTeams={myTeamsQuery.data}
      plans={plansQuery.data ?? []}
      subscriptions={mySubscriptionQuery.data.subscriptions}
      pendingSubscriptions={mySubscriptionQuery.data.requests}
      refreshApi={() => queryClient.invalidateQueries({ queryKey: ['api'] })}
    />
  );
};

type ApiEditorContentProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  myTeams: Array<ITeamSimple>;
  plans: Array<IUsagePlan>;
  subscriptions: Array<ISubscription>;
  pendingSubscriptions: Array<ISubscriptionDemand>;
  refreshApi: () => void;
};

const ApiEditorContent = ({ api, ownerTeam, myTeams, subscriptions, pendingSubscriptions, plans, refreshApi }: ApiEditorContentProps) => {
  const { tenant } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const tabs = useApiTabs({ api, ownerTeam, plans, myTeams, myKeyCount: subscriptions.length });
  const activeTab: ApiTab = params.tab === 'labels' ? 'issues' : (params.tab as ApiTab);

  const subscribingTeams = myTeams.filter(
    (team) =>
      subscriptions.some((sub) => sub.team === team._id) ||
      pendingSubscriptions.some(
        (demand) => demand.team === team._id && ['waiting', 'inProgress'].includes(demand.state)
      )
  );

  const askForApikeys: AskForApikeys = ({ team, plan, keyringId, motivation, keyringCustomName, redirect }) =>
    (keyringId
      ? Services.extendApiKey(api._id, keyringId, team, plan._id, keyringCustomName, motivation)
      : Services.askForApiKey(api._id, team, plan._id, keyringCustomName, motivation)
    )
      .then((result) => {
        if (isError(result)) {
          toast.error(result.error);
        } else if (Services.isCheckoutUrl(result)) {
          window.location.href = result.checkoutUrl;
        } else if (Services.isCreationDone(result)) {
          toast.success(translate('subscription.created.success'));
          const teamHrId = myTeams.find((t) => t._id === team)?._humanReadableId;
          if (teamHrId && (redirect ?? true)) {
            navigate(`/${teamHrId}/${api._humanReadableId}/${api.currentVersion}/apikeys?team=${team}`);
          }
        } else if (result.creation === 'waiting') {
          const teamName = myTeams.find((t) => t._id === team)?.name;
          toast.info(translate({ key: 'subscription.plan.waiting', replacements: [plan.customName, teamName ?? ''] }));
        }
        queryClient.invalidateQueries({ queryKey: ['mySubscription'] });
        return result;
      })
      .catch(() => ({ error: translate('api.editor.key.request.failed') }));

  const saveApi = (updatedApi: IApi) =>
    Services.saveTeamApi(ownerTeam._id, updatedApi, updatedApi.currentVersion).then((response) => {
      if (isError(response)) {
        toast.error(response.error);
        return;
      }

      toast.success(translate('update.api.successful.toast.label'));
      refreshApi();
    });

  const byEnvironment = tenant.display === Display.environment;

  const tabPath = (tab: ApiTab) => {
    const shared = new URLSearchParams();
    SHARED_PARAMS.forEach((name) => {
      const value = searchParams.get(name);
      if (value) {
        shared.set(name, value);
      }
    });

    const query = shared.toString();
    return `/${params.teamId}/${params.apiId}/${params.versionId}/${tab}${query ? `?${query}` : ''}`;
  };

  if (!tabs.some((tab) => tab.id === activeTab)) {
    return <Navigate replace to={tabPath(tabs[0].id)} />;
  }

  return (
    <main role="main" className="flex-grow-1 api-editor">
      <ApiEditorHeader api={api} ownerTeam={ownerTeam} tab={activeTab} />

      <div className="api-editor__tabs">
        <Tabs
          idPrefix="api-editor"
          label={api.name}
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tab) => navigate(tabPath(tab))}
        />

        {byEnvironment && isEnvironmentScope(activeTab) && (
          <EnvironmentSwitcher api={api} ownerTeam={ownerTeam} environments={plans} scope={activeTab} />
        )}
      </div>

      <div className="api-editor__panel" role="tabpanel" id={tabPanelId('api-editor', activeTab)}>
        {activeTab === 'description' && <ApiDescription api={api} ownerTeam={ownerTeam} />}
        {activeTab === 'apis' && <ApiGroupApis apiGroup={api} />}
        {activeTab === 'pricing' && (
          <EnvironmentsTab
            api={api}
            ownerTeam={ownerTeam}
            myTeams={myTeams}
            subscriptions={subscriptions}
            pendingDemands={pendingSubscriptions}
            askForApikeys={askForApikeys}
          />
        )}
        {activeTab === 'apikeys' && (
          <ApiSubscriptions api={api} ownerTeam={ownerTeam} subscribingTeams={subscribingTeams} />
        )}
        {activeTab === 'swagger' && !byEnvironment && (
          <ApiRedoc
            save={saveApi}
            entity={api}
            ownerTeam={ownerTeam}
            swaggerUrl={`/api/teams/${api.team}/apis/${api._id}/${api.currentVersion}/swagger`}
            swaggerConf={api.swagger}
          />
        )}
        {byEnvironment && isEnvironmentScoped(activeTab) && (
          <EnvironmentScopedTab
            tab={activeTab}
            api={api}
            ownerTeam={ownerTeam}
            environments={plans}
            subscriptionKeys={toTestingKeys(subscriptions, plans, myTeams)}
          />
        )}
        {activeTab === 'subscriptions' && <SubscriptionsTab api={api} ownerTeam={ownerTeam} plans={plans} />}
        {activeTab === 'documentation' && !byEnvironment && (
          <DocumentationTab
            api={api}
            ownerTeam={ownerTeam}
            documentation={api.documentation}
            getDocPage={(pageId) => Services.getApiDocPage(api._id, pageId)}
            saveDocumentation={(documentation) =>
              Services.saveTeamApi(
                ownerTeam._id,
                {
                  ...api,
                  documentation,
                },
                api.currentVersion
              )
            }
            refresh={() => queryClient.invalidateQueries({ queryKey: ['api'] })}
            canImport
          />
        )}
        {activeTab === 'documentation' && byEnvironment && (
          <EnvironmentsDocumentationTab
            api={api}
            ownerTeam={ownerTeam}
            plans={plans}
            refresh={() => queryClient.invalidateQueries({ queryKey: ['plans'] })}
          />
        )}
        {activeTab === 'testing' && !byEnvironment && (
          <ApiTest
            key={JSON.stringify([api.swagger, api.testing])}
            _id={api._id}
            testing={api.testing}
            swagger={api.swagger}
            swaggerUrl={`/api/teams/${params.teamId}/apis/${params.apiId}/${params.versionId}/swagger`}
            callUrl={`/api/teams/${ownerTeam._id}/testing/${api._id}/call`}
            ownerTeam={ownerTeam}
            entity={api}
            save={saveApi}
            subscriptionKeys={toTestingKeys(subscriptions, plans, myTeams)}
          />
        )}
        {activeTab === 'news' && <NewsTab api={api} ownerTeam={ownerTeam} />}
        {activeTab === 'issues' && <IssuesTab api={api} ownerTeam={ownerTeam} />}
      </div>
    </main>
  );
};
