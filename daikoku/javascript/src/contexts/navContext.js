import React, { useContext, useEffect, useState } from 'react';

export const navMode = {
  initial: "INITIAL",
  api: "API",
  tenant: 'TENANT',
  team: "TEAM",
}

const officeMode = {
  front: "FRONT",
  back: "BACK"
}

export const NavContext = React.createContext();

export const NavProvider = ({ children }) => {
  const [mode, setMode] = useState(navMode.initial);
  const [office, setOffice] = useState(officeMode.front);

  const [api, setApi] = useState();
  const [team, setTeam] = useState();
  const [tenant, setTenant] = useState();

  const setBackOfficeMode = () => setOffice(officeMode.back)
  const setFrontOfficeMode = () => setOffice(officeMode.front)

  return (
    <NavContext.Provider
      value={{
        setMode,
        navMode,
        setBackOfficeMode,
        setFrontOfficeMode,
        api, setApi,
        team, setTeam,
        tenant, setTenant
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

