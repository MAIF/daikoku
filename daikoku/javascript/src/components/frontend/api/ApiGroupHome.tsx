import React, { useState, useEffect, useContext } from 'react';
import { useParams, useMatch, useNavigate } from 'react-router-dom';
import { getApolloContext } from '@apollo/client';
import { useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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

export const ApiGroupHome = ({}) => {
  const [apiGroup, setApiGroup] = useState();
  const [subscriptions, setSubscriptions] = useState([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [myTeams, setMyTeams] = useState([]);
  const [ownerTeam, setOwnerTeam] = useState();

  const params = useParams();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab');

  const { connectedUser, tenant } = useSelector((s) => (s as any).context);

  const { addMenu } = useApiGroupFrontOffice(apiGroup, ownerTeam);

  const { client } = useContext(getApolloContext());
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    if (!!apiGroup && !!match) {
      const api = (apiGroup as any).apis.find((a: any) => a._humanReadableId === match.params.apiId);
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
                    label: translateMethod('Description'),
                    action: () => navigateTo('description'),
                    className: { active: match.params.tab === 'description' },
                  },
                  documentation: {
                    label: translateMethod('Documentation'),
                    action: () => {
                      if (api?.documentation?.pages?.length) navigateTo('documentation');
                    },
                    className: {
                      active: match.params.tab === 'documentation',
                      disabled: !api?.documentation?.pages?.length,
                    },
                  },
                  swagger: {
                    label: translateMethod('Swagger'),
                    action: () => {
                      if (api.swagger.content) navigateTo('swagger');
                    },
                    className: {
                      active: match.params.tab === 'swagger',
                      disabled: !api.swagger.content,
                    },
                  },
                  testing: {
                    label: translateMethod('Testing'),
                    action: () => {
                      if (api.testing.enabled) navigateTo('testing');
                    },
                    className: {
                      active: match.params.tab === 'testing',
                      disabled: !api.testing.enabled,
                    },
                  },
                  news: {
                    label: translateMethod('News'),
                    action: () => {
                      if (api.posts.length) navigateTo('news');
                    },
                    className: { active: match.params.tab === 'news', disabled: !api.posts.length },
                  },
                  issues: {
                    label: translateMethod('Issues'),
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
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
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
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          client.query({
            query: Services.graphql.myTeams,
          }),
          updateSubscriptions(group),
        ]);
      })
      .then(([team, t]) => {
        setMyTeams(t.data.myTeams);
        setOwnerTeam(team);
      });
  }, [params.apiGroupId]);

  const updateSubscriptions = (group: any) => {
    return Services.getMySubscriptions(group._id, group.currentVersion).then((s) => {
      setSubscriptions(s.subscriptions);
      setPendingSubscriptions(s.requests);
    });
  };

  const askForApikeys = (teams: any, plan: any) => {
    const planName = formatPlanType(plan, translateMethod);

    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    return Services.askForApiKey(apiGroup._id, teams, plan._id)
      .then((results) => {
        if (results.error) {
          return toastr.error(translateMethod('Error'), results.error);
        }
        return results.forEach((result: any) => {
          if (result.error) {
            return toastr.error(translateMethod('Error'), result.error);
          } else if (result.creation === 'done') {
            const team = myTeams.find((t) => (t as any)._id === result.subscription.team);
            return toastr.success(
              translateMethod('Done'),
              translateMethod(
                'subscription.plan.accepted',
                false,
                `API key for ${planName} plan and the team ${                
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
team.name} is available`,
                planName,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                team.name
              )
            );
          } else if (result.creation === 'waiting') {
            const team = myTeams.find((t) => (t as any)._id === result.subscription.team);
            return toastr.info(
              translateMethod('Pending request'),
              translateMethod(
                'subscription.plan.waiting',
                false,
                `The API key request for ${planName} plan and the team ${                
// @ts-expect-error TS(2532): Object is possibly 'undefined'.
team.name} is pending acceptance`,
                planName,
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                team.name
              )
            );
          }
        });
      })
      .then(() => updateSubscriptions(apiGroup));
  };

  if (!ownerTeam) {
    //FIXME: bwaaaa
    return null;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <main role="main">
      {params.tab !== 'apis' && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <ApiHeader
          api={apiGroup}
          ownerTeam={ownerTeam}
          connectedUser={connectedUser}
          tab={params.tab}
        />
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="album py-2 col-12 min-vh-100">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row pt-3"></div>
          {params.tab === 'apis' && !match && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiGroupApis apiGroup={apiGroup} ownerTeam={ownerTeam} subscriptions={subscriptions} />
          )}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {params.tab === 'apis' && match && <ApiHome groupView />}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {params.tab === 'description' && <ApiDescription api={apiGroup} ownerTeam={ownerTeam} />}
          {params.tab === 'pricing' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiPricing
              connectedUser={connectedUser}
              api={apiGroup}
              myTeams={myTeams}
              ownerTeam={ownerTeam}
              subscriptions={subscriptions}
              askForApikeys={askForApikeys}
              pendingSubscriptions={pendingSubscriptions}
              tenant={tenant}
            />
          )}
          {params.tab === 'documentation' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiDocumentation api={apiGroup} ownerTeam={ownerTeam} />
          )}
          {params.tab === 'issues' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiIssue
              api={apiGroup}
              // @ts-expect-error TS(2304): Cannot find name 'setApi'.
              onChange={(editedApi: any) => setApi(editedApi)}
              ownerTeam={ownerTeam}
              connectedUser={connectedUser}
            />
          )}
          {params.tab === 'news' && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <ApiPost api={apiGroup} ownerTeam={ownerTeam} versionId={apiGroup.currentVersion} />
          )}
        </div>
      </div>
    </main>
  );
};
