import { gql } from '@apollo/client';
import {
    IAsset,
    IQuotas,
    ISafeSubscription,
    ISubscriptionInformation,
    ITeamFull,
    ITeamSimple,
    ITenant,
    ITenantFull,
    IUser,
    IUserSimple
} from '../types';
import {
  ResponseError,
  IApi,
  IDocDetail,
  IDocPage,
  ISubscription,
  ResponseDone,
} from '../types/api';

const HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const customFetch = (url: any, { headers = HEADERS, method = 'GET', body, ...props }: any = {}) =>
  fetch(url, { headers, method, body, ...props }).then((r) => r.json());

export const me = () => customFetch('/api/me');
export const myOwnTeam = () => customFetch('/api/me/teams/own');
export const oneOfMyTeam = (id: any) => customFetch(`/api/me/teams/${id}`);

export const getVisibleApiWithId = (id: any) => customFetch(`/api/me/visible-apis/${id}`);
export const getVisibleApi = (id: any, version: any) =>
  customFetch(`/api/me/visible-apis/${id}/${version}`);
export const getVisibleApiGroup = (id: any) => customFetch(`/api/me/visible-groups/${id}`);
export const getTeamVisibleApi = (teamId: any, apiId: any, version: any) =>
  customFetch(`/api/me/teams/${teamId}/visible-apis/${apiId}/${version}`);
export const myTeams = (): Promise<Array<ITeamSimple>> => customFetch('/api/me/teams');
export const allJoinableTeams = () => customFetch('/api/teams/joinable');

export const teamAllNotifications = (teamId: any, page = 0) =>
  customFetch(`/api/teams/${teamId}/notifications/all?page=${page}`);
export const teamNotifications = (teamId: any) => customFetch(`/api/teams/${teamId}/notifications`);
export const teamUnreadNotificationsCount = (teamId: any) =>
  fetch(`/api/teams/${teamId}/notifications/unread-count`, { headers: HEADERS }).then(
    (r) => (r.status === 200 ? r.json() : { count: 0 }),
    () => ({ count: 0 })
  );
export const myAllNotifications = (page = 0, pageSize = 10) =>
  customFetch(`/api/me/notifications/all?page=${page}&pageSize=${pageSize}`);
export const myNotifications = (page = 0, pageSize = 10) =>
  customFetch(`/api/me/notifications?page=${page}&pageSize=${pageSize}`);

export const myUnreadNotificationsCount = () =>
  fetch('/api/me/notifications/unread-count').then(
    (r) => (r.status === 200 ? r.json() : { count: 0 }),
    () => ({ count: 0 })
  );

export const acceptNotificationOfTeam = (
  NotificationId: string,
  values: object = {}
): Promise<ResponseError | ResponseDone> =>
  customFetch(`/api/notifications/${NotificationId}/accept`, {
    method: 'PUT',
    body: JSON.stringify(values),
  });

export const rejectNotificationOfTeam = (
  notificationId: string,
  message?: string
): Promise<ResponseError | ResponseDone> =>
  customFetch(`/api/notifications/${notificationId}/reject`, {
    method: 'PUT',
    body: JSON.stringify({ message }),
  });

export const subscribedApis = (team: any) => customFetch(`/api/teams/${team}/subscribed-apis`);
export const getDocPage = (api: string, id: string): Promise<IDocPage | ResponseError> =>
  customFetch(`/api/apis/${api}/pages/${id}`);
export const getDocDetails = (api: string, version: string): Promise<IDocDetail> =>
  customFetch(`/api/apis/${api}/${version}/doc`);

export const getTeamSubscriptions = (api: any, team: any, version: any) =>
  customFetch(`/api/apis/${api}/${version}/subscriptions/teams/${team}`);

export const getMySubscriptions = (apiId: any, version: any) =>
  customFetch(`/api/me/subscriptions/${apiId}/${version}`);

