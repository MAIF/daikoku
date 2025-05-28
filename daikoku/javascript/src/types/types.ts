import { IUser } from './team';
import { ITenant } from './tenant';

export type TOption = {
  value: string;
  label: string;
};
export type TOptions = Array<TOption>;

export enum Language {
  en = 'En',
  fr = 'fr',
}

export interface IStoreStateContext {
  connectedUser: any;
  tenant: ITenant;
  impersonator?: any;
  isTenantAdmin: boolean;
  apiCreationPermitted: boolean;
  expertMode: boolean;
  unreadNotificationsCount: number;
}

export interface IStoreStateError {
  status?: number;
  message?: string;
  args: Array<any>;
  response: any;
}
export interface IStoreState {
  context: IStoreStateContext;
  error: IStoreStateError;
}

export interface INotification {
  _deleted: boolean;
  _id: string;
  _tenant: string;
  action: any;
  date: string;
  notificationType: 'AcceptOnly' | 'AcceptOrReject';
  sender: { id?: string; name: string; email: string };
  status: { status: 'Pending' } | { status: 'Accepted' | 'Rejected'; date?: string };
  team: string;
}
