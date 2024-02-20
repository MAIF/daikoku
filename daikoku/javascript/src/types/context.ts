import { IUserSimple } from './team';
import { ISimpleSession, ITenant } from './tenant';

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
  impersonator?: IUserSimple;
  connectedUser: IUserSimple;
  tenant: ITenant;
  isTenantAdmin: boolean;
  apiCreationPermitted: boolean;
  expertMode: boolean;
  unreadNotificationsCount: number;
  session: ISimpleSession;
  loginAction: string;
}

export interface IStateError {
  status: number;
}