export const askForApiKey = (
  api: string,
  teams: Array<string>,
  plan: string,
  motivation?: string
): Promise<any> => {
  return customFetch(`/api/apis/${api}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify({ plan, teams, motivation }),
  });
};

export const initApiKey = (api: any, team: any, plan: string, apikey: any) =>
  customFetch(`/api/apis/${api}/subscriptions/_init`, {
    method: 'POST',
    body: JSON.stringify({ plan, team, apikey }),
  });

export const apisInit = (apis: any) =>
  customFetch('/api/apis/_init', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/json',
    },
    body: JSON.stringify(apis),
  });

export const subscriptionsInit = (subscriptions: any) =>
  customFetch('/api/subscriptions/_init', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/json',
    },
    body: JSON.stringify(subscriptions),
  });

export const archiveApiKey = (teamId: string, subscriptionId: string, enable: boolean) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_archive?enabled=${enable}`, {
    method: 'PUT',
  });

export const makeUniqueApiKey = (teamId: string, subscriptionId: string) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_makeUnique`, {
    method: 'POST',
  });

export const toggleApiKeyRotation = (
  teamId: string,
  subscriptionId: string,
  enabled: boolean,
  rotationEvery: number,
  gracePeriod: number
) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_rotation`, {
    method: 'POST',
    body: JSON.stringify({ enabled, rotationEvery, gracePeriod }),
  });

export const regenerateApiKeySecret = (teamId: string, subscriptionId: string) =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_refresh`, {
    method: 'POST',
  });

export const cleanArchivedSubscriptions = (teamId: string) =>
  customFetch(`/api/teams/${teamId}/subscriptions/_clean`, {
    method: 'DELETE',
  });

export const member = (teamId: string, userId: string) =>
  customFetch(`/api/teams/${teamId}/members/${userId}`, {});

export const members = (teamId: string): Promise<Array<IUserSimple>> =>
  customFetch(`/api/teams/${teamId}/members`);
export const teamHome = (teamId: string) => customFetch(`/api/teams/${teamId}/home`);

export const teamApi = (teamId: string, apiId: string, version: string): Promise<ResponseError | IApi> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}`);

export const teamApiGroup = (teamId: string, apiGroupId: string) =>
  customFetch(`/api/teams/${teamId}/apigroups/${apiGroupId}`);

export const teamApis = (teamId: string) => customFetch(`/api/teams/${teamId}/apis`);
export const team = (teamId: string) => customFetch(`/api/teams/${teamId}`);
export const teamFull = (teamId: string): Promise<ITeamFull> =>
  customFetch(`/api/teams/${teamId}/_full`);

export const teams = (): Promise<Array<ITeamSimple>> => customFetch('/api/teams');
export const isMaintenanceMode = () => customFetch('/api/state/lock');

export const createTeam = (team: ITeamSimple) =>
  customFetch('/api/teams', {
    method: 'POST',
    body: JSON.stringify(team),
  });

export const updateTeam = (team: ITeamSimple) =>
  customFetch(`/api/teams/${team._id}`, {
    method: 'PUT',
    body: JSON.stringify(team),
  });

export const deleteTeam = (teamId: string) =>
  customFetch(`/api/teams/${teamId}`, {
    method: 'DELETE',
  });

export const pendingMembers = (teamId: string) =>
  customFetch(`/api/teams/${teamId}/pending-members`);

export const allOtoroshis = (tenantId: string) => customFetch(`/api/tenants/${tenantId}/otoroshis`);

export const allSimpleOtoroshis = (tenantId: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/simplified`);

export const oneOtoroshi = (tenantId: string, id: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${id}`);

export const deleteOtoroshiSettings = (tenantId: string, id: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${id}`, {
    method: 'DELETE',
  });

export const saveOtoroshiSettings = (tenantId: any, oto: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${oto._id}`, {
    method: 'PUT',
    body: JSON.stringify(oto),
  });

export const createOtoroshiSettings = (tenantId: any, oto: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis`, {
    method: 'POST',
    body: JSON.stringify(oto),
  });

export const getOtoroshiGroups = (tenantId: any, otoId: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/groups`);

export const getOtoroshiGroupsAsTeamAdmin = (teamId: any, otoId: any) =>
  customFetch(`/api/teams/${teamId}/tenant/otoroshis/${otoId}/groups`);

