import { gql } from '@apollo/client';
import {
  I2FAQrCode,
  IAsset,
  IAuditTrail,
  IFastApiSubscription,
  IMailingTranslation,
  INotification,
  IOtoroshiSettings,
  IQuotas,
  ISafeSubscription,
  ISession,
  IStateContext,
  ISubscriptionInformation,
  ITeamFull,
  ITeamSimple,
  ITenant,
  ITenantAdministration,
  ITenantFull,
  ITranslation,
  IUser,
  IUserSimple,
  ISimpleOtoroshiSettings,
  IAnonymousState,
  IAuthContext,
} from '../types';
import {
  IApi,
  IApiExtended,
  IApiPost,
  IApiPostCursor,
  IConsumption,
  IDocDetail,
  IDocPage,
  IDocumentation,
  IDocumentationPage,
  IImportingDocumentation,
  IOtoroshiApiKey,
  Issue,
  ISubscription,
  ISubscriptionDemand,
  ISubscriptionExtended,
  ISubscriptionWithApiInfo,
  ITestingConfig,
  IUsagePlan,
  ResponseDone,
  ResponseError,
} from '../types/api';
import { IChatInfo } from '../types/chat';

const HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

type PromiseWithError<T> = Promise<ResponseError | T>;
const customFetch = <T>(
  url: string,
  { headers = HEADERS, method = 'GET', body, ...props }: any = {}
) => fetch(url, { headers, method, body, ...props }).then((r) => r.json());

export const me = (): PromiseWithError<IUser> => customFetch('/api/me');
export const myOwnTeam = () => customFetch('/api/me/teams/own');
export const oneOfMyTeam = (id: any) => customFetch(`/api/me/teams/${id}`);
export const getUserContext = (): PromiseWithError<IStateContext> => customFetch('/api/me/context');
export const getAuthContext = (provider: string): PromiseWithError<IAuthContext> =>
  customFetch(`/api/auth/${provider}/context`);

export const getVisibleApiWithId = (id: string): PromiseWithError<IApi> =>
  customFetch(`/api/me/visible-apis/${id}`);
export const getVisibleApi = (id: string, version: string): PromiseWithError<IApi> =>
  customFetch(`/api/me/visible-apis/${id}/${version}`);
export const getVisiblePlan = (
  apiId: string,
  version: string,
  planId: string
): PromiseWithError<IUsagePlan> =>
  customFetch(`/api/me/visible-apis/${apiId}/${version}/plans/${planId}`);
export const getVisiblePlans = (
  apiId: string,
  version: string
): PromiseWithError<Array<IUsagePlan>> =>
  customFetch(`/api/me/visible-apis/${apiId}/${version}/plans`);
export const getVisibleApiGroup = (id: any) => customFetch(`/api/me/visible-groups/${id}`);
export const getTeamVisibleApi = (
  teamId: string,
  apiId: string,
  version: string
): PromiseWithError<IApi> =>
  customFetch(`/api/me/teams/${teamId}/visible-apis/${apiId}/${version}`);
export const myTeams = (): Promise<ResponseError | Array<ITeamSimple>> =>
  customFetch('/api/me/teams');

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
export const myNotifications = (
  page: number = 0,
  pageSize: number = 10
): Promise<{ notifications: Array<INotification>; count: number }> =>
  customFetch(`/api/me/notifications?page=${page}&pageSize=${pageSize}`);

export const myUnreadNotificationsCount = (): Promise<{ count: number }> =>
  fetch('/api/me/notifications/unread-count')
    .then(
      (r) => (r.status === 200 ? r.json() : { count: 0 }),
      () => ({ count: 0 })
    )
    .catch(() => ({ count: 0 }));

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

export const subscribedApis = (teamId: string): Promise<ResponseError | Array<IApi>> =>
  customFetch(`/api/teams/${teamId}/subscribed-apis`);
export const getApiDocPage = (api: string, id: string): PromiseWithError<IDocPage> =>
  customFetch(`/api/apis/${api}/pages/${id}`);
export const getApiDocPageRemoteContent = (api: string, id: string): PromiseWithError<any> =>
  fetch(`/api/apis/${api}/pages/${id}/content`);

export const getUsagePlanDocPage = (
  apiId: string,
  planId: string,
  pageId: string
): PromiseWithError<IDocPage> => customFetch(`/api/apis/${apiId}/plan/${planId}/pages/${pageId}`);
export const getDocDetails = (api: string, version: string): Promise<IDocDetail> =>
  customFetch(`/api/apis/${api}/${version}/doc`);

