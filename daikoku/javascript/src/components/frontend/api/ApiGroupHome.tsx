import React, { useState, useEffect, useContext } from 'react';
import { useParams, useMatch, useNavigate } from 'react-router-dom';
import { getApolloContext } from '@apollo/client';
import { useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import {
  ApiHeader,
  ApiPricing,
  ApiDescription,
  ApiHome,
  ApiGroupApis,
  ApiDocumentation,
  ApiIssue,
  ApiPost,
} from './';
import { useApiGroupFrontOffice } from '../../../contexts';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { formatPlanType } from '../../utils/formatters';
import { INotification, isError, IState, ISubscription, ISubscriptionDemand, ITeamSimple, IUsagePlan, IUserSimple } from '../../../types';

export const ApiGroupHome = ({ }) => {
  const [apiGroup, setApiGroup] = useState<any>();
  const [subscriptions, setSubscriptions] = useState<Array<ISubscription>>([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<Array<ISubscriptionDemand>>([]);
  const [myTeams, setMyTeams] = useState<Array<ITeamSimple>>([]);
  const [ownerTeam, setOwnerTeam] = useState<ITeamSimple>();

  const params = useParams();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab');

  const connectedUser = useSelector<IState, IUserSimple>((s) => s.context.connectedUser);

  const { addMenu } = useApiGroupFrontOffice(apiGroup, ownerTeam);

  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    if (!!apiGroup && !!match) {
      const api = apiGroup.apis.find((a: any) => a._humanReadableId === match.params.apiId);
      const navigateTo = (navTab: any) => navigate(
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
                      if (api.swagger.content) navigateTo('swagger');
                    },
                    className: {
                      active: match.params.tab === 'swagger',
                      disabled: !api.swagger.content,
                    },
                  },
                  testing: {
                    label: translate('Testing'),
                    action: () => {
                      if (api.testing.enabled) navigateTo('testing');
                    },
                    className: {
                      active: match.params.tab === 'testing',
                      disabled: !api.testing.enabled,
                    },
                  },
                  news: {
                    label: translate('News'),
                    action: () => {
                      if (api.posts.length) navigateTo('news');
                    },
                    className: { active: match.params.tab === 'news', disabled: !api.posts.length },
                  },
                  issues: {
                    label: translate('Issues'),
                    action: () => {
                      if (api.issues.length) navigateTo('issues');
                    },
                    className: {
                      active: match.params.tab === 'issues' || match.params.tab === 'labels',
                      disabled: !api.issues.length,
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

    return Services.askForApiKey(apiGroup._id, team, plan._id)
      .then((result) => {
        if (isError(result)) {
          return toastr.error(translate('Error'), result.error);
        } else if (Services.isCheckoutUrl(result)) {
          window.location.href = result.checkoutUrl
        } else if (result.creation === 'done') {
          const teamName = myTeams.find((t) => t._id === result.subscription.team)!.name;
          return toastr.success(
            translate('Done'),
            translate({ key: 'subscription.plan.accepted', replacements: [planName, teamName] })
          );
        } else if (result.creation === 'waiting') {
          const teamName = myTeams.find((t) => t._id === team)!.name;
          return toastr.info(
            translate('Pending request'),
            translate({ key: 'subscription.plan.waiting', replacements: [planName, teamName] })
          );
        }
      })
      .then(() => updateSubscriptions(apiGroup));
  };

  if (!ownerTeam) {
    //FIXME: bwaaaa
    return null;
  }

  return (
    <main role="main">
      {params.tab !== 'apis' && (
        <ApiHeader
          api={apiGroup}
          ownerTeam={ownerTeam}
          connectedUser={connectedUser}
          tab={params.tab}
        />
      )}
      <div className="album py-2 col-12 min-vh-100">
        <div className="container">
          <div className="row pt-3"></div>
          {params.tab === 'apis' && !match && (
            <ApiGroupApis apiGroup={apiGroup} ownerTeam={ownerTeam} subscriptions={subscriptions} />
          )}
          {params.tab === 'apis' && match && <ApiHome groupView />}
          {params.tab === 'description' && <ApiDescription api={apiGroup} />}
          {params.tab === 'pricing' && (
            <ApiPricing
              api={apiGroup}
              myTeams={myTeams}
              ownerTeam={ownerTeam}
              subscriptions={subscriptions}
              askForApikeys={askForApikeys}
              inProgressDemands={pendingSubscriptions}
            />
          )}
          {params.tab === 'documentation' && (
            <ApiDocumentation documentation={apiGroup.documentation} getDocPage={(pageId) => Services.getApiDocPage(apiGroup._id, pageId)}/>
          )}
          {params.tab === 'issues' && (
            <ApiIssue
              api={apiGroup}
              ownerTeam={ownerTeam}
              connectedUser={connectedUser}
            />
          )}
          {params.tab === 'news' && (
            <ApiPost api={apiGroup} ownerTeam={ownerTeam} versionId={apiGroup.currentVersion} />
          )}
        </div>
      </div>
    </main>
  );
};