export const getOtoroshiServicesAsTeamAdmin = (teamId: any, otoId: any) =>
  customFetch(`/api/teams/${teamId}/tenant/otoroshis/${otoId}/services`);

export const getOtoroshiServices = (tenantId: any, otoId: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/services`);

export const getOtoroshiApiKeys = (tenantId: any, otoId: any) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/apikeys`);

export const deleteTeamApi = (teamId: any, id: any) =>
  customFetch(`/api/teams/${teamId}/apis/${id}`, {
    method: 'DELETE',
  });

export const saveTeamApiWithId = (teamId: string, api: IApi, version: string, apiId: string) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}`, {
    method: 'PUT',
    body: JSON.stringify(api),
  });

export const saveTeamApi = (teamId: string, api: IApi, version: string) =>
  saveTeamApiWithId(teamId, api, version, api._humanReadableId);

export const createTeamApi = (teamId: string, api: IApi) =>
  customFetch(`/api/teams/${teamId}/apis`, {
    method: 'POST',
    body: JSON.stringify(api),
  });

export const removeMemberFromTeam = (teamId: any, userId: any) =>
  customFetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
  });

export const addMembersToTeam = (teamId: any, members: any) =>
  customFetch(`/api/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ members }),
  });

export const addUncheckedMembersToTeam = (teamId: any, email: any) =>
  customFetch(`/api/teams/${teamId}/unchecked-members`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const removeInvitation = (teamId: any, userId: any) =>
  customFetch(`/api/teams/${teamId}/members/${userId}/invitations`, {
    method: 'DELETE',
  });

export const updateTeamMemberPermission = (teamId: any, members: any, permission: any) =>
  customFetch(`/api/teams/${teamId}/members/_permission`, {
    method: 'POST',
    body: JSON.stringify({ members, permission }),
  });

export const createDocPage = (teamId: string, page: object): Promise<IDocPage> =>
  customFetch(`/api/teams/${teamId}/pages`, {
    method: 'POST',
    body: JSON.stringify(page),
  });

export const deleteDocPage = (teamId: string, pageId: string): Promise<any> =>
  customFetch(`/api/teams/${teamId}/pages/${pageId}`, {
    method: 'DELETE',
  });

export const saveDocPage = (teamId: string, page: IDocPage): Promise<IDocPage | ResponseError> =>
  customFetch(`/api/teams/${teamId}/pages/${page._id}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  });

export const allTenants = () => customFetch('/api/tenants');
export const oneTenant = (tenantId: string): Promise<ITenantFull> =>
  customFetch(`/api/tenants/${tenantId}`);

export const getConsummedQuotasWithSubscriptionId =  (teamId: string, subscriptionId: string): Promise<IQuotas> => customFetch(
    `/api/teams/${teamId}/subscription/${subscriptionId}/quotas`

)

export const createTenant = (tenant: ITenant) =>
  customFetch('/api/tenants', {
    method: 'POST',
    body: JSON.stringify(tenant),
  });

export const saveTenant = (tenant: ITenantFull) =>
  customFetch(`/api/tenants/${tenant._id}`, {
    method: 'PUT',
    body: JSON.stringify(tenant),
  });

export const deleteTenant = (id: string) =>
  customFetch(`/api/tenants/${id}`, {
    method: 'DELETE',
  });

export const askToJoinTeam = (team: any) =>
  customFetch(`/api/teams/${team}/join`, {
    method: 'POST',
  });

export const askForApiAccess = (teams: string[], apiId: string) =>
  customFetch(`/api/apis/${apiId}/access`, {
    method: 'POST',
    body: JSON.stringify({ teams }),
  });

export const fetchAuditTrail = (from: any, to: any, page: any, size: any) =>
  customFetch(`/api/admin/auditTrail?from=${from}&to=${to}&page=${page}&size=${size}`);

export const fetchAllUsers = () => customFetch('/api/admin/users');
export const findUserById = (id: string): Promise<IUser> => customFetch(`/api/admin/users/${id}`);

export const deleteUserById = (id: any) =>
  customFetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
  });

export const deleteSelfUserById = () =>
  customFetch('/api/me', {
    method: 'DELETE',
    redirect: 'follow',
  });

export const setAdminStatus = (user: any, isDaikokuAdmin: any) =>
  customFetch(`/api/admin/users/${user._id}/_admin`, {
    method: 'PUT',
    body: JSON.stringify({ isDaikokuAdmin }),
  });

export const updateUserById = (user: any) =>
  customFetch(`/api/admin/users/${user._id}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  });

