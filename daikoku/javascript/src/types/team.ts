export interface ITeamSimple {
  _id: string
  _humanReadableId: string
  _tenant: string
  type: 'Personal' | 'Organization' | 'Admin'
  name: string
  description: string
  avatar: string
  contact: string
  users: Array<string>
  apiKeyVisibility: 'Administrator' | 'ApiEditor' | 'User'
  apisCreationPermission?: boolean
}