export const getTeamSubscriptions = (
  api: string,
  team: string,
  version: string
): PromiseWithError<Array<ISubscriptionExtended>> =>
  customFetch(`/api/apis/${api}/${version}/subscriptions/teams/${team}`);

export const getTeamSubscriptionsWithPlan = (
  api: string,
  team: string,
  version: string,
  planId: string
): Promise<Array<IFastApiSubscription>> =>
  customFetch(`/api/apis/${api}/${version}/subscriptions/teams/${team}?planId=${planId}`);

export const getMySubscriptions = (
  apiId: string,
  version: string
): Promise<{ subscriptions: Array<ISubscription>; requests: Array<ISubscriptionDemand> }> =>
  customFetch(`/api/me/subscriptions/${apiId}/${version}`);

type CreationDone = { creation: 'done'; subscription: ISubscription };
type CreationWaiting = { creation: 'waiting' };
type CheckoutUrl = { checkoutUrl: string };

export function isCheckoutUrl(obj: any): obj is CheckoutUrl {
  return (<CheckoutUrl>obj).checkoutUrl !== undefined;
}

export function isCreationDone(obj: any): obj is CreationDone {
  return (<CreationDone>obj).creation === 'done';
}

export function isCreationWaiting(obj: any): obj is CreationWaiting {
  return (<CreationWaiting>obj).creation === 'waiting';
}

type SubscriptionReturn = ResponseError | CreationWaiting | CreationDone | CheckoutUrl;

export const askForApiKey = (
  apiId: string,
  teamId: string,
  planId: string,
  motivation?: object
): Promise<SubscriptionReturn> => {
  return customFetch(`/api/apis/${apiId}/plan/${planId}/team/${teamId}/_subscribe`, {
    method: 'POST',
    body: JSON.stringify({ motivation }),
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

export const archiveApiKey = (
  teamId: string,
  subscriptionId: string,
  enable: boolean
): PromiseWithError<ISafeSubscription> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_archive?enabled=${enable}`, {
    method: 'PUT',
  });

export const makeUniqueApiKey = (
  teamId: string,
  subscriptionId: string
): PromiseWithError<ISafeSubscription> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_makeUnique`, {
    method: 'POST',
  });

export const toggleApiKeyRotation = (
  teamId: string,
  subscriptionId: string,
  enabled: boolean,
  rotationEvery: number,
  gracePeriod: number
): PromiseWithError<ISafeSubscription> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_rotation`, {
    method: 'POST',
    body: JSON.stringify({ enabled, rotationEvery, gracePeriod }),
  });

export const regenerateApiKeySecret = (
  teamId: string,
  subscriptionId: string
): PromiseWithError<ISafeSubscription> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_refresh`, {
    method: 'POST',
  });

export const member = (teamId: string, userId: string) =>
  customFetch(`/api/teams/${teamId}/members/${userId}`, {});

export const members = (teamId: string): Promise<Array<IUserSimple>> =>
  customFetch(`/api/teams/${teamId}/members`);
export const teamHome = (teamId: string) => customFetch(`/api/teams/${teamId}/home`);

export const teamApi = (
  teamId: string,
  apiId: string,
  version: string
): Promise<ResponseError | IApi> => customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}`);

export const planOfApi = (
  teamId: string,
  apiId: string,
  version: string,
  planId: string
): Promise<ResponseError | IUsagePlan> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plans/${planId}`);

export const teamApiGroup = (teamId: string, apiGroupId: string) =>
  customFetch(`/api/teams/${teamId}/apigroups/${apiGroupId}`);

export const teamApis = (teamId: string): Promise<ResponseError | Array<IApi>> =>
  customFetch(`/api/teams/${teamId}/apis`);
export const team = (teamId: string): Promise<ResponseError | ITeamSimple> =>
  customFetch(`/api/teams/${teamId}`);
export const teamFull = (teamId: string): Promise<ResponseError | ITeamFull> =>
  customFetch(`/api/teams/${teamId}/_full`);

export const teams = (team: ITeamSimple): Promise<ResponseError | Array<ITeamSimple>> =>
  customFetch(`/api/teams/${team._id}/teams`);
export const isMaintenanceMode = () => customFetch('/api/state/lock');

export const createTeam = (team: ITeamSimple) =>
  customFetch('/api/teams', {
    method: 'POST',
    body: JSON.stringify(team),
  });