export const updateMyPassword = (oldPassword: any, newPassword: any) =>
  customFetch(`/api/me/password`, {
    method: 'PUT',
    body: JSON.stringify({
      oldPassword,
      newPassword,
    }),
  });

export const createUser = (user: any) =>
  customFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });

export const simpleTenantList = () => customFetch('/api/tenants/simplified');

export const redirectToTenant = (id: any) => customFetch(`/api/tenants/${id}/_redirect`);

export const getTenantNames = (ids: any) =>
  customFetch('/api/tenants/_names', {
    method: 'POST',
    body: JSON.stringify(ids),
  });

export const fetchNewTenant = () => customFetch('/api/entities/tenant');
export const fetchNewTeam = (): Promise<ITeamSimple> => customFetch('/api/entities/team');
export const fetchNewApi = () => customFetch('/api/entities/api');
export const fetchNewApiGroup = () => customFetch('/api/entities/apigroup');
export const fetchNewUser = () => customFetch('/api/entities/user');
export const fetchNewOtoroshi = () => customFetch('/api/entities/otoroshi');
export const fetchNewIssue = () => customFetch('/api/entities/issue');
export const fetchNewPlan = (planType: any) =>
  customFetch(`/api/entities/plan?planType=${planType}`);

export const checkIfApiNameIsUnique = (name: any, id?: any) =>
  customFetch('/api/apis/_names', {
    method: 'POST',
    body: JSON.stringify({ name, id }),
  });
export const checkIfApiGroupNameIsUnique = (name: any) =>
  customFetch('/api/groups/_names', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getSessions = () => customFetch('/api/admin/sessions');

export const deleteSession = (id: any) =>
  customFetch(`/api/admin/sessions/${id}`, {
    method: 'DELETE',
  });

export const deleteSessions = () =>
  customFetch('/api/admin/sessions', {
    method: 'DELETE',
  });

export const search = (search: any) =>
  customFetch('/api/_search', {
    method: 'POST',
    body: JSON.stringify({ search }),
  });

export const subscriptionConsumption = (subscriptionId: any, teamId: any, from: any, to: any) =>
  customFetch(
    `/api/teams/${teamId}/subscription/${subscriptionId}/consumption?from=${from}&to=${to}`,
    {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  );

export const syncSubscriptionConsumption = (subscriptionId: any, teamId: any) =>
  customFetch(`/api/teams/${teamId}/subscription/${subscriptionId}/consumption/_sync`, {
    method: 'POST',
  });

export const syncApiConsumption = (apiId: any, teamId: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/consumption/_sync`, {
    method: 'POST',
  });

export const syncTeamBilling = (teamId: any) =>
  customFetch(`/api/teams/${teamId}/billing/_sync`, {
    method: 'POST',
  });

export const syncTeamIncome = (teamId: any) =>
  customFetch(`/api/teams/${teamId}/income/_sync`, {
    method: 'POST',
  });

export const apiConsumption = (apiId: any, planId: any, teamId: any, from: any, to: any) =>
  customFetch(
    `/api/teams/${teamId}/apis/${apiId}/plan/${planId}/consumption?from=${from}&to=${to}`,
    {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }
  );

export const apiGlobalConsumption = (apiId: any, teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/consumption?from=${from}&to=${to}`);

export const apiSubscriptions = (apiId: string, teamId: string, version: string): Promise<ISafeSubscription[]> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/subscriptions`);

export const archiveSubscriptionByOwner = (ownerId: any, subscriptionId: any, enabled: any) =>
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
  );

export const getSubscriptionInformations = (subscription: string, teamId: string): Promise<ISubscriptionInformation> =>
  customFetch(`/api/teams/${teamId}/subscription/${subscription}/informations`);

export const getTeamConsumptions = (teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/consumptions?from=${from}&to=${to}`);

export const getTeamBillings = (teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/billings?from=${from}&to=${to}`);

export const getTeamIncome = (teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/income?from=${from}&to=${to}`);

export const getApiCategories = () => customFetch('/api/categories');

export const getAsset = (teamId: any, assetId: any) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}`, {
    credentials: 'include',
    headers: {},
  });

export const deleteAsset = (teamId: any, assetId: any) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}`, {
    method: 'DELETE',
  });

