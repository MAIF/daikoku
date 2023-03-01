import { Flow, Schema, TBaseObject, Option } from '@maif/react-forms';
import {
  IApi,
  IApiKey,
  IAsset,
  INotification,
  ISafeSubscription,
  ISubscription,
  ITeamSimple,
  ITenant,
  IUserSimple,
  ResponseError,
} from '../../types';
import { IApiKeySelectModalProps } from './ApiKeySelectModal';
import { IApiSelectModalProps } from './ApiSelectModal';
import { CustomSubscriptionData } from './SubscriptionMetadataModal';

export interface IBaseModalProps {
  close: () => void;
}

export type TModalContext = {
  alert: (p: AlertModalProps) => Promise<void>;
  confirm: (p: ConfirmModalProps) => Promise<boolean>;
  prompt: (p: PromptModalProps) => Promise<string | undefined>;
  openFormModal: <T extends TBaseObject>(p: IFormModalProps<T>) => void;
  openTestingApikeyModal: (p: TestingApiKeyModalProps) => void;
  openSubMetadataModal: (p: SubscriptionMetadataModalProps) => void;
  openApiDocumentationSelectModal: (p: IApiDocumentationSelectModalProps) => void;
  openTeamSelectorModal: (p: TeamSelectorModalProps) => void;
  openInvitationTeamModal: (p: ITeamInvitationModalProps) => void;
  openSaveOrCancelModal: (p: ISaverOrCancelModalProps) => void;
  openLoginOrRegisterModal: (p: ILoginOrRegisterModalProps) => void;
  openJoinTeamModal: () => void;
  openContactModal: (p: IContactModalComponentProps) => void;
  openAssetSelectorModal: (p: IAssetSelectorModalProps) => void;
  openApiKeySelectModal: (p: IApiKeySelectModalProps) => void;
  openApiSelectModal: (p: IApiSelectModalProps) => void;
  close: () => void;
};
export type ConfirmModalProps = {
  message: JSX.Element | string | ((ok: () => void, cancel: () => void) => JSX.Element | string);
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
};

export type ConfirmProps = ConfirmModalProps & {
  cancel: () => void;
  ok: () => void;
};

export type PromptModalProps = {
  isPassword?: boolean;
  title?: string;
  value?: string;
  placeholder?: string;
  message?: string;
  cancelLabel?: string;
  okLabel?: string;
};
export type PromptProps = PromptModalProps & {
  ok: (value: string) => void;
  cancel: () => void;
};

export type AlertModalProps = {
  message: JSX.Element | string | ((close: () => void) => JSX.Element | string);
  title?: string;
  closeMessage?: string;
};

export type AlertProps = AlertModalProps & {
  close: () => void;
};

export interface IFormModalProps<T> {
  title: string;
  value?: T;
  schema: Schema;
  flow?: Flow;
  onSubmit: (x: T) => void;
  options?: Option;
  actionLabel: string;
  noClose?: boolean
}

export type TestingApiKeyModalProps = {
  title: string;
  teamId: string;
  update: boolean;
  onChange: (apiKey: IApiKey, config: any) => void;
  config: any;
  metadata: any;
};

export type SubscriptionMetadataModalProps = {
  api: string;
  creationMode?: boolean;
  plan?: string;
  save: ((sub: CustomSubscriptionData) => Promise<void>) | ((sub: CustomSubscriptionData) => void);
  team?: ITeamSimple;
  notification?: INotification;
  config?: any;
  subscription?: ISafeSubscription;
  description?: any;
  noClose?: boolean;
};

export interface IApiDocumentationSelectModalProps {
  teamId: string;
  api: IApi;
  onClose: () => void;
}

export type TeamSelectorModalProps = {
  title: string;
  description?: string;
  teams: ITeamSimple[];
  pendingTeams?: string[];
  acceptedTeams?: string[];
  action: (team: Array<string>) => void | Promise<void>;
  allTeamSelector?: boolean;
  allowMultipleDemand?: boolean;
  actionLabel: string;
};

export interface ITeamInvitationModalProps {
  members: Array<IUserSimple>;
  pendingUsers: Array<IUserSimple>;
  searchLdapMember: (key: string) => Promise<ResponseError | void>;
  invitUser: (string) => Promise<any>;
  team: ITeamSimple;
}

export interface ISaverOrCancelModalProps {
  dontsave: () => void;
  save: () => void;
  message: string;
  title: string;
}

export interface ILoginOrRegisterModalProps {
  tenant: ITenant;
  message?: string;
  showOnlyMessage?: boolean;
}

export interface IContactModalComponentProps {
  team?: string;
  api?: string;
  email?: string;
  name?: string;
}

export interface IAssetSelectorModalProps {
  assets: Array<IAsset>;
  onSelect: (asset: IAsset) => void;
  onlyPreview: boolean;
  noClose: boolean;
}
