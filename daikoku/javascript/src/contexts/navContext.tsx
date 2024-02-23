import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import merge from 'lodash/merge';
import React, { PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';

import { api as API, Can, manage } from '../components/utils';
import { I18nContext } from '../contexts';
import * as Services from '../services/index';
import { IApi, ITeamSimple, ITenant, isError } from '../types';
import { GlobalContext } from './globalContext';
import { ModalContext } from './modalContext';
import { toast } from 'sonner';


export enum navMode {
  initial = 'INITIAL',
  api = 'API',
  apiGroup = 'API_GROUP',
  user = 'USER',
  daikoku = 'DAIKOKU',
  tenant = 'TENANT',
  team = 'TEAM',
};

export enum officeMode {
  front = 'FRONT',
  back = 'BACK',
};
const initNavContext = {
  menu: {},
  addMenu: () => { },
  setMenu: () => { },
  mode: navMode.api,
  setMode: () => { },
  office: officeMode.front,
  setOffice: () => { },
  setApi: () => { },
  setApiGroup: () => { },
  setTeam: () => { },
  setTenant: () => { },
}

type TNavContext = {
  menu: object,
  addMenu: (m: object) => void,
  setMenu: (m: object) => void,
  mode?: navMode,
  setMode: (m: navMode) => void,
  office: officeMode,
  setOffice: (o: officeMode) => void,
  api?: IApi,
  setApi: (api?: IApi) => void,
  apiGroup?: IApi,
  setApiGroup: (apigroup?: IApi) => void,
  team?: ITeamSimple,
  setTeam: (team?: ITeamSimple) => void,
  tenant?: ITenant,
  setTenant: (tenant?: ITenant) => void,
}
export const NavContext = React.createContext<TNavContext>(initNavContext);

export const NavProvider = (props: PropsWithChildren) => {
  const [mode, setMode] = useState(navMode.initial);
  const [office, setOffice] = useState(officeMode.front);

  const [menu, setMenu] = useState({});

  const [api, setApi] = useState<IApi>();
  const [apiGroup, setApiGroup] = useState<IApi>();
  const [team, setTeam] = useState<ITeamSimple>();
  const [tenant, setTenant] = useState<ITenant>();

  const addMenu = (value: object) => {
    setMenu((menu) => ({ ...merge(menu, value) }));
  };

  return (
    <NavContext.Provider
      value={{
        menu,
        addMenu,
        setMenu,
        mode,
        setMode,
        office,
        setOffice,
        api,
        setApi,
        apiGroup,
        setApiGroup,
        team,
        setTeam,
        tenant,
        setTenant,
      }}
    >
      {props.children}
    </NavContext.Provider>
  );
};

export const useApiFrontOffice = (api?: IApi, team?: ITeamSimple) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);
  const { openContactModal } = useContext(ModalContext);
  const { connectedUser, tenant } = useContext(GlobalContext);
  const navigate = useNavigate();
  const params = useParams();

  const schema = (currentTab: string) => ({
    title: api?.name,

    blocks: {
      links: {
        order: 1,
        links: {
          description: {
            label: translate('Description'),
            action: () => navigateTo('description'),
            className: { active: currentTab === 'description' },
          },
          pricings: {
            label: tenant.display === 'environment' ? translate("Environments") : translate({ key: 'Plan', plural: true }),
            action: () => navigateTo('pricing'),
            className: { active: currentTab === 'pricing' },
          },
          documentation: {
            label: translate('Documentation'),
            action: () => {
              if (api?.documentation?.pages?.length) navigateTo('documentation');
            },
            className: {
              active: currentTab === 'documentation',
              disabled: tenant.display === 'environment' || !api?.documentation?.pages?.length,
              'd-none': tenant.display === 'environment'
            },
          },
          swagger: {
            label: translate('Swagger'),
            action: () => {
              if (api?.swagger?.content || api?.swagger?.url) navigateTo('swagger');
            },
            className: {
              active: currentTab === 'swagger',
              disabled: tenant.display === 'environment' || !api?.swagger?.content && !api?.swagger?.url,
              'd-none': tenant.display === 'environment'
            },
          },
          testing: {
            label: translate('Testing'),
            action: () => {
              if (api?.testing?.enabled) navigateTo('testing');
            },
            className: {
              active: currentTab === 'testing',
              disabled: tenant.display === 'environment' || !api?.testing?.enabled,
              'd-none': tenant.display === 'environment'
            },
          },
          news: {
            label: translate('News'),
            action: () => {
              if (api?.posts?.length) navigateTo('news');
            },
            className: { active: currentTab === 'news', disabled: !api?.posts?.length },
          },
          issues: {
            label: translate('Issues'),
            action: () => navigateTo('issues'),
            className: {
              active: currentTab === 'issues' || currentTab === 'labels',
            },
          },
        },
      },
      actions: {
        order: 2,
        links: {
          edit: {
            label: translate('edit'),
            component: (
              <Can I={manage} a={API} team={team}>
                <Link
                  to={`/${team?._humanReadableId}/settings/apis/${api?._humanReadableId}/${api?.currentVersion}/infos`}
                  className="btn btn-sm btn-access-negative mb-2"
                >
                  {translate('api.configuration.btn.label')}
                </Link>
              </Can>
            ),
          },
          contact: {
            component: (
              <button
                className="btn btn-sm btn-access-negative mb-2"
                onClick={() =>
                  openContactModal({
                    name: connectedUser.name,
                    email: connectedUser.email,
                    team: api?.team,
                    api: api?._id
                  })
                }
              >
                {translate({ key: `contact.team`, replacements: [team?.name || '--'] })}
              </button>
            ),
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string) => {
    navigate(`/${team?._humanReadableId}/${api?._humanReadableId}/${api?.currentVersion}/${navTab}`);
  };

  useEffect(() => {
    if (params.tab) {
      setMenu(schema(params.tab));
    }
  }, [params.tab, api, team]);

  useEffect(() => {
    if (api && team) {
      setMode(navMode.api);
      setOffice(officeMode.front);
      setApi(api);
      setTeam(team);

      return () => {
        setMode(navMode.initial);
        setApi(undefined);
        setTeam(undefined);
        setMenu({});
      };
    }
  }, [api, team]);

  return { addMenu };
};
export const useApiGroupFrontOffice = (apigroup: any, team: any) => {
  const { setMode, setOffice, setApiGroup, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);
  const { openContactModal } = useContext(ModalContext);
  const { connectedUser, tenant } = useContext(GlobalContext);
  const navigate = useNavigate();
  const params = useParams();

  const schema = (currentTab: string) => ({
    title: apigroup?.name,

    blocks: {
      links: {
        order: 1,
        links: {
          apis: {
            label: translate('APIs'),
            action: () => navigateTo('apis'),
            className: { active: currentTab === 'apis' },
          },
          description: {
            label: translate('Description'),
            action: () => navigateTo('description'),
            className: { active: currentTab === 'description' },
          },
          pricings: {
            label: tenant.display === 'environment' ? translate("Environments") : translate({ key: 'Plan', plural: true }),
            action: () => navigateTo('pricing'),
            className: { active: currentTab === 'pricing' },
          },
          documentation: {
            label: translate('Documentation'),
            action: () => {
              if (apigroup?.documentation?.pages?.length) navigateTo('documentation');
            },
            className: {
              active: currentTab === 'documentation',
              disabled: !apigroup?.documentation?.pages?.length,
            },
          },
          news: {
            label: translate('News'),
            action: () => {
              if (apigroup?.posts?.length) 'news';
            },
            className: { active: currentTab === 'news', disabled: !apigroup?.posts?.length },
          },
          issues: {
            label: translate('Issues'),
            action: () => navigateTo('issues'),
            className: {
              active: currentTab === 'issues' || currentTab === 'labels',
            },
          },
        },
      },
      actions: {
        order: 2,
        links: {
          edit: {
            label: translate('edit'),
            component: (
              <Can I={manage} a={API} team={team}>
                <Link
                  to={`/${team?._humanReadableId}/settings/apigroups/${apigroup?._humanReadableId}/infos`}
                  className="btn btn-sm btn-access-negative mb-2"
                >
                  {translate('apis.group.configuration.btn.label')}
                </Link>
              </Can>
            ),
          },
          contact: {
            label: translate('contact'),
            component: (
              <button
                className="btn btn-sm btn-access-negative mb-2"
                onClick={() =>
                  openContactModal({
                    name: connectedUser.name,
                    email: connectedUser.email,
                    team: apigroup.team,
                    api: apigroup._id
                  })
                }
              >
                {translate({ key: `contact.team`, replacements: [team?.name] })}
              </button>
            ),
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string) => {
    navigate(`/${team._humanReadableId}/apigroups/${apigroup._humanReadableId}/${navTab}`);
  };

  useEffect(() => {
    if (params.tab) {
      setMenu(schema(params.tab));
    }
  }, [params.tab, apigroup, team]);

  useEffect(() => {
    if (apigroup && team) {
      setMode(navMode.apiGroup);
      setOffice(officeMode.front);
      setApiGroup(apigroup);
      setTeam(team);

      return () => {
        setMode(navMode.initial);
        setApiGroup(undefined);
        setTeam(undefined);
        setMenu({});
      };
    }
  }, [apigroup, team]);

  return { addMenu };
};

type TeamApiParams = {
  apiId: string
  versionId: string
  teamId: string
  tab: string
}
type TeamApiGroupParams = {
  apigroupId: string
  versionId: string
  teamId: string
  tab: string
}
export const useApiBackOffice = (creation: boolean) => {
  const { setMode, setOffice, setApi, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const { tenant } = useContext(GlobalContext);

  const navigate = useNavigate();
  const { teamId, apiId, versionId, tab } = useParams<TeamApiParams>();

  const location = useLocation();
  const newApi = location && location.state && location.state.newApi

  const queryClient = useQueryClient();
  const queries = useQueries({
    queries: [
      { queryKey: ['useApiBackOffice', 'team-backoffice', teamId], queryFn: () => Services.team(teamId!), enabled: !!teamId },
      {
        queryKey: ['useApiBackOffice', 'api', apiId, versionId, location],
        queryFn: () => Services.teamApi(teamId!, apiId!, versionId!),
        enabled: !newApi
      },
      {
        queryKey: ['useApiBackOffice', 'api', 'apiVersions', apiId, versionId, location],
        queryFn: () => Services.getAllApiVersions(teamId!, apiId!),
        enabled: !newApi
      }
    ]
  })


  const schema = (api: IApi, currentTab?: string) => ({
    title: api?.name,

    blocks: {
      links: {
        order: 2,
        links: {
          informations: {
            order: 2,
            label: translate('Informations'),
            action: () => navigateTo('infos', api),
            className: { active: currentTab === 'infos' },
          },
          plans: {
            order: 3,
            visible: !creation,
            label: tenant.display === 'environment' ? translate("navbar.environments.label") : translate('Plans'),
            action: () => navigateTo('plans', api),
            className: { active: currentTab === 'plans' },
          },
          documentation: {
            order: 4,
            visible: !creation,
            label: translate('Documentation'),
            action: () => navigateTo('documentation', api),
            className: { active: currentTab === 'documentation', 'd-none': tenant.display === 'environment' },
          },
          news: {
            order: 5,
            visible: !creation,
            label: translate('News'),
            action: () => navigateTo('news', api),
            className: { active: currentTab === 'news' },
          },
          subscriptions: {
            order: 5,
            visible: !creation,
            label: translate('Subscriptions'),
            action: () => navigateTo('subscriptions', api),
            className: { active: currentTab === 'subscriptions' },
          },
          consumptions: {
            order: 5,
            visible: !creation,
            label: translate('Consumptions'),
            action: () => navigateTo('stats', api),
            className: { active: currentTab === 'stats' },
          },
          settings: {
            order: 5,
            visible: !creation,
            label: translate('Settings'),
            action: () => navigateTo('settings', api),
            className: { active: currentTab === 'settings' },
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string, api: IApi) => {
    navigate(`/${(queries[0].data as ITeamSimple)._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/${navTab}`);
  };

  useEffect(() => {
    if (queries[1].data && !isError(queries[1].data)) {
      addMenu(schema(queries[1].data, tab));
      setMode(navMode.api);
      setOffice(officeMode.back);
    }
  }, [tab, queries[1].data]);

  useEffect(() => {
    return () => {
      setMode(navMode.initial);
      setApi(undefined);
      setMenu({});
    };
  }, []);

  const api = (queries[1].data && isError(queries[1].data)) ? undefined : queries[1].data;
  const currentTeam = (queries[0].data && isError(queries[0].data)) ? undefined : queries[0].data;
  const versions = (queries[2].data && isError(queries[2].data)) ? [] : queries[2].data || [];

  const isLoading = queries.map(q => q.isLoading).some(state => state)
  //todo: handle errors ???

  const reloadApi = () => {
    return queryClient.invalidateQueries({ queryKey: ['useApiBackOffice', 'api'] })
  }

  return { isLoading, addMenu, setApi, api, versions, reloadApi, currentTeam };
};

export const useApiGroupBackOffice = (creation: boolean) => {
  const { setMode, setOffice, setApiGroup, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const { tenant } = useContext(GlobalContext);

  const navigate = useNavigate();
  const params = useParams();
  const { teamId, apigroupId, tab } = useParams<TeamApiGroupParams>();

  const queryClient = useQueryClient();


  const queries = useQueries({
    queries: [
      { queryKey: ['useApiBackOffice', 'team-backoffice', teamId], queryFn: () => Services.team(teamId!), enabled: !!teamId },
      {
        queryKey: ['useApiGroupBackOffice', 'apigroup', apigroupId, location],
        queryFn: () => Services.teamApi(teamId!, params.apiGroupId!, '1.0.0'),
        enabled: !creation && !!teamId
      }
    ]
  })


  const schema = (apiGroup: IApi, currentTab?: string) => ({
    title: apiGroup.name,

    blocks: {
      links: {
        order: 2,
        links: {
          informations: {
            order: 2,
            label: translate('Informations'),
            action: () => navigateTo('infos', apiGroup),
            className: { active: currentTab === 'infos' },
          },
          plans: {
            order: 3,
            visible: !creation,
            label: tenant.display === 'environment' ? translate("Environments") : translate({ key: 'Plan', plural: true }),
            action: () => navigateTo('plans', apiGroup),
            className: { active: currentTab === 'plans' },
          },
          subscriptions: {
            order: 5,
            visible: !creation,
            label: translate('Subscriptions'),
            action: () => navigateTo('subscriptions', apiGroup),
            className: { active: currentTab === 'subscriptions' },
          },
          consumptions: {
            order: 5,
            visible: !creation,
            label: translate('Consumptions'),
            action: () => navigateTo('stats', apiGroup),
            className: { active: currentTab === 'stats' },
          },
          settings: {
            order: 5,
            visible: !creation,
            label: translate('Settings'),
            action: () => navigateTo('settings', apiGroup),
            className: { active: currentTab === 'settings' },
          },
        },
      },
      actions: {
        links: {
          view: {
            component: (
              <Link
                to={`/${(queries[0].data as ITeamSimple)._humanReadableId}/apigroups/${apiGroup?._humanReadableId}/apis`}
                className="btn btn-sm btn-access-negative mb-2"
              >
                {translate('View this APIs Group')}
              </Link>
            ),
          },
          back: {
            component: (
              <Link
                className="d-flex justify-content-around mt-3 align-items-center"
                style={{
                  border: 0,
                  background: 'transparent',
                  outline: 'none',
                }}
                to={`/${(queries[0].data as ITeamSimple)._humanReadableId}/settings/apis`}
              >
                <i className="fas fa-chevron-left" />
                {translate({ key: 'back.to.team', replacements: [(queries[0].data as ITeamSimple).name] })}
              </Link>
            ),
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string, apiGroup: IApi) => {
    navigate(
      `/${(queries[0].data as ITeamSimple)._humanReadableId}/settings/apigroups/${apiGroup._humanReadableId}/${navTab}`
    );
  };

  useEffect(() => {
    if (queries[1].data && !isError(queries[1].data)) {
      addMenu(schema(queries[1].data, params.tab));
      setMode(navMode.apiGroup);
      setOffice(officeMode.back);
    }
  }, [params, queries[1].data]);

  useEffect(() => {
    return () => {
      setMode(navMode.initial);
      setApiGroup(undefined);
      setMenu({});
    };
  }, [params]);

  const currentTeam = (queries[0].data && isError(queries[0].data)) ? undefined : queries[0].data;
  const apiGroup = (queries[1].data && isError(queries[1].data)) ? undefined : queries[1].data;

  const isLoading = queries.map(q => q.isLoading).some(state => state)
  const error = queries.reduce<string | undefined>((acc, q) => acc || q.error?.message, undefined)

  if (error) {
    toast.error(error)
  }

  const reloadApiGroup = () => {
    return queryClient.invalidateQueries({ queryKey: ['useApiGroupBackOffice', 'apigroup'] })
  }

  return { addMenu, setApiGroup, apiGroup, currentTeam, reloadApiGroup, isLoading };
};

export const useTeamBackOffice = () => {
  const { setMode, setOffice, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const queryClient = useQueryClient();


  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/:tab*');
  const teamId = match?.params.teamId;

  const queryTeam = useQuery({
    queryKey: ['team-backoffice', teamId],
    queryFn: () => {
      return Services.team(teamId!)
    },
    enabled: !!teamId
  })

  const schema = (currentTab: string, team: ITeamSimple) => ({
    title: team.name,
    blocks: {
      links: {
        order: 1,
        links: {
          settings: {
            label: translate('Settings'),
            action: () => navigateTo('dashboard'),
            className: {
              active: !currentTab || ['edition', 'assets', 'members'].includes(currentTab),
            },
            childs: {
              informations: {
                label: translate('Informations'),
                action: () => navigateTo('edition'),
                className: { active: currentTab === 'edition' },
              },
              assets: {
                label: translate('Assets'),
                action: () => navigateTo('assets'),
                className: { active: currentTab === 'assets' },
              },
              members: {
                label: translate({ key: 'Member', plural: true }),
                action: () => navigateTo('members'),
                visible: team.type !== 'Personal',
                className: { active: currentTab === 'members' },
              },
            },
          },
          apis: {
            label: translate('Apis'),
            action: () => navigateTo('apis'),
            className: {
              active: ['apis', 'subscriptions', 'consumptions'].includes(currentTab)
            },
          },
          apikeys: {
            label: translate({ key: 'API key', plural: true }),
            action: () => navigateTo('apikeys'),
            className: { active: ['apikeys', 'consumption'].includes(currentTab) },
            childs: {
              stats: {
                label: translate('Global stats'),
                action: () => navigateTo('consumption'),
                className: { active: currentTab === 'consumption' },
              },
            },
          },
          billing: {
            label: translate('Billing'),
            action: () => navigateTo('billing'),
            className: { active: ['billing', 'income'].includes(currentTab) },
            childs: {
              income: {
                label: translate('Income'),
                action: () => navigateTo('income'),
                className: { active: currentTab === 'income' },
              },
            },
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string) => {
    navigate(`/${(queryTeam.data as ITeamSimple)._humanReadableId}/settings/${navTab}`);
  };

  useEffect(() => {
    if (queryTeam.data && !isError(queryTeam.data)) {
      setMode(navMode.team);
      setOffice(officeMode.back);
      setTeam(queryTeam.data);
      setMenu(schema(match?.params['tab'], queryTeam.data));
    }
  }, [queryTeam.data]);

  useEffect(() => {
    return () => {
      setMode(navMode.initial);
      setTeam(undefined);
      setMenu({});
    };
  }, []);

  const reloadCurrentTeam = () => queryClient.invalidateQueries({ queryKey: ['team-backoffice'] })

  //todo handle error
  return { isLoading: queryTeam.isLoading || queryTeam.status === 'pending', error: queryTeam.error, currentTeam: queryTeam.data, addMenu, reloadCurrentTeam };
};

export const useTenantBackOffice = (maybeTenant?: ITenant) => {
  const { setMode, setOffice, addMenu, setMenu, setTenant } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const matchParent = useMatch('/settings/:tab');
  const matchSub = useMatch('/settings/:tab/:subtab');

  const match = matchParent || matchSub

  const context = useContext(GlobalContext);
  const tenant = maybeTenant || context.tenant;

  const schema = (currentTab?: string, subTab?: string) => ({
    title: tenant.name,

    blocks: {
      links: {
        order: 1,
        links: {
          settings: {
            label: translate('Settings'),
            action: () => navigateTo('settings/general'),
            className: { active: currentTab === 'settings' },
            childs: {
              general: {
                label: translate('General'),
                action: () => navigateTo('settings/general'),
                className: { active: subTab === 'general' },
              },
              custom: {
                label: translate('Customization'),
                action: () => navigateTo('settings/customization'),
                className: { active: subTab === 'customization' },
              },
              audit: {
                label: translate('Audit'),
                action: () => navigateTo('settings/audit'),
                className: { active: subTab === 'audit' },
              },
              mail: {
                label: translate('Mail'),
                action: () => navigateTo('settings/mail'),
                className: { active: subTab === 'mail' },
              },
              authentication: {
                label: translate('Authentication'),
                action: () => navigateTo('settings/authentication'),
                className: { active: subTab === 'authentication' },
              },
              bucket: {
                label: translate('Bucket'),
                action: () => navigateTo('settings/bucket'),
                className: { active: subTab === 'bucket' },
              },
              payment: {
                label: translate('Payment'),
                action: () => navigateTo('settings/payment'),
                className: { active: subTab === 'payment' },
              },
              security: {
                label: translate('Security'),
                action: () => navigateTo('settings/security'),
                className: { active: subTab === 'security' },
              },
              display: {
                label: translate('DisplayMode'),
                action: () => navigateTo('settings/display-mode'),
                className: { active: subTab === 'display-mode' },
              },
            },
          },
          message: {
            label: translate({ key: 'Message', plural: true }),
            action: () => navigateTo('messages'),
            className: { active: currentTab === 'messages' },
          },
          otoroshi: {
            label: translate({ key: 'Otoroshi instance', plural: true }),
            action: () => navigateTo('otoroshis'),
            className: { active: currentTab === 'otoroshis' },
          },
          admins: {
            label: translate('Admins'),
            action: () => navigateTo('admins'),
            className: { active: currentTab === 'admins' },
          },
          audit: {
            label: translate('Audit trail'),
            action: () => navigateTo('audit'),
            className: { active: currentTab === 'audit' },
          },
          teams: {
            label: translate('Teams'),
            action: () => navigateTo('teams'),
            className: { active: currentTab === 'teams' },
          },
          assets: {
            label: translate('Tenant assets'),
            action: () => navigateTo('assets'),
            className: { active: currentTab === 'assets' },
          },
          init: {
            label: translate('Initialization'),
            action: () => navigateTo('init'),
            className: { active: currentTab === 'init' },
          },
          internationalization: {
            label: translate('internationalization'),
            action: () => navigateTo('internationalization/mail'),
            className: { active: currentTab === 'internationalization' },
          },
          pages: {
            label: translate('Pages'),
            action: () => navigateTo('pages'),
            className: { active: currentTab === 'pages' },
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string) => {
    navigate(`/settings/${navTab}`);
  };

  useEffect(() => {
    //@ts-ignore
    setMenu(schema(match?.params.tab, match?.params.subtab));
    setMode(navMode.tenant);
    setOffice(officeMode.back);
    setTenant(tenant);

    return () => {
      setMode(navMode.initial);
      setTenant(undefined);
      setMenu({});
    };
  }, [tenant, match]);

  return { addMenu, tenant };
};

export const useDaikokuBackOffice = (props?: { creation?: boolean }) => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const navigate = useNavigate();
  const match = useMatch('/settings/:tab/*');
  const matchEdition = useMatch('/settings/tenants/:id/:tabs')

  const schema = (currentTab?: string, subTab?: string) => {
    return ({
      blocks: {
        links: {
          order: 1,
          links: {
            tenants: {
              label: translate('Tenants'),
              action: () => navigateTo('tenants'),
              className: { active: currentTab === 'tenants' },
              childs: matchEdition ? {
                general: {
                  label: translate('General'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/general`),
                  className: { active: subTab === 'general' },
                },
                custom: {
                  label: translate('Customization'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/customization`),
                  className: { active: subTab === 'customization' },
                  visible: !props?.creation
                },
                audit: {
                  label: translate('Audit'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/audit`),
                  className: { active: subTab === 'audit' },
                  visible: !props?.creation
                },
                mail: {
                  label: translate('Mail'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/mail`),
                  className: { active: subTab === 'mail' },
                  visible: !props?.creation
                },
                authentication: {
                  label: translate('Authentication'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/authentication`),
                  className: { active: subTab === 'authentication' },
                  visible: !props?.creation
                },
                bucket: {
                  label: translate('Bucket'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/bucket`),
                  className: { active: subTab === 'bucket' },
                  visible: !props?.creation
                },
                security: {
                  label: translate('Security'),
                  action: () => navigateTo(`tenants/${matchEdition.params.id}/security`),
                  className: { active: subTab === 'security' },
                  visible: !props?.creation
                },
              } : {},
            },
            users: {
              label: translate('Users'),
              action: () => navigateTo('users'),
              className: { active: currentTab === 'users' },
            },
            sessions: {
              label: translate('User sessions'),
              action: () => navigateTo('sessions'),
              className: { active: currentTab === 'sessions' },
            },
            importexport: {
              label: translate('Import / Export'),
              action: () => navigateTo('import-export'),
              className: { active: currentTab === 'import-export' },
            },
          },
        },
      }
    })
  };

  const navigateTo = (navTab: string) => {
    navigate(`/settings/${navTab}`);
  };

  useEffect(() => {
    setMode(navMode.daikoku);
    setOffice(officeMode.back);
    setMenu(schema(match?.params.tab, matchEdition?.params.tabs));

    return () => {
      setMode(navMode.initial);
      setMenu({});
    };
  }, [match, matchEdition]);

  return { addMenu };
};

export const useUserBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);

  const { connectedUser } = useContext(GlobalContext);

  const navigate = useNavigate();
  const match = useMatch('/:tab');

  const schema = (currentTab?: string) => ({
    title: connectedUser.name,

    blocks: {
      links: {
        order: 1,
        links: {
          profile: {
            label: translate('My profile'),
            action: () => navigateTo('me'),
            className: { active: currentTab === 'me' },
          },
          notification: {
            label: translate('Notifications'),
            action: () => navigateTo('notifications'),
            className: { active: currentTab === 'notifications' },
          },
        },
      },
    }
  });

  const navigateTo = (navTab: string) => {
    navigate(`/${navTab}`);
  };

  useEffect(() => {
    setMode(navMode.user);
    setOffice(officeMode.back);
    setMenu(schema(match?.params.tab));

    return () => {
      setMode(navMode.initial);
      setMenu({});
    };
  }, []);

  return { addMenu };
};
