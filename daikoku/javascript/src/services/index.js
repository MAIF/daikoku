const HEADERS = {
  credentials: 'include',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
};

const customFetch = (input, init = HEADERS) => fetch(input, init)
  .then(r => r.json());

export const me = () => customFetch('/api/me')
export const myOwnTeam = () => customFetch('/api/me/teams/own')
export const oneOfMyTeam = id => customFetch(`/api/me/teams/${id}`)

export const getVisibleApi = (id, version) => customFetch(`/api/me/visible-apis/${id}${version ? `?version=${version}` : ''}`)
export const getTeamVisibleApi = (teamId, apiId, version) => customFetch(`/api/me/teams/${teamId}/visible-apis/${apiId}?version=${version}`)
export const myTeams = () => customFetch('/api/me/teams')
export const allJoinableTeams = () => customFetch('/api/teams/joinable')
export const myVisibleApis = () => customFetch('/api/me/visible-apis')
export const myVisibleApisOfTeam = currentTeam => customFetch(`/api/teams/${currentTeam}/visible-apis`)

export const teamAllNotifications = (teamId, page = 0) => customFetch(`/api/teams/${teamId}/notifications/all?page=${page}`)
export const teamNotifications = teamId => customFetch(`/api/teams/${teamId}/notifications`)
export const teamUnreadNotificationsCount = teamId => fetch(`/api/teams/${teamId}/notifications/unread-count`, { ...HEADERS, })
  .then(r => r.status === 200 ? r.json() : { count: 0 },
    () => ({ count: 0 })
  );
export const myAllNotifications = (page = 0, pageSize = 10) => customFetch(`/api/me/notifications/all?page=${page}&pageSize=${pageSize}`)
export const myNotifications = (page = 0, pageSize = 10) => customFetch(`/api/me/notifications?page=${page}&pageSize=${pageSize}`)

export const myUnreadNotificationsCount = () =>
  fetch('/api/me/notifications/unread-count', {
    ...HEADERS,
  }).then(r => r.status === 200 ? r.json() : { count: 0 },
    () => ({ count: 0 })
  );

export const acceptNotificationOfTeam = (NotificationId, values = {}) => customFetch(`/api/notifications/${NotificationId}/accept`, {
  ...HEADERS,
  method: 'PUT',
  body: JSON.stringify(values)
})

export const rejectNotificationOfTeam = notificationId => customFetch(`/api/notifications/${notificationId}/reject`, {
  method: 'PUT',
  ...HEADERS,
})

export const subscribedApis = team => customFetch(`/api/teams/${team}/subscribed-apis`)
export const getDocPage = (api, id) => customFetch(`/api/apis/${api}/pages/${id}`)
export const getDocDetails = (api, version) => customFetch(`/api/apis/${api}/doc${version ? `?version=${version}` : ''}`)

export const reorderDoc = (team, api) => customFetch(`/api/teams/${team}/apis/${api}/pages/_reorder`, {
  method: 'POST',
  ...HEADERS,
  body: '{}',
})

export const getTeamSubscriptions = (api, team, version) =>
  customFetch(`/api/apis/${api}/subscriptions/teams/${team}?version=${version}`)

export const getMySubscriptions = (apiId, version) =>
  customFetch(`/api/me/subscriptions/${apiId}${version ? `?version=${version}` : ''}`)

export const askForApiKey = (api, teams, plan) => customFetch(`/api/apis/${api}/subscriptions`, {
  method: 'POST',
  ...HEADERS,
  body: JSON.stringify({ plan, teams }),
})

export const initApiKey = (api, team, plan, apikey) =>
  customFetch(`/api/apis/${api}/subscriptions/_init`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ plan, team, apikey }),
  })

export const apisInit = apis =>
  customFetch('/api/apis/_init', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/json',
    },
    body: JSON.stringify(apis),
  });

export const subscriptionsInit = subscriptions =>
  customFetch('/api/subscriptions/_init', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/json',
    },
    body: JSON.stringify(subscriptions),
  });

