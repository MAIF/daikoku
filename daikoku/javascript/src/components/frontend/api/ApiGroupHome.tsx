import { getApolloContext } from '@apollo/client';
import { useContext, useEffect, useState } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import classNames from 'classnames';
import { I18nContext, useApiGroupFrontOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { IApi, IApiGQL, ISubscription, ISubscriptionDemand, ITeamSimple, IUsagePlan, isError } from '../../../types';
import { formatPlanType } from '../../utils/formatters';
import {
  ApiDescription,
  ApiDocumentation,
  ApiGroupApis,
  ApiHeader,
  ApiHome,
  ApiIssue,
  ApiPost,
  ApiPricing,
} from './';
import { apiGQLToLegitApi } from '../../utils/apiUtils';

export const ApiGroupHome = () => {
  const [apiGroup, setApiGroup] = useState<IApiGQL>();
  const [subscriptions, setSubscriptions] = useState<Array<ISubscription>>([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<Array<ISubscriptionDemand>>([]);
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);
  const [ownerTeam, setOwnerTeam] = useState<ITeamSimple>();

  const params = useParams();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab');

  const { connectedUser, tenant } = useContext(GlobalContext);

  const { addMenu } = useApiGroupFrontOffice(apiGroup, ownerTeam);

  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    if (!!apiGroup && !!match) {
      const api = apiGroup.apis.find((a: any) => a._humanReadableId === match.params.apiId);
      const navigateTo = (navTab: string) => navigate(
        `/${match.params.teamId}/apigroups/${match.params.apiGroupId}/apis/${match.params.apiId}/${match.params.versionId}/${navTab}`
      );
      addMenu({
        blocks: {
          links: {
            links: {
              apis: {
                childs: {
                  description: {
                    label: translate('Description'),
                    action: () => navigateTo('description'),
                    className: { active: match.params.tab === 'description' },
                  },
                  documentation: {
                    label: translate('Documentation'),
                    action: () => {
                      if (api?.documentation?.pages?.length) navigateTo('documentation');
                    },
                    className: {
                      active: match.params.tab === 'documentation',
                      disabled: !api?.documentation?.pages?.length,
                    },
                  },
                  swagger: {
                    label: translate('Swagger'),
                    action: () => {
                      if (api?.swagger?.content) navigateTo('swagger');
                    },
                    className: {
                      active: match.params.tab === 'swagger',
                      disabled: !api?.swagger?.content,
                    },
                  },
                  testing: {
                    label: translate('Testing'),
                    action: () => {
                      if (api?.testing?.enabled && tenant.display !== 'environment') navigateTo('testing');
                    },
                    className: {
                      active: match.params.tab === 'testing',
                      disabled: tenant.display === 'environment' || !api?.testing?.enabled,
                    },
                  },
                  news: {
                    label: translate('News'),
                    action: () => {
                      if (api?.posts.length) navigateTo('news');
                    },
                    className: { active: match.params.tab === 'news', disabled: !api?.posts.length },
                  },
                  issues: {
                    label: translate('Issues'),
                    action: () => {
                      if (api?.issues.length) navigateTo('issues');
                    },
                    className: {
                      active: match.params.tab === 'issues' || match.params.tab === 'labels',
                      disabled: !api?.issues.length,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    return () => {
      addMenu({
        blocks: {
          links: {
            links: {
              apis: {
                childs: null,
              },
            },
          },
        },
      });
    };
  }, [apiGroup, match?.params?.apiId, match?.params?.tab]);

  useEffect(() => {
    //FIXME: handle case of appolo client is not setted
    if (!client) {
      return;
    }
    client
      .query({
        query: Services.graphql.apiByIdsWithPlans,
        variables: { id: params.apiGroupId },
      })
      .then(({ data }) => {
        const group = data.api;
        setApiGroup({
          ...group,
          apis: group.apis.map(({
            api,
            authorizations
          }: any) => ({ ...api, authorizations })),
        });
        return Promise.all([
          Services.team(group.team._humanReadableId),
          client.query({
            query: Services.graphql.myTeams,
          }),
          updateSubscriptions(group),
        ]);
      })
      .then(([team, t]) => {
        if (!isError(team)) {
          setOwnerTeam(team);
        }
        setMyTeams(t.data.myTeams);
      });
  }, [params.apiGroupId]);

  const updateSubscriptions = (group: any) => {
    return Services.getMySubscriptions(group._id, group.currentVersion)
      .then((s) => {
        setSubscriptions(s.subscriptions);
        setPendingSubscriptions(s.requests);
      });
  };

  const askForApikeys = ({ team, plan }: { team: string, plan: IUsagePlan }) => {
    const planName = formatPlanType(plan, translate);

    return Services.askForApiKey(apiGroup!._id, team, plan._id)
      .then((result) => {
        if (isError(result)) {
          return toast.error(result.error);
        } else if (Services.isCheckoutUrl(result)) {
          window.location.href = result.checkoutUrl
        } else if (result.creation === 'done') {
          const teamName = myTeams.find((t) => t._id === result.subscription.team)!.name;
          return toast.success(translate({ key: 'subscription.plan.accepted', replacements: [planName, teamName] }));
        } else if (result.creation === 'waiting') {
          const teamName = myTeams.find((t) => t._id === team)!.name;
          return toast.info(translate({ key: 'subscription.plan.waiting', replacements: [planName, teamName] }));
        }
      })
      .then(() => updateSubscriptions(apiGroup));
  };

  if (!ownerTeam) {
    //FIXME: bwaaaa
    return null;
  }

  const legitApiGroup = apiGQLToLegitApi(apiGroup!, tenant)

  return (
    <main role="main">
      {params.tab !== 'apis' && (
        <ApiHeader
          api={legitApiGroup}
          ownerTeam={ownerTeam}
          tab={params.tab!}
        />
      )}
      <div className="album py-2 me-4 min-vh-100">
        <div className={classNames({
          container: params.tab !== 'apis',
          'container-fluid': params.tab === 'apis'
        })}>
          <div className="row pt-3"></div>
          {params.tab === 'apis' && !match && (
            <ApiGroupApis apiGroup={apiGroup} ownerTeam={ownerTeam} subscriptions={subscriptions} />
          )}
          {params.tab === 'apis' && match && <ApiHome groupView />}
          {params.tab === 'description' && <ApiDescription api={legitApiGroup} ownerTeam={ownerTeam}/>}
          {params.tab === 'pricing' && (
            <ApiPricing
              api={legitApiGroup}
              myTeams={myTeams}
              ownerTeam={ownerTeam}
              subscriptions={subscriptions}
              askForApikeys={askForApikeys}
              inProgressDemands={pendingSubscriptions}
            />
          )}
          {params.tab === 'documentation' && (
            <ApiDocumentation
              documentation={legitApiGroup.documentation}
              getDocPage={(pageId) => Services.getApiDocPage(legitApiGroup._id, pageId)}
              ownerTeam={ownerTeam}
              entity={legitApiGroup}
              api={legitApiGroup} />
          )}
          {params.tab === 'issues' && (
            <ApiIssue
              api={legitApiGroup}
              ownerTeam={ownerTeam}
            />
          )}
          {params.tab === 'news' && (
            <ApiPost api={legitApiGroup} ownerTeam={ownerTeam} versionId={legitApiGroup.currentVersion} />
          )}
        </div>
      </div>
    </main>
  );
};
