import { getApolloContext } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';

import * as Services from '../../../services';
import { IApiWithAuthorization, isError, IState, IStateContext, ITeamSimple } from '../../../types';
import { Can, read, Spinner, team as TEAM } from '../../utils';
import { ApiList } from './ApiList';

export const TeamHome = () => {
  const navigate = useNavigate();
  const params = useParams();

  const { connectedUser, tenant } = useSelector<IState, IStateContext>(s => s.context);

  const { client } = useContext(getApolloContext());


  const queryTeam = useQuery({ queryKey: ['team'], queryFn: () => Services.team(params.teamId!) });
  const queryMyTeams = useQuery({
    queryKey: ['my-team'],
    queryFn: () => client!.query<{ myTeams: Array<ITeamSimple> }>({
      query: Services.graphql.myTeams,
    })
  });
  const redirectToApiPage = (apiWithAutho: IApiWithAuthorization) => {
    const api = apiWithAutho.api
    if (api.visibility === 'Public' || apiWithAutho.authorizations.some(a => a.authorized)) {
      const route = (version: string) => `/${api.team._humanReadableId}/${api._humanReadableId}/${version}/description`;
      navigate(route(api.currentVersion));
    }


  };



  const redirectToEditPage = (apiWithAutho: IApiWithAuthorization) => {
    const api = apiWithAutho.api
    navigate(`/${params.teamId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`);
  };

  const redirectToTeamSettings = (team: ITeamSimple) => {
    navigate(`/${team._humanReadableId}/settings`);
  };

  if (queryMyTeams.isLoading || queryTeam.isLoading) {
    return <Spinner />;
  } else if (queryMyTeams.data && queryTeam.data) {
    if (isError(queryTeam.data)) {
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
          redirectToApiPage={redirectToApiPage}
          redirectToEditPage={redirectToEditPage}
          teamId={params.teamId}
        />
      </main>
    );
  } else {
    return <div>Error while loading team home.</div>
  }
};