export const sendEmailVerification = (teamId: String) =>
  customFetch(`/api/teams/${teamId}/_sendEmail`, {
    method: 'PUT',
  });

export const updateTeam = (team: ITeamSimple) =>
  customFetch(`/api/teams/${team._id}`, {
    method: 'PUT',
    body: JSON.stringify(team),
  });

export const deleteTeam = (teamId: string): Promise<ResponseDone | ResponseError> =>
  customFetch(`/api/teams/${teamId}`, {
    method: 'DELETE',
  });

export const pendingMembers = (teamId: string) =>
  customFetch(`/api/teams/${teamId}/pending-members`);

export const allOtoroshis = (tenantId: string): Promise<ResponseError | Array<IOtoroshiSettings>> =>
  customFetch(`/api/tenants/${tenantId}/otoroshis`);

export const allSimpleOtoroshis = (
  tenantId: string,
  maybeTeam?: ITeamSimple
): PromiseWithError<Array<ISimpleOtoroshiSettings>> =>
  customFetch(
    `/api/tenants/${tenantId}/otoroshis/simplified${maybeTeam ? `?team=${maybeTeam._id}` : ''}`
  );

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

export const getOtoroshiGroups = (tenantId: string, otoId: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/groups`);

export const getOtoroshiGroupsAsTeamAdmin = (teamId: string, otoId: string) =>
  customFetch(`/api/teams/${teamId}/tenant/otoroshis/${otoId}/groups`);

export const getOtoroshiServicesAsTeamAdmin = (teamId: string, otoId: string) =>
  customFetch(`/api/teams/${teamId}/tenant/otoroshis/${otoId}/services`);

export const getOtoroshiRoutesAsTeamAdmin = (teamId: string, otoId: string) =>
  customFetch(`/api/teams/${teamId}/tenant/otoroshis/${otoId}/routes`);

export const getOtoroshiServices = (tenantId: string, otoId: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/services`);

export const getOtoroshiRoutes = (tenantId: string, otoId: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/routes`);

export const getOtoroshiApiKeys = (tenantId: string, otoId: string) =>
  customFetch(`/api/tenants/${tenantId}/otoroshis/${otoId}/apikeys`);

export const deleteTeamApi = (teamId: string, id: string, next: string) =>
  customFetch(`/api/teams/${teamId}/apis/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ next }),
  });

export const saveTeamApiWithId = (
  teamId: string,
  api: IApi,
  version: string,
  apiId: string
): PromiseWithError<IApi> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}`, {
    method: 'PUT',
    body: JSON.stringify(api),
  });

export const saveTeamApi = (teamId: string, api: IApi, version: string) =>
  saveTeamApiWithId(teamId, api, version, api._humanReadableId);

export const createTeamApi = (teamId: string, api: IApi): PromiseWithError<IApi> =>
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
export const oneTenant = (tenantId: string): Promise<ResponseError | ITenantFull> =>
  customFetch(`/api/tenants/${tenantId}`);

export const getConsummedQuotasWithSubscriptionId = (
  teamId: string,
  subscriptionId: string
): Promise<IQuotas> => customFetch(`/api/teams/${teamId}/subscription/${subscriptionId}/quotas`);

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

export const askForApiAccess = (teams: string[], apiId: string) =>
  customFetch(`/api/apis/${apiId}/access`, {
    method: 'POST',
    body: JSON.stringify({ teams }),
  });

export const fetchAuditTrail = (
  from: number,
  to: number,
  page: number,
  size: number
): Promise<ResponseError | IAuditTrail> =>
  customFetch(`/api/admin/auditTrail?from=${from}&to=${to}&page=${page}&size=${size}`);

export const fetchAllUsers = (): Promise<ResponseError | Array<IUserSimple>> =>
  customFetch('/api/admin/users');
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
export const fetchNewApi = (): Promise<IApi> => customFetch('/api/entities/api');
export const fetchNewApiDoc = (): Promise<IDocumentation> =>
  customFetch('/api/entities/api-documentation');
export const fetchNewApiDocPage = (): Promise<IDocPage> =>
  customFetch('/api/entities/api-documentation-page');
export const fetchNewApiGroup = () => customFetch('/api/entities/apigroup');
export const fetchNewUser = () => customFetch('/api/entities/user');
export const fetchNewOtoroshi = () => customFetch('/api/entities/otoroshi');
export const fetchNewIssue = () => customFetch('/api/entities/issue');
export const fetchNewPlan = (): Promise<IUsagePlan> => customFetch('/api/entities/plan');

export const checkIfApiNameIsUnique = (name: string, id?: string) =>
  customFetch('/api/apis/_names', {
    method: 'POST',
    body: JSON.stringify({ name, id }),
  });
export const checkIfApiGroupNameIsUnique = (name: any) =>
  customFetch('/api/groups/_names', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getSessions = (): Promise<ResponseError | Array<ISession>> =>
  customFetch('/api/admin/sessions');

export const deleteSession = (id: any) =>
  customFetch(`/api/admin/sessions/${id}`, {
    method: 'DELETE',
  });

export const deleteSessions = () =>
  customFetch('/api/admin/sessions', {
    method: 'DELETE',
  });

export const getAnonymousState = (): Promise<IAnonymousState> =>
  customFetch('/api/state/anonymous');
export const updateAnonymousState = (id: string, value: boolean, currentDate?: number) =>
  customFetch('/api/state/anonymous', {
    method: 'POST',
    body: JSON.stringify({ id, value, currentDate }),
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

export const syncTeamBilling = (teamId: string): PromiseWithError<Array<IConsumption>> =>
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

/* export const apiGlobalConsumption = (apiId: any, teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/consumption?from=${from}&to=${to}`);
  UNUSED FROM NOW BUT DON'T KNOW IF I HAVE TO REMOVE IT :)
  */

