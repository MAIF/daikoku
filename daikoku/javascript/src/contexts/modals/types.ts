import { Flow, Schema, TBaseObject, Option } from '@maif/react-forms';
import {
  IApi,
  IApiKey,
  IAsset,
  IImportingDocumentation,
  INotification,
  IOtoroshiApiKey,
  ISafeSubscription,
  ISubscription,
  ISubscriptionCustomization,
  ISubscriptionDemand,
  ITeamSimple,
  ITenant,
  ITesting,
  ITestingConfig,
  IUsagePlan,
  IUserSimple,
  IWithTesting,
  ResponseDone,
  ResponseError,
} from '../../types';
import { IApiKeySelectModalProps } from './ApiKeySelectModal';
import { IApiSelectModalProps, IModalProps } from './ApiSelectModal';
import { CustomSubscriptionData } from './SubscriptionMetadataModal';
import { ICustomModalProps } from './CustomModal';
import { ReactNode } from 'react';

export interface IBaseModalProps {
  close: () => void;
}

export type IRightPanelProps = {
  title: string;
  content: JSX.Element;
};

export type TModalContext = {
  alert: (p: AlertModalProps) => Promise<void>;
  confirm: (p: ConfirmModalProps) => Promise<boolean>;
  prompt: (p: PromptModalProps) => Promise<string | undefined>;
  openFormModal: <T extends TBaseObject>(p: IFormModalProps<T>) => void;
  openTestingApikeyModal: <T extends IWithTesting>(p: TestingApiKeyModalProps<T>) => void;
  openSubMetadataModal: <T extends IWithTesting>(p: SubscriptionMetadataModalProps<T>) => void;
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
  openCustomModal: (p: ICustomModalProps) => void;
  close: () => void;
  openRightPanel: (p: IRightPanelProps) => void;
  closeRightPanel: () => void;
  rightPanelContent?: IRightPanelProps;
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
  noClose?: boolean;
  description?: ReactNode;
}

export type TestingApiKeyModalProps<T extends IWithTesting> = {
  title: string;
  teamId: string;
  update: boolean;
  onChange: (apiKey: IOtoroshiApiKey, config: ITestingConfig) => void;
  config: ITestingConfig;
  metadata: any;
  value: T;
};
type LimitedTeam = {
  _id: string;
  name?: string;
};
interface ApiSubscriptionGql extends ISubscriptionCustomization {
  _id: String;
  apiKey: {
    clientName: string;
    clientId: string;
    clientSecret: string;
  };
  plan: LimitedTeam;
  team: {
    _id: string;
    name: string;
    type: string;
  };
  createdAt: string;
  api: {
    _id: string;
  };
  customName: string;
  enabled: boolean;
  customMetadata: object;
  customMaxPerSecond?: number;
  customMaxPerDay?: number;
  customMaxPerMonth?: number;
  customReadOnly?: boolean;
  adminCustomName?: string;
}
type NotificationGQL = {
  _id: string;
  action: {
    message?: string;
    motivation?: string;
    api?: {
      _id: string;
      name: string;
    };
    team?: LimitedTeam;
    plan?: {
      _id: string;
      customName?: string;
      typeName: string;
    };
    user?: {
      id: string;
      name: string;
    };
    parentSubscriptionId?: {
      _id: string;
      apiKey: {
        clientName: string;
        clientId: string;
        clientSecret: string;
      };
    };
  };
};
export type SubscriptionMetadataModalProps<T> = {
  creationMode?: boolean;
  api?: string;
  plan?: string;
  save: ((sub: CustomSubscriptionData) => Promise<void>) | ((sub: CustomSubscriptionData) => void);
  team?: ITeamSimple | LimitedTeam;
  config?: ITestingConfig;
  subscription?: ISubscriptionCustomization;
  subscriptionDemand?: ISubscriptionDemand;
  description?: any;
  noClose?: boolean;
};

export interface IApiDocumentationSelectModalProps {
  teamId: string;
  api: IWithTesting;
  getDocumentationPages: () => Promise<ResponseError | Array<IImportingDocumentation>>;
  onClose: () => void;
  importPages: (pages: Array<string>, linked?: boolean) => Promise<ResponseError | ResponseDone>;
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
  title?: string;
  message?: string;
  showOnlyMessage?: boolean;
}

export interface IContactModalComponentProps {
  team?: string;
  api?: string;
}

export interface IAssetSelectorModalProps {
  assets: Array<IAsset>;
  onSelect: (asset: IAsset) => void;
  onlyPreview: boolean;
  noClose: boolean;
}
