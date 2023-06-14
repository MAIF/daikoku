import {ITeamSimple, ITeamVisibility, ITenant, IUserSimple} from '../../types';
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

export const login = ({
  user,
  team,
  tenant,
  language,
}: {
  user: IUserSimple;
  team: ITeamSimple;
  tenant: ITenant;
  language: string;
}) => ({
  type: LOGIN,
  user,
  team,
  tenant,
  language,
});

export const logout = () => {
  return {
    type: LOGOUT,
  };
};

export const impersonate = ({ impersonator }: any) => ({
  type: IMPERSONATE,
  impersonator,
});

export const updateTeam = (team: ITeamSimple) => ({
  type: UPDATE_TEAM,
  team,
});

export const updateNotifications = (unreadNotificationsCount: number) => ({
  type: UPDATE_NOTIFS,
  unreadNotificationsCount,
});

export const updateTenant = (tenant: ITenant) => ({
  type: UPDATE_TENANT,
  tenant,
});

export const updateUser = (user: IUserSimple) => ({
  type: UPDATE_USER,
  user,
});

export const toggleExpertMode = () => {
  return {
    type: TOGGLE_EXPERT_MODE,
  };
};