export const archiveApiKey = (teamId, subscriptionId, enable) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_archive?enabled=${enable}`, {
    method: 'PUT',
    ...HEADERS,
  })

export const makeUniqueApiKey = (teamId, subscriptionId) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_makeUnique`, {
    method: 'POST',
    ...HEADERS,
  })

export const toggleApiKeyRotation = (teamId, subscriptionId, rotationEvery, gracePeriod) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_rotation`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ rotationEvery, gracePeriod }),
  })

export const regenerateApiKeySecret = (teamId, subscriptionId) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_refresh`, {
    method: 'POST',
    ...HEADERS,
  })

export const cleanArchivedSubscriptions = teamId =>
  customFetch(`/api/teams/${teamId}/subscriptions/_clean`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const member = (teamId, userId) =>
  customFetch(`/api/teams/${teamId}/members/${userId}`, {
    ...HEADERS,
  })

export const members = teamId => customFetch(`/api/teams/${teamId}/members`)
export const teamHome = teamId => customFetch(`/api/teams/${teamId}/home`)

export const teamApi = (teamId, apiId, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}${version ? `?version=${version}` : ''}`)

export const teamApis = teamId => customFetch(`/api/teams/${teamId}/apis`)
export const team = teamId => customFetch(`/api/teams/${teamId}`)
export const teamFull = teamId => customFetch(`/api/teams/${teamId}/_full`)

export const teams = () => customFetch('/api/teams')
export const isMaintenanceMode = () => customFetch('/api/state/lock')

export const createTeam = team =>
  customFetch('/api/teams', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(team),
  })

export const updateTeam = team =>
  customFetch(`/api/teams/${team._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(team),
  })

export const deleteTeam = teamId =>
  customFetch(`/api/teams/${teamId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const pendingMembers = teamId => customFetch(`/api/teams/${teamId}/pending-members`)

export const allOtoroshis = tenantId => customFetch(`/api/tenants/${tenantId}/otoroshis`)

export const allSimpleOtoroshis = tenantId =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/simplified`)

export const oneOtoroshi = (tenantId, id) => customFetch(`/api/tenants/${tenantId}/otoroshis/${id}`)

export const deleteOtoroshiSettings = (tenantId, id) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${id}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const saveOtoroshiSettings = (tenantId, oto) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${oto._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(oto),
  })

export const createOtoroshiSettings = (tenantId, oto) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(oto),
  })

export const getOtoroshiGroups = (tenantId, otoId) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/groups`)

export const getOtoroshiServices = (tenantId, otoId) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/services`)

export const getOtoroshiApiKeys = (tenantId, otoId) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/apikeys`)

export const deleteTeamApi = (teamId, id) =>
  customFetch(`/api/teams/${teamId}/apis/${id}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const saveTeamApiWithId = (teamId, api, version, apiId) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}${version ? `?version=${version}` : ''}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(api),
  })

export const saveTeamApi = (teamId, api, version) => saveTeamApiWithId(teamId, api, version, api._id)

export const createTeamApi = (teamId, api) =>
  customFetch(`/api/teams/${teamId}/apis`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(api),
  })

export const removeMemberFromTeam = (teamId, userId) =>
  customFetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const addMembersToTeam = (teamId, members) =>
  customFetch(`/api/teams/${teamId}/members`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ members }),
  })

export const addUncheckedMembersToTeam = (teamId, email) =>
  customFetch(`/api/teams/${teamId}/unchecked-members`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ email }),
  })

export const removeInvitation = (teamId, userId) =>
  customFetch(`/api/teams/${teamId}/members/${userId}/invitations`, {
    ...HEADERS,
    method: 'DELETE',
  });

export const updateTeamMemberPermission = (teamId, members, permission) =>
  customFetch(`/api/teams/${teamId}/members/_permission`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ members, permission }),
  })

export const createDocPage = (teamId, apiId, page) =>
  customFetch(`/api/teams/${teamId}/pages`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(page),
  })

