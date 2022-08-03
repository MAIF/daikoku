import {
  LOGIN,
  LOGOUT,
  IMPERSONATE,
  UPDATE_TEAM,
  UPDATE_NOTIFS,
  UPDATE_TENANT,
  UPDATE_USER,
  TOGGLE_EXPERT_MODE,
} from './action-types';

const initialState = {
  impersonator: null,
  connectedUser: null,
  currentTeam: null,
  unreadNotificationsCount: 0,
  tenant: null,
  history: null,
  isTenantAdmin: false,
  expertMode: false,
};

export function contextReducer(state = initialState, action) {
  switch (action.type) {
    case LOGIN:
      return {
        history: state.history,
        connectedUser: action.user,
        currentTeam: action.team,
        tenant: action.tenant,
        expertMode: !!action.expertMode,
      };

    case LOGOUT:
      return { history: state.history, ...initialState };

    case IMPERSONATE:
      return { ...state, impersonator: action.impersonator };

    case UPDATE_TEAM:
      return {
        ...state,
        currentTeam: action.team,
        unreadNotificationsCount: action.unreadNotificationsCount,
      };

    case UPDATE_NOTIFS:
      return { ...state, unreadNotificationsCount: action.unreadNotificationsCount };

    case UPDATE_TENANT:
      return { ...state, tenant: action.tenant };

    case UPDATE_USER:
      return {
        ...state,
        connectedUser: action.user,
      };

    case TOGGLE_EXPERT_MODE:
      localStorage.setItem('expertMode', !state.expertMode);
      return {
        ...state,
        expertMode: !state.expertMode,
      };

    default:
      return state;
  }
}