export const listAssets = (teamId: string): Promise<Array<IAsset> | ResponseError> => customFetch(`/api/teams/${teamId}/assets`);

export const storeAsset = (
  teamId: any,
  filename: any,
  title: any,
  desc: any,
  contentType: any,
  formData: any
) =>
  customFetch(`/api/teams/${teamId}/assets?filename=${filename}&title=${title}&desc=${desc}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
      //'X-Thumbnail': thumbnail
    },
    body: formData,
  });

export const updateAsset = (teamId: any, assetId: any, contentType: any, formData: any) =>
  customFetch(`/api/teams/${teamId}/assets/${assetId}/_replace`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: contentType,
      'Content-Type': contentType,
    },
    body: formData,
  });

export const getTenantAsset = (assetId: any) =>
  customFetch(`/tenant-assets/${assetId}`, {
    credentials: 'include',
    headers: {},
  });

export const deleteTenantAsset = (assetId: any) =>
  customFetch(`/tenant-assets/${assetId}`, {
    method: 'DELETE',
  });

export const updateTenantAsset = (assetId: any, contentType: any, formData: any) =>
  customFetch(`/tenant-assets/${assetId}/_replace`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: contentType,
      'Content-Type': contentType,
    },
    body: formData,
  });

export const listTenantAssets = (teamId?: string): Promise<Array<IAsset> | ResponseError> => {
  if (teamId) {
    return customFetch(`/tenant-assets?teamId=${teamId}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  } else {
    return customFetch('/tenant-assets', {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }
};

export const storeTenantAsset = (
  filename: any,
  title: any,
  desc: any,
  contentType: any,
  formData: any
) =>
  customFetch(`/tenant-assets?filename=${filename}&title=${title}&desc=${desc}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
      //'X-Thumbnail': thumbnail
    },
    body: formData,
  });

export const storeUserAvatar = (filename: string, contentType: string, file: File) =>
  customFetch(`/user-avatar?filename=${filename}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'Asset-Content-Type': contentType,
    },
    body: file,
  });

export const uploadExportFile = (file: any) =>
  customFetch('/api/state/import', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-ndjson',
    },
    body: file,
  });

export const updateSubscriptionCustomName = (team: any, subscription: any, customName: any) =>
  customFetch(`/api/teams/${team._id}/subscriptions/${subscription._id}/name`, {
    method: 'POST',
    body: JSON.stringify({ customName }),
  });

export const updateSubscription = (team: ITeamSimple, subscription: ISubscription) =>
  customFetch(`/api/teams/${team._id}/subscriptions/${subscription._id}`, {
    method: 'PUT',
    body: JSON.stringify(subscription),
  });