export const deleteDocPage = (teamId, apiId, pageId) =>
  customFetch(`/api/teams/${teamId}/pages/${pageId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const saveDocPage = (teamId, apiId, page) =>
  customFetch(`/api/teams/${teamId}/pages/${page._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(page),
  })

export const allTenants = () => customFetch('/api/tenants')
export const oneTenant = tenant => customFetch(`/api/tenants/${tenant}`)

export const createTenant = tenant =>
  customFetch('/api/tenants', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(tenant),
  })

export const saveTenant = tenant =>
  customFetch(`/api/tenants/${tenant._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(tenant),
  })

export const deleteTenant = id =>
  customFetch(`/api/tenants/${id}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const askToJoinTeam = team =>
  customFetch(`/api/teams/${team}/join`, {
    method: 'POST',
    ...HEADERS,
  })

export const askForApiAccess = (teams, api) =>
  customFetch(`/api/apis/${api}/access`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ teams }),
  })

export const fetchAuditTrail = (from, to, page, size) =>
  customFetch(`/api/admin/auditTrail?from=${from}&to=${to}&page=${page}&size=${size}`)

export const fetchAllUsers = () => customFetch('/api/admin/users')
export const findUserById = id => customFetch(`/api/admin/users/${id}`)

export const deleteUserById = id =>
  customFetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const deleteSelfUserById = () =>
  customFetch('/api/me', {
    method: 'DELETE',
    ...HEADERS,
  })

export const setAdminStatus = (user, isDaikokuAdmin) =>
  customFetch(`/api/admin/users/${user._id}/_admin`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify({ isDaikokuAdmin }),
  })

export const updateUserById = user =>
  customFetch(`/api/admin/users/${user._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(user),
  })

export const createUser = user =>
  customFetch('/api/admin/users', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(user),
  })

export const simpleTenantList = () =>
  customFetch('/api/tenants/simplified', {
    method: 'GET',
    ...HEADERS,
  })

export const redirectToTenant = id =>
  customFetch(`/api/tenants/${id}/_redirect`, {
    method: 'GET',
    ...HEADERS,
  })

export const getTenantNames = ids =>
  customFetch('/api/tenants/_names', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(ids),
  })

export const fetchNewTenant = () => customFetch('/api/entities/tenant');
export const fetchNewTeam = () => customFetch('/api/entities/team');
export const fetchNewApi = () => customFetch('/api/entities/api');
export const fetchNewUser = () => customFetch('/api/entities/user');
export const fetchNewOtoroshi = () => customFetch('/api/entities/otoroshi');
export const fetchNewIssue = () => customFetch('/api/entities/issue');

export const checkIfApiNameIsUnique = (name, id) =>
  customFetch('/api/apis/_names', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ name, id }),
  })

export const getSessions = () =>
  customFetch('/api/admin/sessions', {
    method: 'GET',
    ...HEADERS,
  })

export const deleteSession = id =>
  customFetch(`/api/admin/sessions/${id}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const deleteSessions = () =>
  customFetch('/api/admin/sessions', {
    method: 'DELETE',
    ...HEADERS,
  })

export const search = search =>
  customFetch('/api/_search', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ search }),
  })

export const subscriptionConsumption = (subscriptionId, teamId, from, to) =>
  customFetch(
    `/api/teams/${teamId}/subscription/${subscriptionId}/consumption?from=${from}&to=${to}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  )

export const syncSubscriptionConsumption = (subscriptionId, teamId) =>
  customFetch(`/api/teams/${teamId}/subscription/${subscriptionId}/consumption/_sync`, {
    method: 'POST',
    ...HEADERS,
  })

export const syncApiConsumption = (apiId, teamId) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/consumption/_sync`, {
    method: 'POST',
    ...HEADERS,
  })

export const syncTeamBilling = teamId =>
  customFetch(`/api/teams/${teamId}/billing/_sync`, {
    method: 'POST',
    ...HEADERS,
  })

export const syncTeamIncome = teamId =>
  customFetch(`/api/teams/${teamId}/income/_sync`, {
    method: 'POST',
    ...HEADERS,
  })

