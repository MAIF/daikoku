import { IUserSimple } from './team';
import { ISimpleSession, ITenant } from './tenant';

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

export interface IAuthContext {
  action: string;
}

export interface IStateContext {
  impersonator?: IUserSimple;
  connectedUser: IUserSimple;
  tenant: ITenant;
  isTenantAdmin: boolean;
  apiCreationPermitted: boolean;
  expertMode: boolean;
  unreadNotificationsCount: number;
  session?: ISimpleSession;
  loginAction: string;
  theme: string;
}

export interface IStateError {
  status: number;
}

export interface IAnonymousState {
  activated: boolean;
  id: string;
  date?: number;
}

export interface INavMenu {
  title?: string;
  blocks: {
    links: {
      order: number;
      links: Record<string, IMenuLink | false>;
    };
    actions?: {
      order: number;
      links: Record<
        string,
        {
          component: JSX.Element;
        }
      >;
    };
  };
}

export interface IMenuLink {
  label: string;
  action: () => void;
  className?: {
    active?: boolean;
    disabled?: boolean;
  };
  childs?: Record<string, IMenuLink>;
  visible?: boolean;
}