export const storeThumbnail = (id: any, formData: any) =>
  customFetch(`/asset-thumbnails/${id}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'image/png',
      'Asset-Content-Type': 'image/png',
    },
    body: formData,
  });

export const createTestingApiKey = (teamId: any, body: any) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateTestingApiKey = (teamId: any, body: any) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteTestingApiKey = (teamId: any, body: any) =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });

export const testingCall = (teamId: any, apiId: any, body: any) =>
  customFetch(`/api/teams/${teamId}/testing/${apiId}/call`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getTranslations = (domain: any) =>
  customFetch(`/api/translations${domain ? `?domain=${domain}` : ''}`);

export const getTranslationLanguages = () => customFetch('/api/translations/_languages');

export const saveTranslation = (translation: any) =>
  customFetch('/api/translations', {
    method: 'PUT',
    body: JSON.stringify({
      translation,
    }),
  });

export const deleteTranslation = (translation: any) =>
  customFetch('/api/translations', {
    method: 'DELETE',
    body: JSON.stringify({
      translation,
    }),
  });

export const resetTranslation = (translation: any) =>
  customFetch(`/api/translations/${translation._id}/_reset`, {
    method: 'POST',
    ...HEADERS,
  });

export const sendEmails = (
  name: string,
  email: string,
  subject: string,
  body: string,
  tenantId: string,
  teamId?: string,
  apiId?: string,
  language?: string
) =>
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
  });

export const tenantAdmins = (tenantId: any) => customFetch(`/api/tenants/${tenantId}/admins`);

export const addableAdminsForTenant = (tenantId: any) =>
  customFetch(`/api/tenants/${tenantId}/addable-admins`);

export const addAdminsToTenant = (tenantId: any, adminIds: any) =>
  customFetch(`/api/tenants/${tenantId}/admins`, {
    method: 'POST',
    body: JSON.stringify(adminIds),
  });

export const removeAdminFromTenant = (tenantId: any, adminId: any) =>
  customFetch(`/api/tenants/${tenantId}/admins/${adminId}`, {
    method: 'DELETE',
  });

export const myMessages = () => customFetch('/api/me/messages');

export const myChatMessages = (chat: any, date?: any) =>
  customFetch(`/api/me/messages?chat=${chat}${date ? `&date=${date}` : ''}`);

export const myAdminMessages = () => customFetch('/api/me/messages/admin');

export const sendMessage = (message: any, participants: any, chat: any) =>
  customFetch('/api/messages/_send', {
    method: 'POST',
    body: JSON.stringify({
      message,
      participants,
      chat,
    }),
  });

export const messageSSE = () => customFetch('/api/messages/_sse');

export const setMessagesRead = (chatId: any) =>
  customFetch(`/api/messages/${chatId}/_read`, {
    method: 'PUT',
  });

export const closeMessageChat = (chatId: any) =>
  customFetch(`/api/messages/${chatId}`, {
    method: 'DELETE',
  });

export const lastDateChat = (chatId: any, date: any) =>
  customFetch(`/api/messages/${chatId}/last-date?date=${date}`);

export const migrateMongoToPostgres = () =>
  customFetch('/api/state/migrate', {
    method: 'POST',
    credentials: 'include',
  });

export const enableMaintenanceMode = () =>
  customFetch('/api/state/lock', {
    method: 'POST',
    ...HEADERS,
  });

export const disableMaintenanceMode = () =>
  customFetch('/api/state/unlock', {
    method: 'POST',
    ...HEADERS,
  });

export const checkConnection = (config: any, user?: any) =>
  customFetch('/api/auth/ldap/_check', {
    method: 'POST',
    body: user ? JSON.stringify({ config, user }) : JSON.stringify(config),
  });

export const login = (username: any, password: any, action: any) => {
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
};

export const toggleStar = (apiId: any) =>
  customFetch(`/api/apis/${apiId}/stars`, {
    method: 'PUT',
  });

export const searchLdapMember = (teamId: any, email: any) =>
  customFetch(`/api/teams/${teamId}/ldap/users/${email}`);

export const findUserByEmail = (teamId: any, email: any) =>
  customFetch(`/api/teams/${teamId}/users/_search`, {
    method: 'POST',
    body: JSON.stringify({
      attributes: {
        email,
      },
    }),
  });

export const createUserFromLDAP = (teamId: any, email: any) =>
  customFetch(`/api/teams/${teamId}/ldap/users`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      teamId,
    }),
  });

export const getAPIPosts = (apiId: any, version: any, offset = 0, limit = -1) =>
  customFetch(`/api/apis/${apiId}/${version}/posts?offset=${offset}&limit=${limit}`);

export const getAllAPIPosts = (apiId: any, version: any) =>
  customFetch(`/api/apis/${apiId}/${version}/posts`);

export const publishNewPost = (apiId: any, teamId: any, post: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/posts`, {
    method: 'POST',
    body: JSON.stringify(post),
  });

