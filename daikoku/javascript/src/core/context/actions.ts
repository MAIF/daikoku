import {
  IMPERSONATE,
  LOGIN,
  LOGOUT,
  UPDATE_NOTIFS,
  UPDATE_TEAM,
  UPDATE_TENANT,
  UPDATE_USER,
  TOGGLE_EXPERT_MODE,
} from './';

export const login =
  ({
    user,
    team,
    tenant,
    language
  }: any) =>
    (dispatch: any) => {
      return dispatch({
        type: LOGIN,
        user,
        team,
        tenant,
        language,
      });
    };

export const logout = () => {
  return ({
    type: LOGOUT,
  });
};

export const impersonate =
  ({
    impersonator
  }: any) =>
    (dispatch: any) => {
      return dispatch({
        type: IMPERSONATE,
        impersonator,
      });
    };

export const updateTeam = (team: any) => (dispatch: any) => {
  return dispatch({
    type: UPDATE_TEAM,
    team,
  });
};

export const updateTeamPromise = (team: any) => (dispatch: any) => {
  return Promise.resolve(
    dispatch({
      type: UPDATE_TEAM,
      team,
    })
  );
};

export const updateNotifications = (unreadNotificationsCount: any) => (dispatch: any) => {
  return dispatch({
    type: UPDATE_NOTIFS,
    unreadNotificationsCount,
  });
};

export const updateTenant = (tenant: any) => (dispatch: any) => {
  return dispatch({
    type: UPDATE_TENANT,
    tenant,
  });
};

export const updateUser = (user: any) => (dispatch: any) => {
  return dispatch({
    type: UPDATE_USER,
    user,
  });
};

export const toggleExpertMode = () => {
  return {
    type: TOGGLE_EXPERT_MODE,
  };
}