export const apiConsumption = (apiId, planId, teamId, from, to) =>
  customFetch(
    `/api/teams/${teamId}/apis/${apiId}/plan/${planId}/consumption?from=${from}&to=${to}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  )

export const apiGlobalConsumption = (apiId, teamId, from, to) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/consumption?from=${from}&to=${to}`, {
    method: 'GET',
    ...HEADERS,
  })

export const apiSubscriptions = (apiId, teamId, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/subscriptions?version=${version}`, {
    method: 'GET',
    ...HEADERS,
  })

export const archiveSubscriptionByOwner = (ownerId, subscriptionId, enabled) =>
  customFetch(
    `/api/teams/${ownerId}/subscriptions/${subscriptionId}/_archiveByOwner?enabled=${enabled}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  )

export const getSubscriptionInformations = (subscription, teamId) =>
  customFetch(`/api/teams/${teamId}/subscription/${subscription}/informations`, {
    method: 'GET',
    ...HEADERS,
  })

export const getTeamConsumptions = (teamId, from, to) =>
  customFetch(`/api/teams/${teamId}/consumptions?from=${from}&to=${to}`, {
    method: 'GET',
    ...HEADERS,
  })

export const getTeamBillings = (teamId, from, to) =>
  customFetch(`/api/teams/${teamId}/billings?from=${from}&to=${to}`, {
    method: 'GET',
    ...HEADERS,
  })

export const getTeamIncome = (teamId, from, to) =>
  customFetch(`/api/teams/${teamId}/income?from=${from}&to=${to}`, {
    method: 'GET',
    ...HEADERS,
  })
export const getApiCategories = () =>
  customFetch('/api/categories', {
    method: 'GET',
    ...HEADERS,
  })

export const getAsset = (teamId, assetId) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {},
  })

export const deleteAsset = (teamId, assetId) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const listAssets = teamId =>
  customFetch(`/api/teams/${teamId}/assets`, {
    method: 'GET',
    ...HEADERS,
  })

export const storeAsset = (teamId, filename, title, desc, contentType, formData) =>
  customFetch(`/api/teams/${teamId}/assets?filename=${filename}&title=${title}&desc=${desc}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
      //'X-Thumbnail': thumbnail
    },
    body: formData,
  })

export const updateAsset = (teamId, assetId, contentType, formData) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}/_replace`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: contentType,
      'Content-Type': contentType,
    },
    body: formData,
  })

export const getTenantAsset = assetId =>
  customFetch(`/tenant-assets/${assetId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {},
  })

export const deleteTenantAsset = assetId =>
  customFetch(`/tenant-assets/${assetId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const updateTenantAsset = (assetId, contentType, formData) =>
  customFetch(`/tenant-assets/${assetId}/_replace`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: contentType,
      'Content-Type': contentType,
    },
    body: formData,
  })

export const listTenantAssets = (teamId) => {
  if (teamId) {
    return customFetch(`/tenant-assets?teamId=${teamId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }).then((r) => r.json());
  } else {
    return customFetch('/tenant-assets', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }).then((r) => r.json());
  }
}

export const storeTenantAsset = (filename, title, desc, contentType, formData) =>
  customFetch(`/tenant-assets?filename=${filename}&title=${title}&desc=${desc}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
      //'X-Thumbnail': thumbnail
    },
    body: formData,
  })

export const storeUserAvatar = (filename, contentType, file) =>
  customFetch(`/user-avatar?filename=${filename}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
    },
    body: file,
  })

export const uploadExportFile = file =>
  customFetch('/api/state/import', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-ndjson',
    },
    body: file,
  })

export const updateSubscriptionCustomName = (team, subscription, customName) =>
  customFetch(`/api/teams/${team._id}/subscriptions/${subscription._id}/name`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ customName }),
  })

export const updateSubscription = (team, subscription) =>
  customFetch(`/api/teams/${team._id}/subscriptions/${subscription._id}`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(subscription),
  })

export const storeThumbnail = (id, formData) =>
  customFetch(`/asset-thumbnails/${id}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'image/png',
      'Asset-Content-Type': 'image/png',
    },
    body: formData,
  })

