import { CustomSubscriptionData } from '../components/frontend/modals/SubscriptionMetadataModal';
import { ITeamSimple, IUser } from './team';

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

export type SubscriptionMetadataModalProps = {
  api: string;
  creationMode?: boolean;
  plan?: string;
  save: ((sub: CustomSubscriptionData) => Promise<void>) | ((sub: CustomSubscriptionData) => void);
  team?: ITeamSimple;
  notification?: INotification;
  config?: any;
  subscription?: any;
  description?: any;
};
