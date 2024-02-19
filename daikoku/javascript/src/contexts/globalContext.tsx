import { useQuery } from "@tanstack/react-query"
import React, { PropsWithChildren, useState } from "react"

import { queryClient } from "../components"
import { Spinner } from "../components/utils/Spinner"
import * as Services from '../services/index'
import { AuthProvider, DaikokuMode, Display, IStateContext, TenanMode, isError } from "../types"


type TGlobalContext = IStateContext & { reloadContext: () => void, toggleExpertMode: () => void }
const initContext: TGlobalContext = {
  connectedUser: {
    _id: "",
    _humanReadableId: "",
    email: "",
    picture: "",
    isDaikokuAdmin: false,
    isGuest: true,
    starredApis: [],
    twoFactorAuthentication: null,
    name: "fifou",
  },
  tenant: {
    _humanReadableId: "string",
    _id: "string",
    name: "string",
    contact: "string",
    creationSecurity: true,
    subscriptionSecurity: true,
    aggregationApiKeysSecurity: true,
    apiReferenceHideForGuest: true,
    authProvider: AuthProvider.local,
    homePageVisible: true,
    mode: DaikokuMode.dev,
    tenantMode: TenanMode.default,
    display: Display.default,
    environments: [],
  },
  isTenantAdmin: false,
  apiCreationPermitted: false,
  reloadContext: () => Promise.resolve(),
  expertMode: JSON.parse(localStorage.getItem('expertMode') || 'false'),
  toggleExpertMode: () => { }

}

export const GlobalContext = React.createContext<TGlobalContext>(initContext)
export const useCurrentUserContext = () => {
  return React.useContext(GlobalContext)
}


export const CurrentUserContextProvider = (props: PropsWithChildren) => {
  const getExpertMode = (): boolean => JSON.parse(localStorage.getItem('expertMode') || 'false')

  const [expertMode, setExpertMode] = useState<boolean>(getExpertMode())

  const currentUserQuery = useQuery({
    queryKey: ['context'],
    queryFn: () => Services.getUserContext(),
  })

  if (currentUserQuery.isLoading) {
    return <Spinner /> //todo: get a real better loader who block & mask all the window
  }

  //todo: get a real better error displaying
  if (currentUserQuery.isError || isError(currentUserQuery.data) || !currentUserQuery.data) {
    return <div>Something's happened when fetching user informations</div>
  }

  const reloadContext = () => queryClient.invalidateQueries({ queryKey: ["context"] })

  const toggleExpertMode = () => {
    localStorage.setItem('expertMode', (!expertMode).toLocaleString())
    setExpertMode(!expertMode)
  };


  return (
    <GlobalContext.Provider value={{ ...currentUserQuery.data, reloadContext, expertMode, toggleExpertMode }}>
      {props.children}
    </GlobalContext.Provider>
  )

}