export const createTestingApiKey = (teamId, body) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(body),
  })

export const updateTestingApiKey = (teamId, body) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'PUT',
    ...HEADERS,
    body: JSON.stringify(body),
  })

export const deleteTestingApiKey = (teamId, body) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'DELETE',
    ...HEADERS,
    body: JSON.stringify(body),
  })

export const testingCall = (teamId, apiId, body) =>
  customFetch(`/api/teams/${teamId}/testing/${apiId}/call`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(body),
  })

export const getTranslations = domain =>
  customFetch(`/api/translations${domain ? `?domain=${domain}` : ''}`)


export const saveTranslation = translation =>
  fetch(`/api/translations`, {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify({
      translation
    }),
  })

export const resetTranslation = translation =>
  fetch(`/api/translations/${translation._id}/_reset`, {
    method: 'POST',
    ...HEADERS
  })

export const sendEmails = (name, email, subject, body, tenantId, teamId, apiId, language) =>
  customFetch(`/api/tenants/${tenantId}/_contact`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-contact-language': language,
    },
    body: JSON.stringify({
      name,
      email,
      subject,
      body,
      teamId,
      apiId,
    }),
  })

export const tenantAdmins = tenantId => customFetch(`/api/tenants/${tenantId}/admins`)

export const addableAdminsForTenant = tenantId =>
  customFetch(`/api/tenants/${tenantId}/addable-admins`)

export const addAdminsToTenant = (tenantId, adminIds) =>
  customFetch(`/api/tenants/${tenantId}/admins`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(adminIds),
  })

export const removeAdminFromTenant = (tenantId, adminId) =>
  customFetch(`/api/tenants/${tenantId}/admins/${adminId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const myMessages = () => customFetch('/api/me/messages')

export const myChatMessages = (chat, date) =>
  customFetch(`/api/me/messages?chat=${chat}${date ? `&date=${date}` : ''}`, {
    method: 'GET',
    ...HEADERS,
  })

export const myAdminMessages = () => customFetch('/api/me/messages/admin')

export const sendMessage = (message, participants, chat) =>
  customFetch('/api/messages/_send', {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({
      message,
      participants,
      chat,
    }),
  })

export const messageSSE = () => customFetch('/api/messages/_sse')

export const setMessagesRead = chatId =>
  customFetch(`/api/messages/${chatId}/_read`, {
    method: 'PUT',
    ...HEADERS,
  })

export const closeMessageChat = chatId =>
  customFetch(`/api/messages/${chatId}`, {
    method: 'DELETE',
    ...HEADERS,
  })

export const lastDateChat = (chatId, date) =>
  customFetch(`/api/messages/${chatId}/last-date?date=${date}`, {
    method: 'GET',
    ...HEADERS,
  })

export const migrateMongoToPostgres = () =>
  fetch('/api/state/migrate', {
    method: 'POST',
    credentials: 'include',
  });

export const enableMaintenanceMode = () =>
  customFetch('/api/state/lock', {
    method: 'POST',
    ...HEADERS
  })

export const disableMaintenanceMode = () =>
  customFetch('/api/state/unlock', {
    method: 'POST',
    ...HEADERS
  })

export const checkConnection = (config, user) =>
  customFetch('/api/auth/ldap/_check', {
    method: 'POST',
    ...HEADERS,
    body: user
      ? JSON.stringify({
        config,
        user,
      })
      : JSON.stringify(config),
  })

export const login = (username, password, action) => {
  const body = new URLSearchParams();
  body.append('username', username);
  body.append('password', password);

  return fetch(action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body,
  });
}

export const toggleStar = apiId =>
  fetch(`/api/apis/${apiId}/stars`, {
    method: 'PUT',
    ...HEADERS,
  });

export const searchLdapMember = (teamId, email) => customFetch(`/api/teams/${teamId}/ldap/users/${email}`)

export const findUserByEmail = (teamId, email) =>
  customFetch(`/api/teams/${teamId}/users/_search`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({
      attributes: {
        email,
      },
    }),
  })

export const createUserFromLDAP = (teamId, email) =>
  customFetch(`/api/teams/${teamId}/ldap/users`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({
      email,
      teamId,
    }),
  })

export const getAPIPosts = (apiId, offset = 0, limit = 1, version) =>
  customFetch(`/api/apis/${apiId}/posts?offset=${offset}&limit=${limit}${version ? `&version=${version}` : ''}`)

export const publishNewPost = (apiId, teamId, post) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/posts`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(post),
  });

