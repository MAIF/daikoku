import { ITeamSimple, IUser } from "./team"

export interface INotification {
  _deleted: boolean
  _id: string
  _tenant: string
  action: any
  date: string
  notificationType: string
  sender: IUser
  status: { status: string }
  team: string
}

export type SubscriptionMetadataModalProps = {
  api: string,
  closeModal: () => void;
  creationMode: boolean,
  notification: INotification,
  plan: string,
  save: (...args: any[]) => any;
  team: ITeamSimple,
  config?: any,
  subscription?: any,
  description?: any
};