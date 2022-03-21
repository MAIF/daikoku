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
  ({ user, team, tenant, language }) =>
  (dispatch) => {
    return dispatch({
      type: LOGIN,
      user,
      team,
      tenant,
      language,
    });
  };

export const logout = () => (dispatch) => {
  return dispatch({
    type: LOGOUT,
  });
};

export const impersonate =
  ({ impersonator }) =>
  (dispatch) => {
    return dispatch({
      type: IMPERSONATE,
      impersonator,
    });
  };

export const updateTeam = (team) => (dispatch) => {
  return dispatch({
    type: UPDATE_TEAM,
    team,
  });
};

export const updateTeamPromise = (team) => (dispatch) => {
  return Promise.resolve(
    dispatch({
      type: UPDATE_TEAM,
      team,
    })
  );
};

export const updateNotications = (unreadNotificationsCount) => (dispatch) => {
  return dispatch({
    type: UPDATE_NOTIFS,
    unreadNotificationsCount,
  });
};

export const updateTenant = (tenant) => (dispatch) => {
  return dispatch({
    type: UPDATE_TENANT,
    tenant,
  });
};

export const updateUser = (user) => (dispatch) => {
  return dispatch({
    type: UPDATE_USER,
    user,
  });
};

export const toggleExpertMode = () => (dispatch) => {
  return dispatch({
    type: TOGGLE_EXPERT_MODE,
  });
};
