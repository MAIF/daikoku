import { useContext, useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { getApolloContext } from '@apollo/client';
import { useSelector, useDispatch } from 'react-redux';


import { I18nContext, updateTeamPromise, updateUser } from '../../../core';
import * as Services from '../../../services';
import { converter } from '../../../services/showdown';
import { ApiList } from '../../frontend';
import { api as API, CanIDoAction, manage, Spinner } from '../../utils';
import { IApi, IState, ITeamSimple, ITenant, IUserSimple } from '../../../types';

export const MyHome = () => {
  const [state, setState] = useState({
    apis: [],
    loading: false
  });


  const dispatch = useDispatch();
  const connectedUser = useSelector<IState, IUserSimple>(s => s.context.connectedUser)
  const tenant = useSelector<IState, ITenant>(s => s.context.tenant)
  const apiCreationPermitted = useSelector<IState, boolean>(s => s.context.apiCreationPermitted)

  const { client } = useContext(getApolloContext());

  const myTeamRequest = useQuery(['myTeams'], () => client?.query<{myTeams: Array<ITeamSimple>}>({
    query: Services.graphql.myTeams
  }))

  const teamsRequest = useQuery(['teams'], () => Services.teams())

  const location = useLocation();
  const navigate = useNavigate();

  const { translate } = useContext(I18nContext);


  const fetchData = () => {
    if (!client) {
      return; //todo handle error
    }
    setState({ ...state, loading: true });
    Promise.all([
      client.query({
        query: Services.graphql.myVisibleApis,
      })
    ]).then(
      ([
        {
          data: { visibleApis },
        },
      ]) => {
        setState({
          ...state,
          apis: visibleApis.map(({
            api,
            authorizations
          }: any) => ({ ...api, authorizations })),
          loading: false,
        });
      }
    );
  };

  useEffect(() => {
    fetchData();
  }, [connectedUser._id, location.pathname]);

  const askForApiAccess = (api: any, teams: any) =>
    Services.askForApiAccess(teams, api._id).then(() => {
      toastr.info(translate('Info'), translate({ key: 'ask.api.access.info', replacements: [api.name] }));
      fetchData();
    });

  const toggleStar = (api: any) => {
    Services.toggleStar(api._id).then((res) => {
      if (!res.error) {
        const alreadyStarred = connectedUser.starredApis.includes(api._id);

        setState({
          ...state,
          apis: state.apis.map((a) => {
            if ((a as any)._id === api._id) (a as any).stars += alreadyStarred ? -1 : 1;
            return a;
          }),
        });

        updateUser({
          ...connectedUser,
          starredApis: alreadyStarred
            ? connectedUser.starredApis.filter((id: any) => id !== api._id)
            : [...connectedUser.starredApis, api._id],
        })(dispatch);
      }
    });
  };

  const redirectToTeamPage = (team: any) => {
    navigate(`/${team._humanReadableId}`);
  };

  const redirectToApiPage = (api: any) => {
    const apiOwner = teamsRequest.data?.find((t) => (t as any)._id === api.team._id);

    const route = (version: any) => api.apis
      ? `/${apiOwner ? (apiOwner as any)._humanReadableId : api.team._id}/apigroups/${api._humanReadableId}/apis`
      : `/${apiOwner ? (apiOwner as any)._humanReadableId : api.team._id}/${api._humanReadableId}/${version}/description`;

    if (api.isDefault) navigate(route(api.currentVersion));
    else
      Services.getDefaultApiVersion(api._humanReadableId).then((res) =>
        navigate(route(res.defaultVersion))
      );
  };

  const redirectToEditPage = (api: IApi, teams: Array<ITeamSimple>, myTeams: Array<ITeamSimple>) => {
    const adminTeam = (connectedUser.isDaikokuAdmin ? teams : myTeams) //@ts-ignore //FIXME: y'a vraiment team._id ???
      .find((team) => api.team._id === team._id);

    if (adminTeam && CanIDoAction(connectedUser, manage, API, adminTeam, apiCreationPermitted)) {
      updateTeamPromise(adminTeam)(dispatch)
        .then(() => {
          const url = api.apis
            ? `/${adminTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/infos`
            : `/${adminTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`;
          navigate(url);
        });
    }
  };

  if (myTeamRequest.isLoading || teamsRequest.isLoading) {
    return (
      <Spinner />
    )
  } else if (myTeamRequest.data && teamsRequest.isSuccess) {
    return (
      <main role="main">
        <section className="organisation__header col-12 mb-4 p-3">
          <div className="container">
            <div className="row text-center">
              <div className="col-sm-4">
                <img
                  className="organisation__avatar"
                  src={tenant.logo ? tenant.logo : '/assets/images/daikoku.svg'}
                  alt="avatar"
                />
              </div>
              <div className="col-sm-7 d-flex flex-column justify-content-center">
                <h1 className="jumbotron-heading">
                  {tenant.title ? tenant.title : translate('Your APIs center')}
                </h1>
                <Description description={tenant.description} />
              </div>
            </div>
          </div>
        </section>
        <ApiList
          apis={state.apis}
          teams={teamsRequest.data}
          myTeams={myTeamRequest.data.data.myTeams}
          teamVisible={true}
          askForApiAccess={askForApiAccess}
          toggleStar={toggleStar}
          redirectToApiPage={redirectToApiPage}
          redirectToEditPage={redirectToEditPage}
          redirectToTeamPage={redirectToTeamPage}
          showTeam={true}
        />
      </main>
    );
  } else {
    //FIXME: better display of error
    return (
      <div>Error while fetching teams</div>
    )
  }

}

const Description = (props: any) => {
  const { Translation } = useContext(I18nContext);

  if (!props.description) {
    return (
      <p className="lead">
        <Translation i18nkey="Daikoku description start">Daikoku is the perfect</Translation>
        <a href="https: //www.otoroshi.io">Otoroshi</a>
        <Translation i18nkey="Daikoku description end">
          companion to manage, document, and expose your beloved APIs to your developpers community.
          Publish a new API in a few seconds
        </Translation>
      </p>
    );
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(props.description || '') }}></div>
  );
};
