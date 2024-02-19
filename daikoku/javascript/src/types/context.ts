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
  impersonator?: IUserSimple;
  connectedUser: IUserSimple;
  tenant: ITenant;
  isTenantAdmin: boolean;
  apiCreationPermitted: boolean;
  expertMode: boolean;
}

export interface IStateError {
  status: number;
}
