import { useQuery, useQueryClient } from '@tanstack/react-query';
import merge from 'lodash/merge';
import React, { PropsWithChildren, useContext, useEffect, useState } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';

import { teamPermissions } from '../components/utils';
import { I18nContext } from '../contexts';
import * as Services from '../services/index';
import { IApi, ITeamSimple, ITenant, IUsagePlan, isError, isUsagePlan } from '../types';
import { GlobalContext } from './globalContext';
import { ModalContext } from './modalContext';
import { NavContext, navMode, officeMode, TNavContext } from './navUtils';



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

export const useApiFrontOffice = (api?: IApi, team?: ITeamSimple, plans?: IUsagePlan[]) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu, menu } = useContext(NavContext);
  const { translate } = useContext(I18nContext);
  const { openContactModal } = useContext(ModalContext);
  const { connectedUser, tenant } = useContext(GlobalContext);
  const navigate = useNavigate();
  const params = useParams();

  const userCanUpdateApi = team?.users.some(u => u.userId === connectedUser._id && u.teamPermission !== teamPermissions.user)
  const isAdminApi = api?.visibility === 'AdminOnly';
  const isApiGroup = api?.apis

  const shouldDisplayDocumentation = userCanUpdateApi || (
    !connectedUser.isGuest &&
    (
      tenant.display === 'environment' ? plans?.some(p => !!p.documentation) :
        !!api?.documentation?.pages?.length
    )
  )
  const shouldDisplayOpenApi = userCanUpdateApi || (
    !connectedUser.isGuest &&
    (
      tenant.display === 'environment' ? plans?.some(p => p.swagger?.content || p.swagger?.url) :
        (api?.swagger?.content || api?.swagger?.url)
    )
  )
  const shouldDisplayTest = userCanUpdateApi || (
    !connectedUser.isGuest &&
    (
      tenant.display === 'environment' ? plans?.some(p => !!p.testing?.enabled) :
        !!api?.testing?.enabled
    )
  )
  const shouldDisplayNews = userCanUpdateApi || (
    !connectedUser.isGuest && !!api?.posts.length
  )

  const schema = (currentTab: string) => ({
    title: api?.name,

    blocks: {
      links: {
        order: 1,
        links: {
          apis: {
            label: translate('APIs'),
            action: () => navigateTo('apis'),
            className: {
              active: currentTab === 'apis',
              disabled: !isApiGroup,
              'd-none': !isApiGroup
            },
          },
          description: {
            label: translate('Description'),
            action: () => navigateTo('description'),
            className: { active: currentTab === 'description' },
          },
          pricings: {
            label: tenant.display === 'environment' ? translate("navbar.environments.label") : translate({ key: 'Plan', plural: true }),
            action: () => navigateTo('pricing'),
            className: { active: currentTab === 'pricing' },
          },
          documentation: {
            label: translate('Documentation'),
            action: () => {
              if (shouldDisplayDocumentation) navigateTo('documentation');
            },
            className: {
              active: currentTab === 'documentation',
              disabled: !shouldDisplayDocumentation,
              'd-none': !shouldDisplayDocumentation
            },
          },
          swagger: {
            label: translate('Swagger'),
            action: () => {
              if (shouldDisplayOpenApi) navigateTo('swagger');
            },
            className: {
              active: currentTab === 'swagger',
              disabled: !shouldDisplayOpenApi,
              'd-none': !shouldDisplayOpenApi
            },
          },
          testing: {
            label: translate('Testing'),
            action: () => {
              if (shouldDisplayTest) navigateTo('testing');
            },
            className: {
              active: currentTab === 'testing',
              disabled: !shouldDisplayTest,
              'd-none': !shouldDisplayTest
            },
          },
          news: {
            label: translate('nav.section.news.label'),
            action: () => {
              if (shouldDisplayNews) navigateTo('news');
            },
            className: {
              active: currentTab === 'news',
              disabled: !shouldDisplayNews,
              'd-none': !shouldDisplayNews,
            },
          },
          issues: {
            label: translate('Issues'),
            action: () => navigateTo('issues'),
            className: {
              active: currentTab === 'issues' || currentTab === 'labels',
              disabled: isAdminApi,
              'd-none': isAdminApi
            },
          },
          subscriptions: {
            label: translate('Subscriptions'),
            action: () => navigateTo('subscriptions'),
            className: {
              active: currentTab === 'subscriptions',
              disabled: !userCanUpdateApi,
              'd-none': !userCanUpdateApi
            },
          },
        },
      },
      actions: {
        order: 2,
        links: {
          contact: {
            component: (
              <button
                className="btn btn-sm btn-outline-primary mb-2"
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
      addMenu(schema(params.tab));
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

  return { addMenu, isAdminApi, isApiGroup };
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
                label: translate({ key: 'Asset', plural: true }),
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
      setMenu(schema(match?.params['tab']!, queryTeam.data));
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
            action: () => navigateTo('internationalization'),
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
            anonymousreporting: {
              label: translate('anonymous.reporting.title'),
              action: () => navigateTo('anonymous-reports'),
              className: { active: currentTab === 'anonymous-reports' },
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
