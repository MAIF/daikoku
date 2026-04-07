import {useQuery} from "@tanstack/react-query";
import {useContext} from "react";
import { Link } from "react-router-dom";

import {I18nContext, useTenantBackOffice} from "../../../contexts";
import {GlobalContext} from "../../../contexts/globalContext";
import * as Services from '../../../services';
import {isError, IUserWithTeams, ITeamsWithUsers} from "../../../types";
import {Spinner} from "../../../components/utils/Spinner";


export const getInitials = (fullName: string): string | undefined => {
  if (!fullName) return "";

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 0) return;
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }

  const first = parts[0][0].toUpperCase();
  const last = parts[parts.length - 1][0].toUpperCase();

  return first + last;
}


export const UserTeamList = () => {
  const {translate} = useContext(I18nContext)
  const { tenant } = useTenantBackOffice();

  const teamsWithUsersRequest = useQuery({
    queryKey: ['tenantUsers'],
    queryFn: () => Services.userTeams(tenant._id, "",  "")
  });

  const invertTeamsToUsers = (teams : ITeamsWithUsers[]) =>{
    return teams.reduce((acc, team) => {
      const users = team.users ?? [];
      users.forEach(({ _id, name, email }) => {
        if (!acc[_id]) {
          acc[_id] =  {_id, name, email, teams: []}
        }
        acc[_id].teams.push({
          teamId: team.teamId,
          teamName : team.teamName
        });
      });
      return acc;
    }, {});
  }

  if (teamsWithUsersRequest.isLoading) {
    return <Spinner/>
  } else if (teamsWithUsersRequest.data && !isError(teamsWithUsersRequest.data)) {
    const usersWithTeams : IUserWithTeams[] = Object.values(invertTeamsToUsers(teamsWithUsersRequest.data))
    return (
      <div>
        <div className="d-flex flex-column panel modal-body">
          <div className="blocks col-12 mt-3">
            <div className="mb-3 block">
              <div className="ms-2 block__entries block__border d-flex flex-column">
                <div className="accordion accordion-flush" id="accordionFlushExample">
                {
                usersWithTeams
                  .map((user) => {
                    return (
                      <div className="accordion-item">
                        <button
                        className="accordion-button collapsed"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target={`#flush-collapse${user._id}`}
                        aria-expanded="false"
                        aria-controls={`flush-collapse${user._id}`}>
                          {user.name}
                        </button>
                        <div
                          id={`flush-collapse${user._id}`}
                          className="accordion-collapse collapse"
                          aria-labelledby="flush-headingOne"
                          data-bs-parent="#accordionFlushExample">
                            {user.teams.map( team =>
                              <Link to={`/${team.teamId}/settings/dashboard`}
                                key={team.teamId}
                                onClick={close}>
                                <div className="avatar-with-action" role='listitem' aria-labelledby={team.teamId}>
                                  <div className="container">
                                    <div className="overlay" />
                                    <div className="avatar__container">
                                      {team.teamAvatar?.includes('anonymous') || !team.teamAvatar && <div className="avatar-with-action__avatar avatar-without-img" >{getInitials(team.teamName)}</div>}
                                      {!team.teamAvatar?.includes('anonymous') && !!team.teamAvatar && <img src={team.teamAvatar} alt="avatar" className="avatar-with-action__avatar" />}
                                    </div>
                                    <div className="avatar-with-action__infos" id={team.teamId}>{team.teamName}</div>
                                  </div>
                                </div>
                              </Link>
                              )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  } else {
  return (
    <span className="alert alert-danger">{translate('oops, something went wrong.')}</span>
  )
}
}

export const UserTeamPanel = ()  => {
  const {connectedUser} = useContext(GlobalContext)

  if (connectedUser.isGuest) {
    return null;
  }
  return (
    <UserTeamList/>
  )
}
