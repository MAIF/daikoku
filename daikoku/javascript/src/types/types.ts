import { ITenant } from "./tenant"

export type TOptions = Array<{
  value: string,
  label: string
}>

export enum Language {
  en = 'En',
  fr = "fr"
}

export interface IStoreStateContext {
  connectedUser: any,
  tenant: ITenant,
  impersonator?: any,
  isTenantAdmin: boolean,
  apiCreationPermitted: boolean,
  expertMode: boolean,
  unreadNotificationsCount: number
}

export interface IStoreStateError {
  status?: number,
  message?: string,
  args: Array<any>,
  response: any
}
export interface IStoreState {
  context: IStoreStateContext,
  error: IStoreStateError
}

export interface ResponseError {
  error: string
}