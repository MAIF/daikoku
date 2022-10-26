import { ITeamSimple, IUserSimple } from './team';
import { ITenant } from './tenant';

export interface IState {
  modal: IStateModal;
  context: IStateContext;
  error: IStateError;
}

export interface IStateModal {
  modalType: string;
  modalProps: any;
  open: boolean;
}

export interface IStateContext {
  impersonator: any;
  connectedUser: IUserSimple;
  currentTeam: ITeamSimple;
  unreadNotificationsCount: number;
  tenant: ITenant;
  isTenantAdmin: boolean;
  apiCreationPermitted: boolean;
  expertMode: boolean;
}

interface IStateError {}
