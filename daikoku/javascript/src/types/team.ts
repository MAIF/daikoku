type TeamPermission = 'Administrator' | 'ApiEditor' | 'User'

export type TeamUser = {user: string, teamPermission: TeamPermission}
export interface ITeamSimple {
  _id: string
  _humanReadableId: string
  _tenant: string
  type: 'Personal' | 'Organization' | 'Admin'
  name: string
  description: string
  avatar: string
  contact: string
  users: Array<TeamUser>
  apiKeyVisibility: TeamPermission
  apisCreationPermission?: boolean
}

export interface ITeamFull extends ITeamSimple {
  
}

export interface IUserSimple {
  _id: string
  _humanReadableId: string
  email: string
  picture: string
  isDaikokuAdmin: boolean
  defaultLanguage?: string
  isGuest: boolean
  starredApis: Array<string>
  twoFactorAuthentication: I2FA | null
}

interface I2FA {
  enabled: boolean,
  secret: string
  token: string
  backupCodes: string
}