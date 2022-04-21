import React, { useContext, useEffect, useState } from 'react';
import { merge } from 'lodash';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, useNavigate, Link, useMatch } from 'react-router-dom';
import _ from 'lodash';

import { I18nContext, openContactModal } from '../core'
import { Can, manage, api as API } from '../components/utils'

export const navMode = {
  initial: "INITIAL",
  api: "API",
  user: 'USER',
  daikoku: 'DAIKOKU',
  tenant: 'TENANT',
  team: "TEAM",
}

export const officeMode = {
  front: "FRONT",
  back: "BACK"
}

export const NavContext = React.createContext();

export const NavProvider = ({ children, loginAction, loginProvider }) => {
  const [mode, setMode] = useState(navMode.initial);
  const [office, setOffice] = useState(officeMode.front);

  const [menu, setMenu] = useState({});

  const [api, setApi] = useState();
  const [team, setTeam] = useState();
  const [tenant, setTenant] = useState();

  const addMenu = (value) => {
    setMenu(menu => ({ ...merge(menu, value) }))
  }

  return (
    <NavContext.Provider
      value={{
        loginAction, loginProvider,
        menu, addMenu, setMenu,
        navMode, officeMode,
        mode, setMode,
        office, setOffice,
        api, setApi,
        team, setTeam,
        tenant, setTenant
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

export const useApiFrontOffice = (api, team) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);
  const { connectedUser, tenant } = useSelector(state => state.context)
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const params = useParams();

  const schema = currentTab => ({
    title: api?.name,
    blocks: {
      links: {
        order: 1,
        links: {
          description: { label: translateMethod("Description"), action: () => navigateTo('description'), className: { active: currentTab === 'description' } },
          pricings: { label: translateMethod("Plan", true), action: () => navigateTo('pricing'), className: { active: currentTab === 'pricing' } },
          documentation: { label: translateMethod("Documentation"), action: () => navigateTo('documentation'), className: { active: currentTab === 'documentation' } },
          swagger: {
            label: translateMethod("Swagger"),
            action: () => { if (api?.swagger?.content || api?.swagger?.url) navigateTo('swagger') },
            className: { active: currentTab === 'swagger', disabled: !api?.swagger?.content && !api?.swagger?.url }
          },
          testing: {
            label: translateMethod("Testing"),
            action: () => { if (api?.testing?.enabled) navigateTo('testing') },
            className: { active: currentTab === 'testing', disabled: !api?.testing?.enabled }
          },
          news: {
            label: translateMethod("News"),
            action: () => { if (api?.posts?.length) ('news') },
            className: { active: currentTab === 'news', disabled: !api?.posts?.length }
          },
          issues: { label: translateMethod("Issues"), action: () => navigateTo('issues'), className: { active: currentTab === 'issues' || currentTab === 'labels' } }
        }
      },
      actions: {
        order: 2,
        links: {
          edit: {
            label: translateMethod("edit"),
            component: <Can I={manage} a={API} team={team}>
              <Link 
                to={`/${team?._humanReadableId}/settings/apis/${api?._humanReadableId}/${api?.currentVersion}/${currentTab}`} 
                className="btn btn-sm btn-access-negative mb-2">{translateMethod('Edit API')}</Link>
            </Can>
          },
          contact: {
            component: <button 
              className="btn btn-sm btn-access-negative mb-2"
              onClick={() => openContactModal(connectedUser.name, connectedUser.email, tenant._id, api.team, api._id)(dispatch)}>
              {translateMethod(`contact ${team?.name}`)}
            </button>
          }
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/${team._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/${navTab}`)
  }

  useEffect(() => {
    if (params.tab) {
      setMenu(schema(params.tab))
    }
  }, [params.tab, api, team])

  useEffect(() => {
    if (api && team) {
      setMode(navMode.api)
      setOffice(officeMode.front)
      setApi(api)
      setTeam(team)

      return () => {
        setMode(navMode.initial)
        setApi(undefined)
        setTeam(undefined)
        setMenu({})
      }
    }
  }, [api, team])

  return { addMenu };
}

export const useApiBackOffice = (api) => {
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector(state => state.context)

  const navigate = useNavigate();
  const params = useParams();

  const schema = currentTab => ({
    title: api?.name,
    blocks: {
      links: {
        order: 2,
        links: {
          informations: { order: 2, label: translateMethod("Informations"), action: () => navigateTo('infos'), className: { active: currentTab === 'infos' } },
          plans: { order: 3, label: translateMethod("Plans"), action: () => navigateTo('plans'), className: { active: currentTab === 'plans' } },
          documentation: { order: 4, label: translateMethod("Documentation"), action: () => navigateTo('documentation'), className: { active: currentTab === 'documentation' } },
          news: { order: 5, label: translateMethod("News"), action: () => navigateTo('news'), className: { active: currentTab === 'news' } },
          subscriptions: { order: 5, label: translateMethod("API Subscriptions"), action: () => navigateTo('subscriptions'), className: { active: currentTab === 'subscriptions' } },
          consumptions: { order: 5, label: translateMethod("Consumptions"), action: () => navigateTo('stats'), className: { active: currentTab === 'stats' } },
          settings: { order: 5, label: translateMethod("Settings"), action: () => navigateTo('settings'), className: { active: currentTab === 'settings' } },
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/${navTab}`)
  }

  useEffect(() => {
      addMenu(schema(params.tab))
      setMode(navMode.api)
      setOffice(officeMode.back)
      setApi(api)
      setTeam(currentTeam)
  }, [api?._id])

  useEffect(() => {
    return () => {
      setMode(navMode.initial)
      setApi(undefined)
      setTeam(undefined)
      setMenu({})
    }
  }, [])
  

  return { addMenu };
}

export const useTeamBackOffice = (team) => {
  const { setMode, setOffice, setTeam, addMenu, setMenu } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector(state => state.context)

  const navigate = useNavigate();
  const match = useMatch('/:teamId/settings/:tab*')

  const schema = currentTab => ({
    title: team.name,
    blocks: {
      links: {
        order: 1,
        links: {
          settings: {
            label: translateMethod("Settings"),
            action: () => navigateTo(''),
            className: { active: !currentTab || ['edition', 'assets', 'members'].includes(currentTab) },
            childs: {
              informations: { label: translateMethod("Informations"), action: () => navigateTo('edition'), className: { active: currentTab === 'edition' } },
              assets: { label: translateMethod("Assets"), action: () => navigateTo('assets'), className: { active: currentTab === 'assets' } },
              members: { label: translateMethod("Members"), action: () => navigateTo('members'), className: { active: currentTab === 'members' } },
            }
          },
          apis: {
            label: translateMethod("Apis"),
            action: () => navigateTo('apis'),
            className: { active: ['apis', 'subscriptions', 'consumptions'].includes(currentTab) },
          },
          apikeys: {
            label: translateMethod("API keys"),
            action: () => navigateTo('apikeys'),
            className: { active: ['apikeys', 'consumption'].includes(currentTab) },
            childs: {
              stats: { label: translateMethod("Global stats"), action: () => navigateTo('consumption'), className: { active: currentTab === 'consumption' } }
            }
          },
          billing: {
            label: translateMethod("Billing"),
            action: () => navigateTo('billing'),
            className: { active: ['billing', 'income'].includes(currentTab) },
            childs: {
              income: { label: translateMethod("Income"), action: () => navigateTo('income'), className: { active: currentTab === 'income' } }
            }
          },
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/${currentTeam._humanReadableId}/settings/${navTab}`)
  }

  useEffect(() => {
    if (team) {
      setMode(navMode.team)
      setOffice(officeMode.back)
      setTeam(team)
      setMenu(schema(match?.params?.tab))
    }
    
  }, [team])

  useEffect(() => {
    return () => {
      setMode(navMode.initial)
      setTeam(undefined)
      setMenu({})
    }
  }, [])
  
  

  return { addMenu };
}

export const useTenantBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu, setTenant } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);

  const navigate = useNavigate();
  const match = useMatch('/settings/:tab*');

  const tenant = useSelector(state => state.context.tenant)

  const schema = currentTab => ({
    title: tenant.name,
    blocks: {
      links: {
        order: 1,
        links: {
          settings: { label: translateMethod("Settings"), action: () => navigateTo('settings'), className: { active: currentTab === 'settings' } },
          message: { label: translateMethod("Message", true), action: () => navigateTo('messages'), className: { active: currentTab === 'messages' } },
          otoroshi: { label: translateMethod("Otoroshi instance", true), action: () => navigateTo('otoroshis'), className: { active: currentTab === 'otoroshis' } },
          admins: { label: translateMethod("Admins"), action: () => navigateTo('admins'), className: { active: currentTab === 'admins' } },
          audit: { label: translateMethod("Audit trail"), action: () => navigateTo('audit'), className: { active: currentTab === 'audit' } },
          teams: { label: translateMethod("Teams"), action: () => navigateTo('teams'), className: { active: currentTab === 'teams' } },
          assets: { label: translateMethod("Tenant assets"), action: () => navigateTo('assets'), className: { active: currentTab === 'assets' } },
          init: { label: translateMethod("Initialization"), action: () => navigateTo('init'), className: { active: currentTab === 'init' } },
          internationalization: { label: translateMethod("Internationalization"), action: () => navigateTo('internationalization/mail'), className: { active: currentTab === 'internationalization' } },
          pages: { label: translateMethod("Pages"), action: () => navigateTo('pages'), className: { active: currentTab === 'pages' } },
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/settings/${navTab}`)
  }

  // useEffect(() => {
  //   if (match.params.tab && !_.isEmpty(menu)) {
  //     addMenu(schema(match.params.tab))
  //   }
  // }, [match.params.tab, tenant])

  useEffect(() => {
    setMenu(schema(match.params.tab))
    setMode(navMode.tenant)
    setOffice(officeMode.back)
    setTenant(tenant)

    return () => {

      setMode(navMode.initial)
      setTenant(undefined)
      setMenu({})
    }
  }, [tenant])

  return { addMenu, tenant };
}

export const useDaikokuBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);


  const navigate = useNavigate();
  const match = useMatch('/settings/:tab*');

  const schema = currentTab => ({
    blocks: {
      links: {
        order: 1,
        links: {
          tenants: { label: translateMethod("Tenants"), action: () => navigateTo('tenants'), className: { active: currentTab === 'tenants' } },
          users: { label: translateMethod("Users"), action: () => navigateTo('users'), className: { active: currentTab === 'users' } },
          sessions: { label: translateMethod("User sessions"), action: () => navigateTo('sessions'), className: { active: currentTab === 'sessions' } },
          importexport: { label: translateMethod("Import / Export"), action: () => navigateTo('import-export'), className: { active: currentTab === 'import-export' } },
        }
      }
    }
  })
  
  const navigateTo = (navTab) => {
    navigate(`/settings/${navTab}`)
  }

  // useEffect(() => {
  //   if (match.params.tab && !_.isEmpty(menu)) {
  //     addMenu(schema(match.params.tab))
  //   }
  // }, [match.params.tab])


  useEffect(() => {
    setMode(navMode.daikoku)
    setOffice(officeMode.back)
    setMenu(schema(match.params.tab))

    return () => {
      setMode(navMode.initial)
      setMenu({})
    }
  }, [])

  return { addMenu };
}

export const useUserBackOffice = () => {
  const { setMode, setOffice, addMenu, setMenu } = useContext(NavContext)
  const { translateMethod } = useContext(I18nContext);

  const { connectedUser } = useSelector(state => state.context)

  const navigate = useNavigate();
  const match = useMatch('/:tab');

 

  const schema = currentTab => ({
    title: connectedUser.name,
    blocks: {
      links: {
        order: 1,
        links: {
          profile: { label: translateMethod("My profile"), action: () => navigateTo('me'), className: { active: currentTab === 'me' } },
          notification: { label: translateMethod("Notifications"), action: () => navigateTo('notifications'), className: { active: currentTab === 'notifications' } },
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/${navTab}`)
  }

  // useEffect(() => {
  //   if (match.params.tab && !_.isEmpty(menu)) {
  //     addMenu(schema(match.params.tab))
  //   }
  // }, [match.params.tab])

  useEffect(() => {
    setMode(navMode.user)
    setOffice(officeMode.back)
    setMenu(schema(match.params.tab))

    return () => {
      setMode(navMode.initial)
      setMenu({})
    }
  }, [])

  return { addMenu };
}

