import { nanoid } from "nanoid"
import { INotification } from "../../src/types"
import { IUser } from "./users"
import { adminApikeyId, adminApikeySecret, exposedPort, tenant } from "./utils"

type NotificationActionType = "ApiAccess" |
  "ApiSubscriptionDemand" |
  "ApiSubscriptionReject" |
  "ApiSubscriptionAccept" |
  "OtoroshiSyncSubscriptionError" |
  "OtoroshiSyncApiError" |
  "ApiKeyDeletionInformation" |
  "ApiKeyRotationInProgress" |
  "ApiKeyRotationEnded" |
  "TeamInvitation" |
  "ApiKeyRefresh" |
  "NewPostPublished" |
  "NewIssueOpen" |
  "NewCommentOnIssue" |
  "TransferApiOwnership" |
  "ApiSubscriptionTransferSuccess" |
  "CheckoutForSubscription"

const saveNotif = (notif?: INotification): Promise<Response> => {
  if (!notif) {
    return Promise.reject({ error: "no notif" })
  }
  return fetch(`http://localhost:${exposedPort}/admin-api/notifications`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(notif)
  })
}

export type NotifProps = {
  type: NotificationActionType,
  sender: IUser,
  team?: string,
  api?: string,
  message?: string,
  plan?: string,
  clientId?: string,
  subscription?: string,
  user?: string,
  demand?: string
  step?: string,
  fromTeam?: string
}
const createNotif = ({ type, sender, team, api, message, plan, clientId, subscription, user, demand, step, fromTeam }: NotifProps): INotification | undefined => {
  switch (type) {
    case 'CheckoutForSubscription':
      //todo: create demand before ???
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          demand: demand!,
          api: api!,
          plan: plan!,
          step: step!
        },
        notificationType: 'AcceptOrReject',
        status: { status: 'Pending' }
      }
    case 'ApiAccess':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          team: fromTeam!
        },
        notificationType: 'AcceptOrReject',
        status: { status: 'Pending' }
      }
    case 'TransferApiOwnership':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          team: team!
        },
        notificationType: 'AcceptOrReject',
        status: { status: 'Pending' }
      }
    case 'ApiSubscriptionDemand':
      //todo: create demand before ???
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          plan: plan!,
          team: team!,
          demand: demand!,
          step: step!,
          parentSubscriptionId: subscription!,
          motivation: message
        },
        notificationType: 'AcceptOrReject',
        status: { status: 'Pending' }
      }
    case 'ApiSubscriptionReject':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          message: message,
          plan: plan!,
          api: api!,
          team: team!
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'ApiSubscriptionAccept':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          plan: plan!,
          team: team!
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'ApiKeyDeletionInformation':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          clientId
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'OtoroshiSyncSubscriptionError': //FIXME: entire subscription
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          subscription,
          message
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'OtoroshiSyncApiError': //FIXME: entire api
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api,
          message
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'ApiKeyRotationInProgress':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          plan: plan!,
          clientId
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'ApiKeyRotationEnded':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          plan: plan!,
          clientId
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'ApiKeyRefresh':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          api: api!,
          plan: plan!,
          subscription: subscription
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'TeamInvitation':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          team: team!,
          user: user!
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'NewPostPublished':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          teamId: team!,
          apiName: api!
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'NewIssueOpen':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          teamId: team!,
          apiName: api!,
          linkTo: "/apis"
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
    case 'NewCommentOnIssue':
      return {
        _id: nanoid(),
        _tenant: tenant,
        _deleted: false,
        date: Date.now().toString(),
        team: team!,
        sender,
        action: {
          type,
          teamId: team!,
          apiName: api!,
          linkTo: "/apis"
        },
        notificationType: 'AcceptOnly',
        status: { status: 'Pending' }
      }
  }
}

export const postNewNotif = (props: NotifProps) => {
  const notif = createNotif(props);
  return saveNotif(notif)
}