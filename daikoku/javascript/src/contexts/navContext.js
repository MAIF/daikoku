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
  tenant: 'TENANT',
  team: "TEAM",
}

export const officeMode = {
  front: "FRONT",
  back: "BACK"
}

export const NavContext = React.createContext();

export const NavProvider = ({ children }) => {
  const [mode, setMode] = useState(navMode.initial);
  const [office, setOffice] = useState(officeMode.front);

  const [menu, setMenu] = useState({});

  const [api, setApi] = useState();
  const [team, setTeam] = useState();
  const [tenant, setTenant] = useState();

  const addMenu = (value) => {
    setMenu({ ...merge(menu, value) })
  }

  return (
    <NavContext.Provider
      value={{
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
          pricings: { label: translateMethod("Pricings"), action: () => navigateTo('pricing'), className: { active: currentTab === 'pricing' } },
          documentation: { label: translateMethod("Documentation"), action: () => navigateTo('documentation'), className: { active: currentTab === 'documentation' } },
          swagger: {
            label: translateMethod("Swaggger"),
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
              <Link to={`/${team?._humanReadableId}/settings/apis/${api?._humanReadableId}/${api?.currentVersion}/${currentTab}`} className='block__entry__link'>Edit API</Link>
            </Can>
          },
          contact: { label: translateMethod(`contact ${team?.name}`), action: () => openContactModal(connectedUser.name, connectedUser.email, tenant._id, api.team, api._id)(dispatch) },
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
  const { setMode, setOffice, setApi, setTeam, addMenu, setMenu, menu } = useContext(NavContext)
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
          version: { component: <></> },
          informations: { label: translateMethod("Informations"), action: () => navigateTo('infos'), className: { active: currentTab === 'infos' } },
          plans: { label: translateMethod("Plans"), action: () => navigateTo('plans'), className: { active: currentTab === 'plans' } },
          documentation: { label: translateMethod("Documentation"), action: () => navigateTo('documentation'), className: { active: currentTab === 'documentation' } },
          news: { label: translateMethod("News"), action: () => navigateTo('news'), className: { active: currentTab === 'news' } }
        }
      }
    }
  })

  const navigateTo = (navTab) => {
    navigate(`/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/${navTab}`)
  }

  useEffect(() => {
    console.debug({menu})
    if (params.tab && !_.isEmpty(menu)) {
      addMenu(schema(params.tab))
    }
  }, [params.tab, api])

  useEffect(() => {
    if (api) {
      setMenu(schema(params.tab))
      setMode(navMode.api)
      setOffice(officeMode.back)
      setApi(api)
      setTeam(currentTeam)
    }
    return () => {
      setMode(navMode.initial)
      setApi(undefined)
      setTeam(undefined)
      setMenu({})
    }
  }, [api])

  return { addMenu };
}

export const useTeamBackOffice = (team) => {
  const { setMode, setOffice, setTeam, addMenu, setMenu, menu } = useContext(NavContext)
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
              informations: { label: translateMethod("Informations"), action: () => navigateTo('edition'), className: {active: currentTab === 'edition'} },
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
    if (!_.isEmpty(menu)) {
      addMenu(schema(match?.params?.tab))
    }
  }, [match?.params?.tab, team])

  useEffect(() => {
    if (team) {
      setMode(navMode.team)
      setOffice(officeMode.back)
      setTeam(team)
      setMenu(schema(match?.params?.tab))
    }
    return () => {
      setMode(navMode.initial)
      setTeam(undefined)
      setMenu({})
    }
  }, [team])

  return { addMenu };
}

export const useTenantBackOffice = (tenant) => {
  const { setMode, setOffice, setTenant } = useContext(NavContext)

  useEffect(() => {
    setMode(navMode.tenant)
    setOffice(officeMode.front)
    setTenant(tenant)

    return () => {
      setMode(navMode.initial)
      setTenant(tenant)
    }
  }, [tenant])
}