export const removePost = (apiId: string, teamId: string, postId: string) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/posts/${postId}`, {
    method: 'DELETE',
  });

export const savePost = (apiId: any, teamId: any, postId: any, content: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/posts/${postId}`, {
    method: 'PUT',
    body: JSON.stringify(content),
  });

export const getDaikokuVersion = () => customFetch('/api/versions/_daikoku');

export const getAPIIssues = (apiId: any) => customFetch(`/api/apis/${apiId}/issues`);

export const getAPIIssue = (apiId: any, issueId: any) =>
  customFetch(`/api/apis/${apiId}/issues/${issueId}`);

export const createNewIssue = (apiId: any, teamId: any, issue: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/issues`, {
    method: 'POST',
    body: JSON.stringify(issue),
  });

export const updateIssue = (apiId: any, teamId: any, issueId: any, issue: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/issues/${issueId}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...issue,
      by: issue.by._id,
      comments: issue.comments.map((comment: any) => ({
        ...comment,
        by: comment.by._id,
      })),
    }),
  });

export const getQRCode = () => customFetch('/api/me/_2fa');

export const verify2faCode = (token: any, code: any) =>
  fetch(`/api/2fa?token=${token}&code=${code}`);

export const disable2FA = () =>
  customFetch('/api/me/_2fa', {
    method: 'DELETE',
  });

export const reset2faAccess = (backupCodes: any) =>
  customFetch('/api/2fa', {
    method: 'PUT',
    body: JSON.stringify({ backupCodes }),
  });

export const selfVerify2faCode = (code: any) => customFetch(`/api/me/_2fa/enable?code=${code}`);

export const validateInvitationToken = (token: any) =>
  customFetch('/api/me/invitation/_check', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const removeTeamInvitation = () => customFetch('/api/me/invitation', { method: 'DELETE' });

export const createNewApiVersion = (apiId: any, teamId: any, version: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });

export const extendApiKey = (
  apiId: string,
  apiKeyId: string,
  teams: Array<string>,
  plan: string,
  motivation?: string
) =>
  customFetch(`/api/apis/${apiId}/subscriptions/${apiKeyId}`, {
    method: 'PUT',
    body: JSON.stringify({ plan, teams, motivation }),
  });

export const getAllTeamSubscriptions = (teamId: string): Promise<Array<ISubscription>> =>
  customFetch(`/api/subscriptions/teams/${teamId}`);

export const getAllApiVersions = (teamId: string, apiId: string): Promise<Array<string>> =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    headers: HEADERS,
  })
    .then((r) => r.json())
    .then((r) => (!r.error ? r.sort((a: any, b: any) => (a < b ? 1 : -1)) : []));

export const getDefaultApiVersion = (apiId: string): Promise<{defaultVersion: string}> =>
  customFetch(`/api/apis/${apiId}/default_version`);

export const getAllPlanOfApi = (teamId: any, apiId: any, version: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plans`);

export const getRootApi = (apiId: any) => customFetch(`/api/apis/${apiId}/_root`);

export const importApiPages = (teamId: any, apiId: any, pages: any, version: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/pages`, {
    method: 'PUT',
    body: JSON.stringify({
      pages,
    }),
  });

export const getAllApiDocumentation = (teamId: any, apiId: any, version: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/pages`);

