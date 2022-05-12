import React, { useState, useEffect, useContext } from 'react';
import { useParams, useMatch, useNavigate } from 'react-router-dom';
import { getApolloContext } from '@apollo/client';
import { useSelector } from 'react-redux';

import { ApiPricing, ApiDescription, ApiHome, ApiGroupApis, ApiDocumentation, ApiIssue, ApiPost } from './'
import { useApiGroupFrontOffice } from '../../../contexts'
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

export const ApiGroupHome = ({ }) => {
  const [apiGroup, setApiGroup] = useState();
  const [subscriptions, setSubscriptions] = useState([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [ownerTeam, setOwnerTeam] = useState();

  const params = useParams();
  const navigate = useNavigate();
  const match = useMatch('/:teamId/apigroups/:apiGroupId/apis/:apiId/:versionId/:tab')

  const { connectedUser, tenant } = useSelector(s => s.context)

  const { addMenu } = useApiGroupFrontOffice(apiGroup, ownerTeam);

  const { client } = useContext(getApolloContext());
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {

    console.debug({ apiGroup, match, test: !!apiGroup && !!match })
    if (!!apiGroup && !!match) {
      
      const api = apiGroup.apis.find(a => a._humanReadableId === match.params.apiId)
      const navigateTo = (navTab) => navigate(`/${match.params.teamId}/apigroups/${match.params.apiGroupId}/apis/${match.params.apiId}/${match.params.versionId}/${navTab}`)
      addMenu({
        blocks: {
          links: {
            links: {
              apis: {
                childs: {
                  description: { label: translateMethod("Description"), action: () => navigateTo('description'), className: { active: match.params.tab === 'description' } },
                  documentation: { label: translateMethod("Documentation"), action: () => navigateTo('documentation'), className: { active: match.params.tab === 'documentation' } },
                  swagger: {
                    label: translateMethod("Swagger"),
                    action: () => { if(api.swagger.content) navigateTo('swagger')},
                    className: { active: match.params.tab === 'swagger', disabled: !api.swagger.content }
                  },
                  testing: {
                    label: translateMethod("Testing"),
                    action: () => {if(api.testing.enabled) navigateTo('testing')},
                    className: { active: match.params.tab === 'testing', disabled: !api.testing.enabled }
                  },
                  news: {
                    label: translateMethod("News"),
                    action: () => {if(api.posts.length) navigateTo('news')},
                    className: { active: match.params.tab === 'news', disabled: !api.posts.length }
                  },
                  issues: { 
                    label: translateMethod("Issues"), 
                    action: () => { if(api.issues.length) navigateTo('issues')}, 
                    className: { active: match.params.tab === 'issues' || match.params.tab === 'labels', disabled: !api.issues.length } }
                }
              }
            }
          }
        }
      })
    }

    return () => {
      addMenu({
        blocks: {
          links: {
            links: {
              apis: {
                childs: null
              }
            }
          }
        }
      })
    }
  }, [apiGroup, match?.params?.apiId, match?.params?.tab])


  useEffect(() => {
    client.query({
      query: Services.graphql.apiByIdsWithPlans,
      variables: { id: params.apiGroupId },
    })
      .then(({ data }) => {
        const group = data.api
        setApiGroup({ ...group, apis: group.apis.map(({ api, authorizations }) => ({ ...api, authorizations })) })
        return Promise.all([
          Services.getMySubscriptions(group._id, group.currentVersion),
          Services.team(group.team._humanReadableId),
          client.query({
            query: Services.graphql.myTeams,
          }),
        ])
      })
      .then(([s, team, t]) => {
        setTeams(t.data.myTeams)
        setOwnerTeam(team)
        setSubscriptions(s.subscriptions)
        setPendingSubscriptions(s.requests)
      })
  }, []);

  if (!ownerTeam) {
    //FIXME: bwaaaa
    return null
  }


  return (
    <div>
      {params.tab === 'apis' && !match && (
        <ApiGroupApis apiGroup={apiGroup} ownerTeam={ownerTeam} subscriptions={subscriptions} />
      )}
      {params.tab === 'apis' && match && (
        <ApiHome groupView />
      )}
      {params.tab === 'description' && (
        <ApiDescription api={apiGroup} ownerTeam={ownerTeam} />
      )}
      {params.tab === 'pricing' && (
        <ApiPricing
          connectedUser={connectedUser}
          api={apiGroup}
          myTeams={teams}
          ownerTeam={ownerTeam}
          subscriptions={subscriptions}
          askForApikeys={() => { }} //todo
          pendingSubscriptions={[]}//todo
          updateSubscriptions={() => { }}//todo
          tenant={tenant}
        />
      )}
      {params.tab === 'documentation' && (
        <ApiDocumentation api={apiGroup} ownerTeam={ownerTeam} />
      )}
      {params.tab === 'issues' && (
        <ApiIssue
          api={apiGroup}
          onChange={(editedApi) => setApi(editedApi)}
          ownerTeam={ownerTeam}
          connectedUser={connectedUser}
        />
      )}
      {params.tab === 'news' && (
        <ApiPost api={apiGroup} ownerTeam={ownerTeam} versionId={apiGroup.currentVersion} />
      )}
    </div>
  )

}