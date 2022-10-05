export interface IApi {
    _id: string
    _humanReadableId: string
    _tenant: string
    team: string
    _deleted: boolean
    lastUpdate: string
    name: string
    smallDescription: string
    header?: string
    image?: string
    description: string
    currentVersion: string
    supportedVersions: Array<string>
    published: boolean
    testing: ITesting
    documentation: IDocumentation
    swagger?: ISwagger
    tags: Array<string>
    categories: Array<string>
    visibility: 'Public' | 'Private' | 'PublicWithAuthorisation' | 'AdminOnly'
    possibleUsagePlans: Array<IUsagePlan>
    defaultUsagePlan: string
    authorizedTeams: Array<string>
    posts: Array<string>
    issues: Array<string>
    issuesTag: Array<string>
    stars: number
    parent?: string
    isDefault: boolean
    apis: Array<string>
}

export interface IApiWithAuthorization extends IApi {
    authorizations:  Array<{
        team: string
        authorized: boolean
        pending: boolean
      }>
}

export interface ITesting {
    enabled: boolean,
    auth: {
        name: 'ApiKey' | 'Basic'
    }
    name?: string
    username?: string
    password?: string
    config?: ITestingConfig
}

export interface ITestingConfig {
    otoroshiSettings: string
    authorizedEntities: IAuthorizedEntities
    clientName: string
    api: string
    tag: string
    customMetadata?: object
    customMaxPerSecond?: number
    customMaxPerDay?: number
    customMaxPerMonth?: number
    customReadOnly?: boolean
}

export interface IDocumentation {
    _id: string
    _tenant: string
    pages: Array<string>
    lastModificationAt: string
}

export interface ISwagger {
    url: string
    content?: string
    headers: { [key: string]: string }
}

export interface IUsagePlan {
    _id: string
    type: string
    customDescription?: string
    customName?: string
    allowMultipleKeys?: boolean
    otoroshiTarget?: IOtoroshiTarget
    aggregationApiKeysSecurity?: boolean
}

export interface IUsagePlanAdmin extends IUsagePlan {
}

export interface IUsagePlanFreeWithoutQuotas extends IUsagePlan {
    currency: ICurrency
    billingDuration: IBillingDuration
    visibility: 'Public' | 'Private'
    authorizedTeams: Array<string>
    autoRotation?: boolean
    subscriptionProcess: 'Automatic' | 'manual'
    integrationProcess: 'Automatic' | 'ApiKey'
    rotation: boolean
}
export interface IUsagePlanFreeWithQuotas extends IUsagePlanFreeWithoutQuotas {
    maxPerSecond: number
    maxPerDay: number
    maxPerMonth: number
}
export interface IUsagePlanQuotasWithLimits extends IUsagePlanFreeWithQuotas {
    costPerMonth: number
    trialPeriod: IBillingDuration
 }
export interface IUsagePlanQuotasWitoutLimit extends IUsagePlanQuotasWithLimits {
    costPerAdditionalRequest: number
 }
export interface IUsagePlanPayPerUse extends IUsagePlan {
    costPerMonth: number
    costPerRequest: number
    trialPeriod: IBillingDuration
    
    
    currency: ICurrency
    billingDuration: IBillingDuration
    visibility: 'Public' | 'Private'
    authorizedTeams: Array<string>
    autoRotation?: boolean
    subscriptionProcess: 'Automatic' | 'manual'
    integrationProcess: 'Automatic' | 'ApiKey'
    rotation: boolean
 }

interface IAuthorizedEntities {
    groups: Array<string>
    services: Array<string>
}

interface IBillingDuration {
    value: number
    unit: 'Hour' | 'Day' | 'Month' | 'Year'
}

interface ICurrency {
    code: string
}

interface IOtoroshiTarget {
    otoroshiSettings?: string
    authorizedEntities: IAuthorizedEntities
    apikeyCustomization: {
        clientIdOnly: boolean,
        constrainedServicesOnly: boolean,
        tags: Array<string>,
        metadata: {[key: string]: string},
        customMetadata: {[key: string]: string},
        restrictions: {
          enabled: boolean,
          allowLast: boolean,
          allowed: Array<IPath>,
          forbidden: Array<IPath>,
          notFound: Array<IPath>,
        },
      }
}

interface IPath {
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'OPTIONS' | 'HEAD' | 'PATCH'
    path: string
}