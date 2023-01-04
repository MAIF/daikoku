import { CustomSubscriptionData } from '../contexts/modals/SubscriptionMetadataModal';
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
