import React from 'react';
import { IApi, INavMenu, ITeamSimple, ITenant } from '../types';

export enum navMode {
  initial = 'INITIAL',
  api = 'API',
  apiGroup = 'API_GROUP',
  daikoku = 'DAIKOKU',
  tenant = 'TENANT',
  team = 'TEAM',
}

export enum officeMode {
  front = 'FRONT',
  back = 'BACK',
}

const initNavContext = {
  menu: {
    blocks: {
      links: {
        order: 1,
        links: {},
      },
      actions: {
        order: 1,
        links: {},
      },
    },
  },
  addMenu: () => {},
  setMenu: () => {},
  mode: navMode.api,
  setMode: () => {},
  office: officeMode.front,
  setOffice: () => {},
  setApi: () => {},
  setApiGroup: () => {},
  setTeam: () => {},
  setTenant: () => {},
};

export type TNavContext = {
  menu: INavMenu;
  addMenu: (m: object) => void;
  setMenu: (m: INavMenu) => void;
  mode?: navMode;
  setMode: (m: navMode) => void;
  office: officeMode;
  setOffice: (o: officeMode) => void;
  api?: IApi;
  setApi: (api?: IApi) => void;
  apiGroup?: IApi;
  setApiGroup: (apigroup?: IApi) => void;
  team?: ITeamSimple;
  setTeam: (team?: ITeamSimple) => void;
  tenant?: ITenant;
  setTenant: (tenant?: ITenant) => void;
};
export const NavContext = React.createContext<TNavContext>(initNavContext);