export const apiSubscriptions = (
  apiId: string,
  teamId: string,
  version: string
): Promise<Array<ISafeSubscription>> =>
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

export const getSubscriptionDemand = (
  teamId: String,
  demandId: string
): PromiseWithError<ISubscriptionDemand> =>
  customFetch(`/api/subscription/team/${teamId}/demands/${demandId}`);

export const getSubscriptionInformations = (
  subscription: string,
  teamId: string
): Promise<ISubscriptionInformation> =>
  customFetch(`/api/teams/${teamId}/subscription/${subscription}/informations`);

export const getTeamConsumptions = (teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/consumptions?from=${from}&to=${to}`);

export const getTeamBillings = (
  teamId: string,
  from: number,
  to: number
): Promise<Array<IConsumption> | ResponseError> =>
  customFetch(`/api/teams/${teamId}/billings?from=${from}&to=${to}`);

/*export const getTeamIncome = (teamId: any, from: any, to: any) =>
  customFetch(`/api/teams/${teamId}/income?from=${from}&to=${to}`);
  UNUSED FROM NOW BUT DON'T KNOW IF I HAVE TO REMOVE IT :)
  */

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

export const listAssets = (teamId: string): Promise<Array<IAsset> | ResponseError> =>
  customFetch(`/api/teams/${teamId}/assets`);

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

export const updateSubscriptionCustomName = (
  team: ITeamSimple,
  subscription: ISubscription,
  customName: string
): PromiseWithError<ISafeSubscription> =>
  customFetch(`/api/teams/${team._id}/subscriptions/${subscription._id}/name`, {
    method: 'POST',
    body: JSON.stringify({ customName }),
  });

export const updateSubscription = (
  team: ITeamSimple,
  subscription: ISafeSubscription | any
): PromiseWithError<ISafeSubscription> =>
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

//todo: add api or plan in body
export const createTestingApiKey = (
  teamId: string,
  body: ITestingConfig
): PromiseWithError<IOtoroshiApiKey> =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

//todo: add api or plan in body
export const updateTestingApiKey = (
  teamId: string,
  body: ITestingConfig
): PromiseWithError<IOtoroshiApiKey> =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteTestingApiKey = (teamId: string, body: any): PromiseWithError<ResponseDone> =>
  customFetch(`/api/teams/${teamId}/testing/apikeys`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });

export const testingCall = (teamId: any, apiId: any, body: any) =>
  customFetch(`/api/teams/${teamId}/testing/${apiId}/call`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getTranslations = (): Promise<ResponseError | { translations: Array<ITranslation> }> =>
  customFetch(`/api/translations/_all`);
export const getMailTranslations = (
  domain?: string
): Promise<ResponseError | { translations: Array<IMailingTranslation> }> =>
  customFetch(`/api/translations/_mail?domain=${domain || 'mail'}`);

export const getTranslationLanguages = (): Promise<ResponseError | string[]> =>
  customFetch('/api/translations/_languages');

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

export const tenantAdmins = (tenantId: string): Promise<ResponseError | ITenantAdministration> =>
  customFetch(`/api/tenants/${tenantId}/admins`);

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

export const myMessages = (): Promise<IChatInfo> => customFetch('/api/me/messages');

export const myChatMessages = (chat: string, date?: number): Promise<IChatInfo> =>
  customFetch(`/api/me/messages?chat=${chat}${date ? `&date=${date}` : ''}`);

export const myAdminMessages = (): Promise<IChatInfo> => customFetch('/api/me/messages/admin');

export const sendMessage = (message: string, participants: string[], chat: string) =>
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

export const closeMessageChat = (chatId: string) =>
  customFetch(`/api/messages/${chatId}`, {
    method: 'DELETE',
  });

export const lastDateChat = (chatId: string, date: number) =>
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

function updateQueryStringParameter(uri, key, value) {
  const re = new RegExp('([?&])' + key + '=.*?(&|$)', 'i');
  const separator = uri.indexOf('?') !== -1 ? '&' : '?';
  if (uri.match(re)) {
    return uri.replace(re, '$1' + key + '=' + value + '$2');
  } else {
    return uri + separator + key + '=' + value;
  }
}

export const login = (
  username: string,
  password: string,
  action: string,
  redirect?: string | null
) => {
  const body = new URLSearchParams();
  body.append('username', username);
  body.append('password', password);

  const url = redirect ? updateQueryStringParameter(action, 'redirect', redirect) : action;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body,
  });
};

export const toggleStar = (apiId: string): Promise<ResponseDone | ResponseError> =>
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

export const getAPIPosts = (
  apiId: string,
  version: string,
  offset: number = 0,
  limit: number = -1
): PromiseWithError<IApiPostCursor> =>
  customFetch(`/api/apis/${apiId}/${version}/posts?offset=${offset}&limit=${limit}`);

export const getAllAPIPosts = (
  apiId: string,
  version: string
): Promise<ResponseError | { total: number; posts: Array<IApiPost> }> =>
  customFetch(`/api/apis/${apiId}/${version}/posts`);

export const publishNewPost = (apiId: string, teamId: string, post: IApiPost) =>
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

export const getAPIIssues = (apiId: string): PromiseWithError<Array<Issue>> => customFetch(`/api/apis/${apiId}/issues`);

export const getAPIIssue = (apiId: string, issueId: string): PromiseWithError<Issue> =>
  customFetch(`/api/apis/${apiId}/issues/${issueId}`);

export const createNewIssue = (apiId: string, teamId: string, issue: Issue) =>
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

export const getQRCode = (): PromiseWithError<I2FAQrCode> => customFetch('/api/me/_2fa');

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

export const selfVerify2faCode = (code: string) => customFetch(`/api/me/_2fa/enable?code=${code}`);

export const validateInvitationToken = (
  token?: string | null
): PromiseWithError<{ team: string; notificationId: string; user: string }> =>
  customFetch('/api/me/invitation/_check', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const declineMyTeamInvitation = (token: string): PromiseWithError<ResponseDone> =>
  customFetch(`/api/me/invitation?token=${token}`, { method: 'DELETE' });

export const createNewApiVersion = (apiId: string, teamId: string, version: string) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });

export const deleteApiSubscription = (
  teamId: string,
  subscriptionId: string,
  action: string,
  childId?: string
): Promise<ResponseError | any> =>
  customFetch(
    `/api/teams/${teamId}/subscriptions/${subscriptionId}?action=${action}${childId ? `&child=${childId}` : ''}`,
    {
      method: 'DELETE',
    }
  );

export const extendApiKey = (
  apiId: string,
  apiKeyId: string,
  teamId: string,
  planId: string,
  motivation?: object
): Promise<SubscriptionReturn> =>
  customFetch(`/api/apis/${apiId}/plan/${planId}/team/${teamId}/${apiKeyId}/_extends`, {
    method: 'PUT',
    body: JSON.stringify({ motivation }),
  });

export const getAllTeamSubscriptions = (teamId: string): Promise<Array<ISubscriptionWithApiInfo>> =>
  customFetch(`/api/subscriptions/teams/${teamId}`);

export const getAllApiVersions = (teamId: string, apiId: string): Promise<Array<string>> =>
  fetch(`/api/teams/${teamId}/apis/${apiId}/versions`, {
    headers: HEADERS,
  })
    .then((r) => r.json())
    .then((r) => (!r.error ? r.sort((a: any, b: any) => (a < b ? 1 : -1)) : []));

export const getDefaultApiVersion = (apiId: string): Promise<{ defaultVersion: string }> =>
  customFetch(`/api/apis/${apiId}/default_version`);

export const getAllPlanOfApi = (
  teamId: string,
  apiId: string,
  version: string
): Promise<ResponseError | Array<IUsagePlan>> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plans`);

