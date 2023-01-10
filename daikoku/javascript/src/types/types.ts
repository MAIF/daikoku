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
  notificationType: string;
  sender: IUser;
  status: { status: string; date: string };
  team: string;
}