export const getMyTeamsStatusAccess = (teamId: any, apiId: any, version: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/access`);

export const createCmsPage = (id: any, cmsPage: any) =>
  customFetch('/api/cms/pages', {
    method: 'POST',
    body: JSON.stringify({
      ...cmsPage,
      id,
      path: cmsPage.isBlockPage ? undefined : cmsPage.path,
    }),
  });

export const createCmsPageWithName = (name: string) =>
  customFetch(`/api/cms/pages/${name}`, { method: 'POST' });

export const removeCmsPage = (id: any) =>
  customFetch(`/api/cms/pages/${id}`, {
    method: 'DELETE',
  });

export const graphql = {
  myTeams: gql`
    query MyTeams {
      myTeams {
        name
        _humanReadableId
        _id
        type
        apiKeyVisibility
        apisCreationPermission
        users {
          user {
            userId: id
          }
          teamPermission
        }
      }
    }
  `,
  apisByIds: gql(`
      query filteredApis ($ids: [String!]) {
        apis (ids: $ids) {
          _id
          _humanReadableId
          currentVersion
          name
          apis {
            api {
              _id
              _humanReadableId
              name
            }
          }
        }
      }
    `),
  apisByIdsWithPlans: gql(`
      query filteredApis ($ids: [String!]) {
        apis (ids: $ids) {
          _id
          _humanReadableId
          currentVersion
          name
          possibleUsagePlans {
            _id
            otoroshiTarget {
              otoroshiSettings
            }
            aggregationApiKeysSecurity
          }
        }
      }
    `),
  apiByIdsWithPlans: gql(`
      query filteredApi ($id: String!) {
        api (id: $id) {
          _id
          _humanReadableId
          published
          currentVersion
          name
          smallDescription
          description
          tags
          visibility
          team {
            _id
            _humanReadableId
            name
          }
          possibleUsagePlans {
            _id
            customName
            customDescription
            visibility
            ... on QuotasWithLimits {
              maxPerSecond
              maxPerDay
              maxPerMonth
            }
            ... on FreeWithQuotas {
              maxPerSecond
              maxPerDay
              maxPerMonth
            }
            ... on QuotasWithoutLimits {
              maxPerSecond
              maxPerDay
              maxPerMonth
            }
            subscriptionProcess
            allowMultipleKeys
            otoroshiTarget {
              otoroshiSettings
            }
            aggregationApiKeysSecurity
          }
          apis {
            api {
              _id
              _humanReadableId
              name
              smallDescription
              tags
              categories
              currentVersion
              swagger { content }
              testing { enabled }
              posts { _id }
              issues { _id }
              team {
                _id
                _humanReadableId
                name
              }
            }
            authorizations {
              team
              authorized
              pending
            }
          }
          authorizedTeams {
            _id
            name
          }
        }
      }
    `),
  myVisibleApis: gql(`
    query AllVisibleApis ($teamId: String) {
      visibleApis (teamId: $teamId) {
        api {
          name
          _humanReadableId
          _id
          tags
          categories
          stars
          smallDescription
          isDefault
          visibility
          image
          possibleUsagePlans {
            _id
            customName
            currency
            type
          }
          currentVersion
          team {
            _id
            _humanReadableId
            name
            avatar
          }
          apis {
            api {
              _id
              _humanReadableId
              name
            }
          }
        }
        authorizations {
          team
          authorized
          pending
        }
      }
    }`),
  getCmsPage: (id: any) => gql`
    query GetCmsPage {
        cmsPage(id: "${id}") {
            name
            path
            draft
            body
            exact
            visible
            authenticated
            metadata
            contentType
            tags
            lastPublishedDate
        }
    }
  `,
  getCmsPageHistory: (id: any) => gql`
  query GetCmsPage {
      cmsPage(id: "${id}") {
          name
          draft
          history {
            id
            date
            user {
              name
            }
          }
      }
  }
`,
};

export const downloadCmsFiles = () =>
  fetch('/api/cms/download', {
    method: 'POST',
    credentials: 'include',
  });

export const getDiffOfCmsPage = (id: any, diffId: any, showDiffs: any) =>
  customFetch(`/api/cms/pages/${id}/diffs/${diffId}?showDiffs=${showDiffs}`);

export const restoreCmsDiff = (id: any, diffId: any) =>
  customFetch(`/api/cms/pages/${id}/diffs/${diffId}`, {
    method: 'POST',
  });

export const uploadZip = (file: any) => {
  const formData = new FormData();
  formData.append('file', file);

  return fetch('/api/cms/import', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
};

export const transferApiOwnership = (newTeamId: any, teamId: any, apiId: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/_transfer`, {
    method: 'POST',
    body: JSON.stringify({ team: newTeamId }),
  });
