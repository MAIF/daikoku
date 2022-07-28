import React, { useContext, useEffect, useState } from 'react';
import merge from 'lodash/merge';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, useNavigate, Link, useMatch } from 'react-router-dom';

import { I18nContext, openContactModal } from '../core';
import { Can, manage, api as API } from '../components/utils';

export const navMode = {
  initial: 'INITIAL',
  api: 'API',
  apiGroup: 'API_GROUP',
  user: 'USER',
  daikoku: 'DAIKOKU',
  tenant: 'TENANT',
  team: 'TEAM',
};

export const officeMode = {
  front: 'FRONT',
  back: 'BACK',
};

export const NavContext = React.createContext();

export const NavProvider = ({ children, loginAction, loginProvider }) => {
  const [mode, setMode] = useState(navMode.initial);
  const [office, setOffice] = useState(officeMode.front);

  const [menu, setMenu] = useState({});

  const [api, setApi] = useState();
  const [apiGroup, setApiGroup] = useState();
  const [team, setTeam] = useState();
  const [tenant, setTenant] = useState();

  const addMenu = (value) => {
    setMenu((menu) => ({ ...merge(menu, value) }));
  };

  return (
    <NavContext.Provider
      value={{
        loginAction,
        loginProvider,
        menu,
        addMenu,
        setMenu,
        navMode,
        officeMode,
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
      {children}
    </NavContext.Provider>
  );
};

export const useApiFrontOffice = (api, team) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);
  const { connectedUser, tenant } = useSelector((state) => state.context);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const params = useParams();

  const schema = (currentTab) => ({
    title: api?.name,
    blocks: {
      links: {
        order: 1,
        links: {
          description: {
            label: translateMethod('Description'),
            action: () => navigateTo('description'),
            className: { active: currentTab === 'description' },
          },
          pricings: {
            label: translateMethod('Plan', true),
            action: () => navigateTo('pricing'),
            className: { active: currentTab === 'pricing' },
          },
          documentation: {
            label: translateMethod('Documentation'),
            action: () => {
              if (api?.documentation?.pages?.length) navigateTo('documentation');
            },
            className: {
              active: currentTab === 'documentation',
              disabled: !api?.documentation?.pages?.length,
            },
          },
          swagger: {
            label: translateMethod('Swagger'),
            action: () => {
              if (api?.swagger?.content || api?.swagger?.url) navigateTo('swagger');
            },
            className: {
              active: currentTab === 'swagger',
              disabled: !api?.swagger?.content && !api?.swagger?.url,
            },
          },
          testing: {
            label: translateMethod('Testing'),
            action: () => {
              if (api?.testing?.enabled) navigateTo('testing');
            },
            className: { active: currentTab === 'testing', disabled: !api?.testing?.enabled },
          },
          news: {
            label: translateMethod('News'),
            action: () => {
              if (api?.posts?.length) 'news';
            },
            className: { active: currentTab === 'news', disabled: !api?.posts?.length },
          },
          issues: {
            label: translateMethod('Issues'),
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
            label: translateMethod('edit'),
            component: (
              <Can I={manage} a={API} team={team}>
                <Link
                  to={`/${team?._humanReadableId}/settings/apis/${api?._humanReadableId}/${api?.currentVersion}/${currentTab}`}
                  className="btn btn-sm btn-access-negative mb-2"
                >
                  {translateMethod('Edit API')}
                </Link>
              </Can>
            ),
          },
          contact: {
            component: (
              <button
                className="btn btn-sm btn-access-negative mb-2"
                onClick={() =>
                  openContactModal(
                    connectedUser.name,
                    connectedUser.email,
                    tenant._id,
                    api.team,
                    api._id
                  )(dispatch)
                }
              >
                {translateMethod(`contact.team`, false, undefined, team?.name)}
              </button>
            ),
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/${navTab}`);
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
export const useApiGroupFrontOffice = (apigroup, team) => {
  const { setMode, setOffice, setApiGroup, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);
  const { connectedUser, tenant } = useSelector((state) => state.context);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const params = useParams();

  const schema = (currentTab) => ({
    title: apigroup?.name,
    blocks: {
      links: {
        order: 1,
        links: {
          apis: {
            label: translateMethod('APIs'),
            action: () => navigateTo('apis'),
            className: { active: currentTab === 'apis' },
          },
          description: {
            label: translateMethod('Description'),
            action: () => navigateTo('description'),
            className: { active: currentTab === 'description' },
          },
          pricings: {
            label: translateMethod('Plan', true),
            action: () => navigateTo('pricing'),
            className: { active: currentTab === 'pricing' },
          },
          documentation: {
            label: translateMethod('Documentation'),
            action: () => {
              if (apigroup?.documentation?.pages?.length) navigateTo('documentation');
            },
            className: {
              active: currentTab === 'documentation',
              disabled: !apigroup?.documentation?.pages?.length,
            },
          },
          news: {
            label: translateMethod('News'),
            action: () => {
              if (apigroup?.posts?.length) 'news';
            },
            className: { active: currentTab === 'news', disabled: !apigroup?.posts?.length },
          },
          issues: {
            label: translateMethod('Issues'),
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
            label: translateMethod('edit'),
            component: (
              <Can I={manage} a={API} team={team}>
                <Link
                  to={`/${team?._humanReadableId}/settings/apigroups/${apigroup?._humanReadableId}/infos`}
                  className="btn btn-sm btn-access-negative mb-2"
                >
                  {translateMethod('Edit APIs group')}
                </Link>
              </Can>
            ),
          },
          contact: {
            label: translateMethod('contact'),
            component: (
              <button
                className="btn btn-sm btn-access-negative mb-2"
                onClick={() =>
                  openContactModal(
                    connectedUser.name,
                    connectedUser.email,
                    tenant._id,
                    apigroup.team,
                    apigroup._id
                  )(dispatch)
                }
              >
                {translateMethod(`contact.team`, false, undefined, team?.name)}
              </button>
            ),
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
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

export const useApiBackOffice = (api, creation) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector((state) => state.context);

  const navigate = useNavigate();
  const params = useParams();

  const schema = (currentTab) => ({
    title: api?.name,
    blocks: {
      links: {
        order: 2,
        links: {
          informations: {
            order: 2,
            label: translateMethod('Informations'),
            action: () => navigateTo('infos'),
            className: { active: currentTab === 'infos' },
          },
          plans: {
            order: 3,
            visible: !creation,
            label: translateMethod('Plans'),
            action: () => navigateTo('plans'),
            className: { active: currentTab === 'plans' },
          },
          documentation: {
            order: 4,
            visible: !creation,
            label: translateMethod('Documentation'),
            action: () => navigateTo('documentation'),
            className: { active: currentTab === 'documentation' },
          },
          news: {
            order: 5,
            visible: !creation,
            label: translateMethod('News'),
            action: () => navigateTo('news'),
            className: { active: currentTab === 'news' },
          },
          subscriptions: {
            order: 5,
            visible: !creation,
            label: translateMethod('Subscriptions'),
            action: () => navigateTo('subscriptions'),
            className: { active: currentTab === 'subscriptions' },
          },
          consumptions: {
            order: 5,
            visible: !creation,
            label: translateMethod('Consumptions'),
            action: () => navigateTo('stats'),
            className: { active: currentTab === 'stats' },
          },
          settings: {
            order: 5,
            visible: !creation,
            label: translateMethod('Settings'),
            action: () => navigateTo('settings'),
            className: { active: currentTab === 'settings' },
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(
      `/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/${navTab}`
    );
  };

  useEffect(() => {
    addMenu(schema(params.tab));
    setMode(navMode.api);
    setOffice(officeMode.back);
    setApi(api);
    setTeam(currentTeam);
  }, [api?._id, api?.name, params]);

  useEffect(() => {
    addMenu(schema(params.tab));
    return () => {
      setMode(navMode.initial);
      setApi(undefined);
      setTeam(undefined);
      setMenu({});
    };
  }, []);

  return { addMenu, setApi };
};

export const useApiGroupBackOffice = (apiGroup, creation) => {
  const { setMode, setOffice, setApiGroup, setTeam, addMenu, setMenu, setCreation } =
    useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector((state) => state.context);

  const navigate = useNavigate();
  const params = useParams();

  const schema = (currentTab) => ({
    title: apiGroup?.name,
    blocks: {
      links: {
        order: 2,
        links: {
          informations: {
            order: 2,
            label: translateMethod('Informations'),
            action: () => navigateTo('infos'),
            className: { active: currentTab === 'infos' },
          },
          plans: {
            order: 3,
            visible: !creation,
            label: translateMethod('Plans'),
            action: () => navigateTo('plans'),
            className: { active: currentTab === 'plans' },
          },
          subscriptions: {
            order: 5,
            visible: !creation,
            label: translateMethod('Subscriptions'),
            action: () => navigateTo('subscriptions'),
            className: { active: currentTab === 'subscriptions' },
          },
          consumptions: {
            order: 5,
            visible: !creation,
            label: translateMethod('Consumptions'),
            action: () => navigateTo('stats'),
            className: { active: currentTab === 'stats' },
          },
          settings: {
            order: 5,
            visible: !creation,
            label: translateMethod('Settings'),
            action: () => navigateTo('settings'),
            className: { active: currentTab === 'settings' },
          },
        },
      },
      actions: {
        links: {
          view: {
            component: (
              <Link
                to={`/${currentTeam._humanReadableId}/apigroups/${apiGroup?._humanReadableId}/apis`}
                className="btn btn-sm btn-access-negative mb-2"
              >
                {translateMethod('View this APIs Group')}
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
                to={`/${currentTeam._humanReadableId}/settings/apis`}
              >
                <i className="fas fa-chevron-left" />
                {translateMethod(
                  'back.to.team',
                  false,
                  `Back to {props.currentTeam._humanReadableId}`,
                  currentTeam.name
                )}
              </Link>
            ),
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(
      `/${currentTeam._humanReadableId}/settings/apigroups/${apiGroup._humanReadableId}/${navTab}`
    );
  };

  useEffect(() => {
    addMenu(schema(params.tab));
    setMode(navMode.apiGroup);
    setOffice(officeMode.back);
    setApiGroup(apiGroup);
    setTeam(currentTeam);
  }, [apiGroup?._id, apiGroup?.name, params]);

  useEffect(() => {
    addMenu(schema(params.tab));
    return () => {
      setMode(navMode.initial);
      setApiGroup(undefined);
      setTeam(undefined);
      setMenu({});
    };
  }, []);

  useEffect(() => {
    setCreation(creation);
  }, [creation]);

  return { addMenu, setApiGroup };
};

export const useTeamBackOffice = (team) => {
  const { setMode, setOffice, setTeam, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector((state) => state.context);

  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/:tab*');

  const schema = (currentTab) => ({
    title: team.name,
    blocks: {
      links: {
        order: 1,
        links: {
          settings: {
            label: translateMethod('Settings'),
            action: () => navigateTo(''),
            className: {
              active: !currentTab || ['edition', 'assets', 'members'].includes(currentTab),
            },
            childs: {
              informations: {
                label: translateMethod('Informations'),
                action: () => navigateTo('edition'),
                className: { active: currentTab === 'edition' },
              },
              assets: {
                label: translateMethod('Assets'),
                action: () => navigateTo('assets'),
                className: { active: currentTab === 'assets' },
              },
              members: {
                label: translateMethod('Members'),
                action: () => navigateTo('members'),
                visible: team.type !== 'Personal',
                className: { active: currentTab === 'members' },
              },
            },
          },
          apis: {
            label: translateMethod('Apis'),
            action: () => navigateTo('apis'),
            className: { active: ['apis', 'subscriptions', 'consumptions'].includes(currentTab) },
          },
          apikeys: {
            label: translateMethod('API keys'),
            action: () => navigateTo('apikeys'),
            className: { active: ['apikeys', 'consumption'].includes(currentTab) },
            childs: {
              stats: {
                label: translateMethod('Global stats'),
                action: () => navigateTo('consumption'),
                className: { active: currentTab === 'consumption' },
              },
            },
          },
          billing: {
            label: translateMethod('Billing'),
            action: () => navigateTo('billing'),
            className: { active: ['billing', 'income'].includes(currentTab) },
            childs: {
              income: {
                label: translateMethod('Income'),
                action: () => navigateTo('income'),
                className: { active: currentTab === 'income' },
              },
            },
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(`/${currentTeam._humanReadableId}/settings/${navTab}`);
  };

  useEffect(() => {
    if (team) {
      setMode(navMode.team);
      setOffice(officeMode.back);
      setTeam(team);
      setMenu(schema(match?.params?.tab));
    }
  }, [team]);

  useEffect(() => {
    return () => {
      setMode(navMode.initial);
      setTeam(undefined);
      setMenu({});
    };
  }, []);

  return { addMenu };
};

export const useTenantBackOffice = (maybeTenant) => {
  const { setMode, setOffice, addMenu, setMenu, setTenant } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const navigate = useNavigate();
  const match = useMatch('/settings/:tab*');

  const currentTenant = useSelector((state) => state.context.tenant);
  const tenant = maybeTenant || currentTenant;

  const schema = (currentTab) => ({
    title: tenant.name,
    blocks: {
      links: {
        order: 1,
        links: {
          settings: {
            label: translateMethod('Settings'),
            action: () => navigateTo('settings'),
            className: { active: currentTab === 'settings' },
          },
          message: {
            label: translateMethod('Message', true),
            action: () => navigateTo('messages'),
            className: { active: currentTab === 'messages' },
          },
          otoroshi: {
            label: translateMethod('Otoroshi instance', true),
            action: () => navigateTo('otoroshis'),
            className: { active: currentTab === 'otoroshis' },
          },
          admins: {
            label: translateMethod('Admins'),
            action: () => navigateTo('admins'),
            className: { active: currentTab === 'admins' },
          },
          audit: {
            label: translateMethod('Audit trail'),
            action: () => navigateTo('audit'),
            className: { active: currentTab === 'audit' },
          },
          teams: {
            label: translateMethod('Teams'),
            action: () => navigateTo('teams'),
            className: { active: currentTab === 'teams' },
          },
          assets: {
            label: translateMethod('Tenant assets'),
            action: () => navigateTo('assets'),
            className: { active: currentTab === 'assets' },
          },
          init: {
            label: translateMethod('Initialization'),
            action: () => navigateTo('init'),
            className: { active: currentTab === 'init' },
          },
          internationalization: {
            label: translateMethod('Internationalization'),
            action: () => navigateTo('internationalization/mail'),
            className: { active: currentTab === 'internationalization' },
          },
          pages: {
            label: translateMethod('Pages'),
            action: () => navigateTo('pages'),
            className: { active: currentTab === 'pages' },
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(`/settings/${navTab}`);
  };

  useEffect(() => {
    setMenu(schema(match.params.tab));
    setMode(navMode.tenant);
    setOffice(officeMode.back);
    setTenant(tenant);

    return () => {
      setMode(navMode.initial);
      setTenant(undefined);
      setMenu({});
    };
  }, [tenant]);

  return { addMenu, tenant };
};

export const useDaikokuBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const navigate = useNavigate();
  const match = useMatch('/settings/:tab*');

  const schema = (currentTab) => ({
    blocks: {
      links: {
        order: 1,
        links: {
          tenants: {
            label: translateMethod('Tenants'),
            action: () => navigateTo('tenants'),
            className: { active: currentTab === 'tenants' },
          },
          users: {
            label: translateMethod('Users'),
            action: () => navigateTo('users'),
            className: { active: currentTab === 'users' },
          },
          sessions: {
            label: translateMethod('User sessions'),
            action: () => navigateTo('sessions'),
            className: { active: currentTab === 'sessions' },
          },
          importexport: {
            label: translateMethod('Import / Export'),
            action: () => navigateTo('import-export'),
            className: { active: currentTab === 'import-export' },
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(`/settings/${navTab}`);
  };

  useEffect(() => {
    setMode(navMode.daikoku);
    setOffice(officeMode.back);
    setMenu(schema(match.params.tab));

    return () => {
      setMode(navMode.initial);
      setMenu({});
    };
  }, []);

  return { addMenu };
};

export const useUserBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext);
  const { translateMethod } = useContext(I18nContext);

  const { connectedUser } = useSelector((state) => state.context);

  const navigate = useNavigate();
  const match = useMatch('/:tab');

  const schema = (currentTab) => ({
    title: connectedUser.name,
    blocks: {
      links: {
        order: 1,
        links: {
          profile: {
            label: translateMethod('My profile'),
            action: () => navigateTo('me'),
            className: { active: currentTab === 'me' },
          },
          notification: {
            label: translateMethod('Notifications'),
            action: () => navigateTo('notifications'),
            className: { active: currentTab === 'notifications' },
          },
        },
      },
    },
  });

  const navigateTo = (navTab) => {
    navigate(`/${navTab}`);
  };

  useEffect(() => {
    setMode(navMode.user);
    setOffice(officeMode.back);
    setMenu(schema(match.params.tab));

    return () => {
      setMode(navMode.initial);
      setMenu({});
    };
  }, []);

  return { addMenu };
};
