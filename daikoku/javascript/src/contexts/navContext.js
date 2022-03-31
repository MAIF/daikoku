import React, { useContext, useEffect, useState } from 'react';
import { merge } from 'lodash';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { I18nContext, openContactModal } from '../core'
import { Can, manage, api as API} from '../components/utils'

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
            action: () => { if (api?.swagger?.content || api?.swagger?.url) navigateTo('swagger')}, 
            className: { active: currentTab === 'swagger', disabled: !api?.swagger?.content && !api?.swagger?.url }
          },
          testing: { 
            label: translateMethod("Testing"), 
            action: () => { if (api?.testing?.enabled) navigateTo('testing')}, 
            className: { active: currentTab === 'testing', disabled: !api?.testing?.enabled }
          },
          news: { 
            label: translateMethod("News"), 
            action: () => { if (api?.posts?.length) ('news')}, 
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
      addMenu(schema(params.tab))
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

export const useApiBackOffice = (api, team) => {
  const { setMode, setOffice, setApi, setTeam } = useContext(NavContext)

  useEffect(() => {
    setMode(navMode.api)
    setOffice(officeMode.back)
    setApi(api)
    setTeam(team)

    return () => {
      setMode(navMode.initial)
      setApi(undefined)
      setTeam(undefined)
    }
  }, [api, team])
}

export const useTeamBackOffice = (team) => {
  const { setMode, setOffice, setTeam } = useContext(NavContext)

  useEffect(() => {
    setMode(navMode.team)
    setOffice(officeMode.front)
    setTeam(team)

    return () => {
      setMode(navMode.initial)
      setTeam(undefined)
    }
  }, [team])
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

