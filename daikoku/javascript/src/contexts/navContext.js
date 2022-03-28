import React, { useContext, useEffect, useState } from 'react';

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
  const [tab, setTab] = useState();

  const [api, setApi] = useState();
  const [team, setTeam] = useState();
  const [tenant, setTenant] = useState();

  return (
    <NavContext.Provider
      value={{
        tab, setTab,
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
  const { setMode, setOffice, setApi, setTeam, tab } = useContext(NavContext)

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
      }
    }
  }, [api, team])

  return tab;
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