export const removePost = (apiId, teamId, postId) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/posts/${postId}`, {
    ...HEADERS,
    method: 'DELETE'
  });

export const savePost = (apiId, teamId, postId, content) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/posts/${postId}`, {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify(content),
  });

export const getDaikokuVersion = () => customFetch('/api/versions/_daikoku')

export const getAPIIssues = apiId => customFetch(`/api/apis/${apiId}/issues`)

export const getAPIIssue = (apiId, issueId) => customFetch(`/api/apis/${apiId}/issues/${issueId}`)

export const createNewIssue = (apiId, teamId, issue) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/issues`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify(issue),
  });

export const updateIssue = (apiId, teamId, issueId, issue) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/issues/${issueId}`, {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify({
      ...issue,
      by: issue.by._id,
      comments: issue.comments.map((comment) => ({
        ...comment,
        by: comment.by._id,
      })),
    }),
  });

export const getQRCode = () => customFetch('/api/me/_2fa')

export const verify2faCode = (token, code) =>
  fetch(`/api/2fa?token=${token}&code=${code}`, {
    method: 'GET',
    ...HEADERS,
  });

export const disable2FA = () =>
  customFetch('/api/me/_2fa', {
    method: 'DELETE',
    ...HEADERS,
  });

export const reset2faAccess = backupCodes =>
  fetch('/api/2fa', {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify({ backupCodes })
  });

export const selfVerify2faCode = code =>
  fetch(`/api/me/_2fa/enable?code=${code}`, {
    method: 'GET',
    ...HEADERS,
  });

export const validateInvitationToken = token =>
  customFetch(`/api/me/invitation/_check`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ token }),
  })

export const removeTeamInvitation = token =>
  customFetch(`/api/me/invitation`, {
    ...HEADERS,
    method: 'DELETE',
  });

export const createNewApiVersion = (apiId, teamId, version) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({ version })
  })

export const extendApiKey = (apiId, apiKeyId, teams, plan) =>
  customFetch(`/api/apis/${apiId}/subscriptions/${apiKeyId}`, {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify({ plan, teams }),
  })

export const getAllTeamSubscriptions = team => customFetch(`/api/subscriptions/teams/${team}`)

export const getAllApiVersions = (teamId, apiId) =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    ...HEADERS
  })
    .then(r => r.json())
    .then(r => !r.error ? r.sort((a, b) => a < b ? 1 : -1) : [])

export const getDefaultApiVersion = apiId =>
  customFetch(`/api/apis/${apiId}/default_version`)

export const getAllPlanOfApi = (teamId, apiId, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/plans${version ? `?version=${version}` : ''}`)

export const cloneApiPlan = (teamId, apiId, fromApi, plan) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/plans`, {
    method: 'POST',
    ...HEADERS,
    body: JSON.stringify({
      plan, api: fromApi
    })
  })

export const getRootApi = apiId => customFetch(`/api/apis/${apiId}/_root`)

export const importApiPages = (teamId, apiId, pages, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/pages?version=${version}`, {
    ...HEADERS,
    method: 'PUT',
    body: JSON.stringify({
      pages
    })
  })

export const getAllApiDocumentation = (teamId, apiId, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/pages?version=${version}`)

export const getMyTeamsStatusAccess = (teamId, apiId, version) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/access?version=${version}`)