export const getRootApi = (apiId: string): PromiseWithError<IApi> =>
  customFetch(`/api/apis/${apiId}/_root`);

export const importApiPages = (
  teamId: string,
  apiId: string,
  pages: Array<string>,
  version: string,
  linked?: boolean
): PromiseWithError<ResponseDone> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/pages`, {
    method: 'PUT',
    body: JSON.stringify({
      pages,
      linked,
    }),
  });

export const importPlanPages = (
  teamId: string,
  apiId: string,
  pages: Array<string>,
  version: string,
  planId: string,
  linked?: boolean
): PromiseWithError<ResponseDone> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plan/${planId}/pages`, {
    method: 'PUT',
    body: JSON.stringify({
      pages,
      linked,
    }),
  });

export const getAllApiDocumentation = (
  teamId: string,
  apiId: string,
  version: string
): PromiseWithError<Array<IImportingDocumentation>> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/pages/_versions`);

export const getAllPlansDocumentation = (
  teamId: string,
  apiId: string,
  version: string
): PromiseWithError<Array<IImportingDocumentation>> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/pages/_plans`);

export const getMyTeamsStatusAccess = (
  teamId: string,
  apiId: string,
  version: string
): PromiseWithError<IApiExtended> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/access`);

export const getCmsPage = (id: any, fields: any) =>
  fetch(`/cms/pages/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  }).then((r) => r.text());

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
        verified
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
          team {
            name
            _humanReadableId
          }
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
            customName
            otoroshiTarget {
              otoroshiSettings
            }
            aggregationApiKeysSecurity
          }
        }
      }
    `),
  apiByIdsWithPlans: `
      query filteredApi ($id: String!) {
        api (id: $id) {
          _id
          _humanReadableId
          deleted
          lastUpdate
          state
          currentVersion
          name
          smallDescription
          description
          tags
          categories
          visibility
          stars
          team {
            _id
            _humanReadableId
            name
          }
          defaultUsagePlan {
            _id
          }
          possibleUsagePlans {
            _id
            customName
            customDescription
            visibility
            maxPerSecond
            maxPerDay
            maxPerMonth
            subscriptionProcess {
              name
                ... on TeamAdmin {
                  team
                  schema
                }
            }
            allowMultipleKeys
            otoroshiTarget {
              otoroshiSettings
              authorizedEntities {
                groups
                services
                routes
              }
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
    `,
  myVisibleApis: `
    query AllVisibleApis ($teamId: String, $research: String, $selectedTeam: String, $selectedTag: String, $selectedCategory: String, $limit: Int, $offset: Int, $groupId: String) {
      visibleApis (teamId: $teamId, research: $research, selectedTeam: $selectedTeam, selectedTag: $selectedTag, selectedCategory: $selectedCategory, limit: $limit, offset: $offset, groupId: $groupId) {
        apis {
          api {
            name
            _humanReadableId
            _id
            tags
            categories
            stars
            parent {
              _id
              currentVersion
            }
            smallDescription
            isDefault
            visibility
            image
            possibleUsagePlans {
              _id
              customName
              currency {
                code
              }
              visibility
            }
            currentVersion
            team {
              _id
              _humanReadableId
              tenant {
                id
                name
              }
              type
              name
              description
              avatar
              contact
              apiKeyVisibility
              apisCreationPermission
              verified
              users {
                user {
                  userId: id
                  name
                  email
                }
                teamPermission
              }
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
        producers {
          _id
          name
        }
        total
      }
    }`,
  getAllTags: `
    query getAllTags ($research: String, $groupId: String, $selectedTeam: String, $selectedTag: String, $selectedCategory: String, $filter: String, $limit: Int, $offset: Int){
      allTags (research: $research, groupId: $groupId, selectedTeam: $selectedTeam, selectedTag: $selectedTag, selectedCategory: $selectedCategory, filter: $filter, limit: $limit, offset: $offset)
    }`,
  getAllCategories: `
    query getAllCategories ($research: String, $groupId: String, $selectedTeam: String, $selectedTag: String, $selectedCategory: String, $filter: String, $limit: Int, $offset: Int){
      allCategories (research: $research, groupId: $groupId, selectedTeam: $selectedTeam, selectedTag: $selectedTag, selectedCategory: $selectedCategory, filter: $filter, limit: $limit, offset: $offset)
    }`,
  getAllTeams: gql(`
  query getAllteams ($research: String, $limit: Int, $offset: Int) {
    teamsPagination (research: $research, limit: $limit, offset: $offset){
      teams {
        _id
        _humanReadableId
        tenant {
          id
        }
        name
        type
        avatar
        description
        contact
        users {
          user {
            userId: id
          }
          teamPermission
        }
        apiKeyVisibility
        apisCreationPermission
        verified
        metadata
        authorizedOtoroshiEntities {
          otoroshiSettingsId
          authorizedEntities {
            routes
            groups
            services
          }
        }
      }
      total
    }
  }`),
  getTeamIncome: `
  query getTeamIncome ($teamId: String!, $from: Long, $to: Long) {
    teamIncomes (teamId: $teamId, from: $from, to: $to) {
      api {
        _id
        name
      }
      plan {
        _id
      }
      team {
        name
      }
      billing {
        hits
        total
      }
      from
      to
    }
  }`,
  getApiConsumptions: gql(`
  query getApiConsumptions ($apiId: String!, $teamId: String!, $from: Long, $to: Long, $planId: String) {
    apiConsumptions (id: $apiId, teamId: $teamId, from: $from, to: $to, planIdOpt: $planId) {
      _id
      clientId
      tenant {
        id
      }
      team {
        _id
        name
      }
      api {
        _id
      }
      plan {
        _id
        customName
      }
      globalInformations {
        hits
        dataIn
        dataOut
        avgDuration
        avgOverhead
      }
      billing {
        hits
        total
      }
      from
      to
    }
  }`),
  getApiSubscriptions: `
    query getApiSubscriptions ($apiId: String!, $teamId: String!, $version: String!, $filterTable: JsArray, $sortingTable: JsArray, $limit: Int!, $offset: Int!) {
      apiApiSubscriptions (id: $apiId, teamId: $teamId, version: $version, filterTable: $filterTable, sortingTable: $sortingTable,  limit: $limit, offset: $offset) {
        _id
        lastUsage
        apiKey {
          clientName
          clientId
          clientSecret
        }
        plan {
          _id
          customName
        }
        team {
          _id
          name
          type
        }
        createdAt
        validUntil
        api {
          _id
          name
        }
        customName
        enabled
        tags
        metadata
        customMetadata
        customMaxPerSecond
        customMaxPerDay
        customMaxPerMonth
        customReadOnly
        adminCustomName
        parent {
          _id
          adminCustomName
          enabled
          validUntil
          api {
            _id
            name
          }
          plan {
            _id
            customName
          }
        }
      }
    }
    `,
  getMyNotifications: gql(`
    query getMyNotifications ($pageNumber : Int, $pageSize: Int) {
      myNotifications (pageNumber: $pageNumber, pageSize: $pageSize) {
        notifications {
          _id
          tenant {
            id
          }
          team {
            _id
            name
          }
          sender {
            id
            name
          }
          action {
            ... on ApiAccess {
              api {
                _id
                name
              }
              team {
                _id
                name
              }
            }
            ... on TeamInvitation {
              team {
                _id
                name
              }
              user {
                id
                name
              }
            }
            ... on ApiSubscriptionDemand {
              api {
                _id
                name
                currentVersion
              }
              team {
                _id
                name
                type
              }
              plan {
                _id
                customName
              }
              parentSubscriptionId {
                _id
                apiKey {
                  clientName
                  clientId
                  clientSecret
                }
              }
              motivation
              demand {
                id
                motivation
              }
            }
            ... on NewCommentOnIssue {
              linkTo
              apiName
            }
            ... on NewPostPublished {
              apiName
              team {
                name
              }
            }
            ... on ApiKeyRefresh {
              subscriptionName
              apiName
              planName
            }
            ... on ApiKeyDeletionInformation {
              apiName
              clientId
            }
            ... on TransferApiOwnership {
              api {
                _id
                name
              }
              team {
                _id
                name
              }
            }
            ... on ApiSubscriptionAccept {
              team {
                _id
                name
              }
              api {
                _id
                name
                currentVersion
              }
              plan {
                _id
                customName
              }
            }
            ... on ApiSubscriptionReject {
              team {
                _id
                name
              }
              api {
                _id
                name
                currentVersion
              }
              plan {
                _id
                customName
              }
              message
            }
            ... on OtoroshiSyncSubscriptionError {
              message
            }
            ... on ApiKeyRotationInProgress {
              clientId
              apiName
              planName
            }
            ... on ApiKeyRotationEnded {
              clientId
              apiName
              planName
            }
            ... on NewIssueOpen {
              linkTo
              apiName
            }
          }
          date
          notificationType {
            value
          }
          status {
            ... on NotificationStatusAccepted {
              date
              status
            }
            ... on NotificationStatusRejected {
              date
              status
            }
            ... on NotificationStatusPending {
              status
            }

          }
          
        }
        total
      }
    }
    `),
  getApisWithSubscription: gql(`
    query AccessibleApis ($teamId: String!, $research: String, $apiSubOnly: Boolean, $limit: Int, $offset: Int) {
      accessibleApis (teamId: $teamId, research: $research, apiSubOnly: $apiSubOnly , limit: $limit, offset: $offset) {
        apis {
          api {
            name
            _humanReadableId
            _id
            isDefault
            visibility
            parent {
              _id
              currentVersion
            }
            possibleUsagePlans {
              _id
              customName
              customDescription
              otoroshiTarget {
                otoroshiSettings
                authorizedEntities {
                  services
                  groups
                  routes
                }
              }
              currency {
                code
              }
              subscriptionProcess {
                name
                ... on TeamAdmin {
                  team
                  schema
                }
              }
              allowMultipleKeys
              aggregationApiKeysSecurity
             }
            currentVersion
            team {
              _id
              _humanReadableId
              name
            }
            apis {
              api {
                _id
              }
            }
          }
          subscriptionsWithPlan {
            planId
            isPending
            subscriptionsCount
          }
        }
        total
      }

    }`),
  getCmsPage: (id: any) => gql`
    query GetCmsPage {
        cmsPage(id: "${id}") {
            name
            path
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

export const transferApiOwnership = (newTeamName: any, teamId: any, apiId: any) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/_transfer`, {
    method: 'POST',
    body: JSON.stringify({ team: newTeamName }),
  });

export const setupPayment = (
  teamId: string,
  apiId: string,
  version: string,
  plan: IUsagePlan
): PromiseWithError<IUsagePlan> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plan/${plan._id}/_payment`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  });

export const createPlan = (
  teamId: string,
  apiId: string,
  version: string,
  plan: IUsagePlan
): PromiseWithError<IUsagePlan> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plan`, {
    method: 'POST',
    body: JSON.stringify(plan),
  });

export const updatePlan = (
  teamId: string,
  apiId: string,
  version: string,
  plan: IUsagePlan
): PromiseWithError<IUsagePlan> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plan/${plan._id}`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  });

export const deletePlan = (
  teamId: string,
  apiId: string,
  version: string,
  plan: IUsagePlan
): PromiseWithError<IApi> =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/${version}/plan/${plan._id}`, {
    method: 'DELETE',
  });

export const rerunProcess = (teamId: string, demandId: string) =>
  customFetch(`/api/subscription/team/${teamId}/demands/${demandId}/_run`);

export const cancelProcess = (teamId: string, demandId: string) =>
  customFetch(`/api/subscription/team/${teamId}/demands/${demandId}/_cancel`, {
    method: 'DELETE',
  });

export const fetchInvoices = (teamId: string, apiId: string, planId: string, callback: string) =>
  customFetch(`/api/teams/${teamId}/apis/${apiId}/plan/${planId}/invoices?callback=${callback}`);

export type ILastUsage = {
  clientName: string;
  date: number;
  subscription: string;
};
export const getSubscriptionsLastUsages = (
  teamId: string,
  subscriptions: Array<string>
): PromiseWithError<Array<ILastUsage>> =>
  customFetch(`/api/teams/${teamId}/subscriptions/_lastUsage`, {
    method: 'POST',
    body: JSON.stringify({ subscriptions }),
  });

export const getSubscriptionTransferLink = (
  teamId: string,
  subscriptionId: string
): PromiseWithError<{ link: string }> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscriptionId}/_transfer`);

export const checkTransferlink = (
  token: string
): PromiseWithError<{ subscription: ISubscription; api: IApi; plan: IUsagePlan }> =>
  customFetch(`/api/me/subscription/_retrieve?token=${token}`);

export const retrieveSubscription = (
  token: string,
  teamId: string,
  subscription: string
): PromiseWithError<ResponseDone> =>
  customFetch(`/api/teams/${teamId}/subscriptions/${subscription}/_retrieve`, {
    method: 'PUT',
    body: JSON.stringify({ token }),
  });
