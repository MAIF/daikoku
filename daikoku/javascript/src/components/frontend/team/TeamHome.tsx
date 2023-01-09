import { getApolloContext } from '@apollo/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { updateUser } from '../../../core';
import * as Services from '../../../services';
import { IApiWithAuthorization, isError, IState, IStateContext, ITeamSimple } from '../../../types';
import { Can, read, Spinner, team as TEAM } from '../../utils';
import { ApiList } from './ApiList';

export const TeamHome = () => {
  const navigate = useNavigate();
  const params = useParams();

  const dispatch = useDispatch();
  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context);

  const { client } = useContext(getApolloContext());

  const queryClient = useQueryClient();

  const queryTeam = useQuery(['team'], () => Services.team(params.teamId!));
  const queryMyTeams = useQuery(['my-team'], () => client!.query<{myTeams: Array<ITeamSimple>}>({
    query: Services.graphql.myTeams,
  }));
  const queryTeams = useQuery(['teams'], () => Services.teams());
  const queryApis = useQuery(['apis'], () => client!.query({
    query: Services.graphql.myVisibleApis,
    variables: { teamId: params.teamId },
  }));

  const askForApiAccess = (api: IApiWithAuthorization, teams: Array<string>) => {
    return Services.askForApiAccess(teams, api._id)
      .then(() => queryClient.invalidateQueries(['apis']));
  };

  const toggleStar = (api: IApiWithAuthorization) => {
    Services.toggleStar(api._id)
      .then((res) => {
        if (!isError(res)) {
          const alreadyStarred = connectedUser.starredApis.includes(api._id);
          queryClient.invalidateQueries(['apis'])

          dispatch(updateUser({
            ...connectedUser,
            starredApis: alreadyStarred
              ? connectedUser.starredApis.filter((id) => id !== api._id)
              : [...connectedUser.starredApis, api._id],
          }));
        }
      });
  };

  const redirectToApiPage = (api: IApiWithAuthorization) => {
    if (queryTeams.data && !isError(queryTeams.data)) {
      console.debug({auth: api})
      if (api.visibility === 'Public' || api.authorizations.some(a => a.authorized)) {
        const apiOwner = queryTeams.data.find((t) => t._id === api.team._id);

        const route = (version: string) => `/${apiOwner ? apiOwner._humanReadableId : api.team._id}/${api._humanReadableId}/${version}/description`;
        navigate(route(api.currentVersion));
      }
    }

  };

  const redirectToTeamPage = (team: ITeamSimple) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToEditPage = (api: IApiWithAuthorization) => {
    navigate(`/${params.teamId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`);
  };

  const redirectToTeamSettings = (team: ITeamSimple) => {
    navigate(`/${team._humanReadableId}/settings`);
  };

  if (queryApis.isLoading || queryMyTeams.isLoading || queryTeam.isLoading || queryTeams.isLoading) {
    return <Spinner />;
  } else if (queryApis.data && queryMyTeams.data && queryTeam.data && queryTeams.data) {
    if (isError(queryTeam.data) || isError(queryTeams.data)) {
      return <></> //FIXME
    }

    const team = queryTeam.data
    document.title = `${tenant.title} - ${team.name}`;

    return (
      <main role="main">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <img className="organisation__avatar" src={team.avatar || '/assets/images/daikoku.svg'} alt="avatar" />
              </div>
              <div className="col-sm-7 d-flex flex-column justify-content-center">
                <h1 className="jumbotron-heading">{team.name}</h1>
                <div className="lead">{team.description}</div>
              </div>
              <div className="col-sm-1 d-flex flex-column">
                <Can I={read} a={TEAM} team={team}>
                  <div>
                    <a href="#" className="float-right team__settings btn btn-sm btn-access-negative" onClick={() => redirectToTeamSettings(team)}>
                      <i className="fas fa-cogs" />
                    </a>
                  </div>
                </Can>
              </div>
            </div>
          </div>
        </section>
        <ApiList
          apis={queryApis.data.data.visibleApis.map(({
            api,
            authorizations
          }) => ({ ...api, authorizations }))}
          teams={queryTeams.data}
          myTeams={queryMyTeams.data.data.myTeams.map(({
            users,
            ...data
          }: any) => ({
            ...data,
            users: users.map(({
              teamPermission,
              user
            }: any) => ({ ...user, teamPermission })),
          }))}
          teamVisible={false}
          askForApiAccess={askForApiAccess}
          toggleStar={toggleStar}
          redirectToApiPage={redirectToApiPage}
          redirectToEditPage={redirectToEditPage}
          redirectToTeamPage={redirectToTeamPage}
          showTeam={false}
          team={queryTeams.data.find((team) => team._humanReadableId === params.teamId)} />
      </main>
    );
  } else {
    return <div>Error while loading team home.</div>
  }
};