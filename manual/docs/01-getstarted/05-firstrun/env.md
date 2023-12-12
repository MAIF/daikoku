# Config. with ENVs

Now that you know [how to configure Daikoku with the config. file](./configfile.md) every properties in the following block can be overriden by an environment variable (an env. variable is written like `${?ENV_VARIABLE}`).

```
mode = ${?DAIKOKU_MODE}
signingKey = ${?DAIKOKU_SIGNING_KEY}
exposedOn = ${?DAIKOKU_EXPOSED_ON}
ype = ${?DAIKOKU_API_TYPE}
key = ${?DAIKOKU_API_KEY}
headerName = ${?DAIKOKU_API_HEADERNAME}
headerSecret = ${?DAIKOKU_API_HEADERSECRET}
host = ${?DAIKOKU_INIT_HOST}
name = ${?DAIKOKU_INIT_ADMIN_NAME}
email = ${?DAIKOKU_INIT_ADMIN_EMAIL}
password = ${?DAIKOKU_INIT_ADMIN_PASSWORD}
from = ${?DAIKOKU_INIT_DATA_FROM}
seed = ${?INSTANCE_NUMBER}
provider = ${?DAIKOKU_TENANT_PROVIDER}
hostheaderName = ${?DAIKOKU_TENANT_HOST_HEADERNAME}
defaultApiKeyVisibility = ${?DAIKOKU_TEAM_DEFAULT_APIKEY_VISIBILITY}
provider = ${?DAIKOKU_EXPOSITION_PROVIDER}
stateHeaderName = ${?DAIKOKU_EXPOSITION_OTOROSHI_STATE_HEADER_NAME}
stateRespHeaderName = ${?DAIKOKU_EXPOSITION_OTOROSHI_STATE_RESP_HEADER_NAME}
namePrefix = ${?DAIKOKU_OTOROSHI_GROUPS_NAME_PREFIX}
idPrefix = ${?DAIKOKU_OTOROSHI_GROUPS_ID_PREFIX}
master = ${?DAIKOKU_OTOROSHI_SYNC_MASTER}
key = ${?DAIKOKU_OTOROSHI_SYNC_KEY}
cron = ${?DAIKOKU_OTOROSHI_SYNC_CRON}
instance = ${?INSTANCE_NUMBER}
cron = ${?DAIKOKU_OTOROSHI_SYNC_CRON}
uri = ${?MONGODB_URI}
uri = ${?MONGODB_ADDON_URI}
http.port = ${?PORT}
https.port = ${?HTTPS_PORT}
key = ${?PLAY_CRYPTO_SECRET}
cookieName = ${?DAIKOKU_SESSION_NAME}
secure = ${?DAIKOKU_SESSION_SECURE}
maxAge = ${?DAIKOKU_SESSION_MAXAGE}
httpOnly = ${?DAIKOKU_SESSION_HTTPONLY}
sameSite = ${?DAIKOKU_SESSION_SAMESITE}
domain = ${?DAIKOKU_SESSION_DOMAIN}
path=${?HTTPS_KEYSTORE_PATH}
type=${?HTTPS_KEYSTORE_TYPE}
password=${?HTTPS_KEYSTORE_PASSWORD}
algorithm=${?HTTPS_KEYSTORE_ALGO}
host = ${?DAIKOKU_POSTGRES_HOST}
schema = ${?DAIKOKU_POSTGRES_SCHEMA}
database = ${?DAIKOKU_POSTGRES_DATABASE}
username = ${?DAIKOKU_POSTGRES_USERNAME}
password = ${?DAIKOKU_POSTGRES_PASSWORD}
port = ${?DAIKOKU_POSTGRES_PORT}
storage = ${?DAIKOKU_STORAGE}
```
