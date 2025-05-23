import { IApi, ITeamSimple } from "../../src/types";

export const createNotification = (type: string, api: IApi, team: ITeamSimple) => {
  switch (type) {
    case 'CheckoutForSubscription':
      return null;
    case 'ApiAccess':
      return null
    case 'TransferApiOwnership':
      return null
    case 'ApiSubscriptionDemand':
      return null
    case 'ApiSubscriptionReject':
      return null
    case 'ApiSubscriptionAccept':
      return null
    case 'ApiKeyDeletionInformation':
      return null
    case 'OtoroshiSyncSubscriptionError':
    case 'OtoroshiSyncApiError':
      return null
    case 'ApiKeyRotationInProgress':
      return null
    case 'ApiKeyRotationEnded':
      return null
    case 'ApiKeyRefresh':
      return null
    case 'TeamInvitation':
      return null
    case 'NewPostPublished':
      return null
    case 'NewIssueOpen':
      return null
    case 'NewCommentOnIssue':
      return null
    default:
      return '';

  }
}