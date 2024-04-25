# Config. with files

There are a lot of things you may configure in Daikoku. By default, Daikoku provides a configuration that should be enough for testing purpose. But you'll likely need to update this configuration when you'll need to move Daikoku into production.

In this page, any configuration property can be set at runtime using a `-D` flag when launching Daikoku, like:

```sh
java -Dhttp.port=8080 -jar daikoku.jar
```

or

```sh
./bin/daikoku -Dhttp.port=8080
```

## Common configuration

| name                                   |  type  | default value         | description                                                                                                                                                                                           |
|----------------------------------------|:------:|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `daikoku.mode`                         | String | "prod"                | Daikoku running mode. Supported values are `dev` or `prod`                                                                                                                                            |
| `daikoku.exposedOn`                    | String | http.port             | The HTTP port exposed by Daikoku                                                                                                                                                                      |
| `daikoku.singingkey`                   | String | "secret"              | The secret used for signing the JWT token                                                                                                                                                             |
| `daikoku.tenants.provider`             | string | "local"               | The way to get the tenant to display. Supported values are `local`, `header` or `hostname`                                                                                                            |
| `daikoku.tenants.hostheaderName`       | string | Otoroshi-Proxied-Host | The header key to get the host, in the case of daikoku.tenants.provider is `hostname`                                                                                                                 |
| `daikoku.team.defaultApiKeyVisibility` | string | "User"                | The default value of team apikeys visibility for its own members is based on Team permission. Supported values are `Administrator`, `ApiEditor` or `User`                                             |
| `daikoku.exposition.provider`          | string | "none"                | Activate the exchange protocol. Supported values are `otoroshi` (for [Otoroshi Exchange Protocol](https://maif.github.io/otoroshi/manual/usage/2-services.html#otoroshi-exchange-protocol) and `none` |
| `daikoku.snowflake.seed`               | number | 0                     | This number will be used to generate unique IDs across the cluster. Each Otoroshi instance must have a unique seed.                                                                                   |

## Admin api

| name                       |  type  | default value    | description                                                                        |
|----------------------------|:------:|------------------|------------------------------------------------------------------------------------|
| `daikoku.api.type`         | String | "local"          | The provider of apikey for admin APIs. Supported values are `local` and `otoroshi` |
| `daikoku.api.key`          | String | "secret"         | The local apikey of admin APIs                                                     |
| `daikoku.api.headerName`   | String | "Otoroshi-Claim" |                                                                                    |
| `daikoku.api.headerSecret` | String | "secret"         |                                                                                    |

## Otoroshi settings
| name                                              |  type   | default value         | description                                                          |
|---------------------------------------------------|:-------:|-----------------------|----------------------------------------------------------------------|
| `daikoku.exposition.otoroshi.stateHeaderName`     | string  | "Otoroshi-State"      | The Otoroshi exchange protocol header name                           |
| `daikoku.exposition.otoroshi.stateRespHeaderName` | string  | "Otoroshi-State-resp" | The Otoroshi exchange protocol response header name                  |
| `daikoku.otoroshi.groups.namePrefix`              | string  |                       | Value to filter Otoroshi groups based on the group name              |
| `daikoku.otoroshi.groups.idPrefix`                | string  |                       | Value to filter Otoroshi groups based on the group d                 |
| `daikoku.otoroshi.sync.master`                    | boolean | false                 | Value to define if the instance is the master to sync Otoroshi datas |
| `daikoku.otoroshi.sync.key`                       | string  | "secret"              | Sync key to sync Otoroshi                                            |
| `daikoku.otoroshi.sync.cron`                      | boolean | false                 | Value to define if Otoroshi values are sync by cron                  |
| `daikoku.otoroshi.sync.instance`                  | number  |                       | Daikoku instance number                                              |

## Daikoku init

| name                          |  type  | default value      | description                                                                                                                                |
|-------------------------------|:------:|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `daikoku.init.host`           | String | "localhost"        |                                                                                                                                            |
| `daikoku.init.admin.name`     | String | "Daikoku admin"    | Daikoku default admin name                                                                                                                 |
| `daikoku.init.admin.email`    | String | "admin@daikoku.io" | Daikoku default admin email                                                                                                                |
| `daikoku.init.admin.password` | String |                    | Daikoku default admin password                                                                                                             |
| `daikoku.init.data.from`      | string |                    | A file path or a URL to a Daikoku export file. If the datastore is empty on startup, this file will be used to import data to the empty DB |


## DB configuration

> Postgres configuration

| name                        |  type  | default value | description                              |
|-----------------------------|:------:|---------------|------------------------------------------|
| `daikoku.postgres.port`     |  int   | 5432          | The port used to connect to datastore    |
| `daikoku.postgres.host`     | string | "localhost"   | The host wher the datastore is           |
| `daikoku.postgres.database` | string | "default"     | The name of the database                 |
| `daikoku.postgres.username` | string | "postgres"    | The user used to connect to database     |
| `daikoku.postgres.password` | string | "postgres"    | The password used to connect to database |
| `daikoku.postgres.schema`   | string | "public"      | The current schema                       |

> Audit trail purge configuration

| name                           |  type   | default value | description                                           |
|--------------------------------|:-------:|---------------|-------------------------------------------------------|
| `daikoku.audit.purge.cron`     | boolean | false         | Enable the automatic purge of audit trail in database |
| `daikoku.audit.purge.interval` | string  | "1hour"       | The interval of purge run                             |
| `daikoku.audit.purge.max.date` | string  | "60days"      | Retention date for the audit trail                    |

## Play specific configuration

As Daikoku is a [Play app](https://www.playframework.com/), you should take a look at the [Play configuration documentation](https://www.playframework.com/documentation/2.6.x/Configuration) to tune its internal configuration

| name                              |  type   | default value     | description                                                                                                       |
|-----------------------------------|:-------:|-------------------|-------------------------------------------------------------------------------------------------------------------|
| `http.port`                       | number  | 8080              | The HTTP port used by Daikoku. You can use 'disabled' as value if you don't want to use HTTP                      |
| `https.port`                      | number  | disabled          | The HTTPS port used by Daikoku. You can use 'disabled' as value if you don't want to use HTTPS                    |
| `play.http.secret.key`            | string  | "secret"          | The secret used to sign Daikoku session cookie                                                                    |
| `play.http.session.secure`        | boolean | false             | Whether or not the Daikoku backoffice session will be served over HTTPS only                                      |
| `play.http.session.httpOnly`      | boolean | true              | Whether or not the Daikoku backoffice session will be accessible from JavaScript                                  |
| `play.http.session.maxAge`        | number  | 259200000         | The number of seconds before Daikoku backoffice session expired                                                   |
| `play.http.session.domain`        | string  | null              | The domain on which the Daikoku backoffice session is authorized                                                  |
| `play.http.session.cookieName`    | string  | "daikoku-session" | Tme of the Daikoku backoffice session                                                                             |
| `server.https.keyStore.path`      | string  |                   | The path to the keystore containing the private key and certificate, if not provided generates a keystore for you |
| `server.https.keyStore.type`      | string  | "JKS"             | The keystore type                                                                                                 |
| `server.https.keyStore.password`  | string  | ""                | The password                                                                                                      |
| `server.https.keyStore.algorithm` | string  |                   | The keystore algorithm, defaults to the platforms default algorithm                                               |

## Anonymous reporting

| name                                  |  type   | default value | description                                                                                                           |
|---------------------------------------|:-------:|---------------|-----------------------------------------------------------------------------------------------------------------------|
| `daikoku.anonymous-reporting.enabled` | boolean | true          | Enabling or not the anonymous reporting. If it's set to true and in the frontend to false, no reporting will be sent. |
| `daikoku.anonymous-reporting.timeout` | number  | 60000         | The request timeout for sending data to our anonymous reporting database.                                             |
| `daikoku.containerized`               | boolean | false         | This is to know if you are running daikoku with docker or not (only used for the anonymous reporting)                 |

## More config. options

See https://github.com/MAIF/daikoku/blob/master/daikoku/conf/application.conf

If you want to configure HTTPS on your Daikoku server, just read the [PlayFramework documentation about it](https://www.playframework.com/documentation/2.6.x/ConfiguringHttps)

## Example of configuration file

```conf
daikoku {

  mode = "prod"
  signingKey = "secret"

  exposedOn = ${http.port}

  api {
    type = "local"
    key = "secret"
    headerName = "Otoroshi-Claim"
    headerSecret = "secret"
  }

  init {
    host = "localhost"
    admin {
      name = "Daikoku admin"
      email = "admin@daikoku.io"
      password = "password"
    }
    data {
      from = "/config/daikoku.ndjson"
      headers = {}
    }
  }

  snowflake {
    seed = 0
  }

  tenants {
    provider = "local"
  }

  exposition {
    provider = "none"
    otoroshi {
      stateHeaderName = "Otoroshi-State"
      stateRespHeaderName = "Otoroshi-State-Resp"
    }
  }

  otoroshi {
    groups {
      namePrefix = "daikoku"
    }
    sync {
      interval = 3600000
      master = false
      key = "secret"
      cron = true
      instance = 0
    }
  }

  stats {
    sync {
      interval = 3600000
      cron = true
    }
    call {
      interval = 600000
    }
  }

  audit {
    purge {
      cron = false
      interval = 1hour
      max.date = 60days
    }
  }

  containerized = false
  containerized = ${?IS_CONTAINERIZED}

  anonymous-reporting {
    enabled = true
    enabled = ${?DAIKOKU_ANONYMOUS_REPORTING_ENABLED}
    url = "https://reporting.otoroshi.io/daikoku/ingest"
    timeout = 60000
    timeout = ${?DAIKOKU_ANONYMOUS_REPORTING_TIMEOUT}
  }
}

postgres {
  database = "daikoku_test"
  poolSize = 4
}


http.port = 8080
https.port = disabled

play {
  application.loader = "fr.maif.otoroshi.daikoku.DaikokuLoader"
  modules {}
  filters {
    enabled = []
  }
  http {
    filters = play.api.http.NoHttpFilters
    secret {
      key = "secret"
    }
    session = {
      cookieName = "daikoku-session"
      secure = false
      maxAge = 259200000
      httpOnly = true
      sameSite = "lax"
      domain = null
      path = ${play.http.context}
      jwt {
        signatureAlgorithm = "HS256"
        expiresAfter = ${play.http.session.maxAge}
        clockSkew = 5 minutes
        dataClaim = "data"
      }
    }
  }
  server {
    akka {
      requestTimeout = 60s
    }
    http {
      port = ${http.port}
      idleTimeout = 60s
    }
  }
}

```
