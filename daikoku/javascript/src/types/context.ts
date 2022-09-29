import { ITeamSimple, IUserSimple } from "./team";
import { ITenant } from "./tenant";

export interface IState {
  modal: IStateModal,
  context: IStateContext,
  error: IStateError,
}

interface IStateModal {}

export interface IStateContext {
  impersonator: any,
  connectedUser: IUserSimple,
  currentTeam: ITeamSimple,
  unreadNotificationsCount: number,
  tenant: ITenant,
  isTenantAdmin: boolean,
  expertMode: boolean,
}

interface IStateError {}
