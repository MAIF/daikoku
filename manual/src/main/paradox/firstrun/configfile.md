# Config. with files

There is a lot of things you can configure in Daikoku. By default, Daikoku provides a configuration that should be enough for testing purpose. But you'll likely need to update this configuration when you'll need to move into production.

In this page, any configuration property can be set at runtime using a `-D` flag when launching Daikoku like

```sh
java -Dapp.domain=oto.tools -Dhttp.port=8080 -jar daikoku.jar
```

or

```sh
./bin/daikoku -Dhttp.port=8080 -Dapp.domain=oto.tools 
```

## Common configuration

| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
|`daikoku.mode`|String|"prod"| Daikoku running mode. Can be dev or prod |
|`daikoku.exposedOn`|String|http.port| the http port exposed by Daikoku  |
|`daikoku.singingkey`|String|"secret"| the secret used for signing the JWT token |
|`daikoku.tenants.provider` | string | "local" | the way to get the tenant to display. it can be local, header or hostname|
|`daikoku.exposition.provider` | string | "none" | Activate the otoroshi exchange protocol |
|`daikoku.snowflake.seed` | number | 0 | this number will is used to generate unique ids across the cluster. Each Otorshi instance must have a unique seed. |

## Admin api

| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
|`daikoku.api.type`|String|"local"| the provider of apikey for admin apis. it can be local or otoroshi |
|`daikoku.api.key`|String|"secret"| the local apikey of admin apis |
|`daikoku.api.headerName`|String|"Otoroshi-Claim"||
|`daikoku.api.headerSecret`|String|"secret"||

## Otoroshi settings
| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
|`daikoku.exposition.otoroshi.stateHeaderName` | string | "Otoroshi-State" | the otoroshi exchange protocol header name |
|`daikoku.exposition.otoroshi.stateRespHeaderName` | string | "Otoroshi-State-resp" | the otoroshi exchange protocol response header name |
|`daikoku.otoroshi.groups.namePrefix` | string |  | value to filter otoroshi groups based on the group name |
|`daikoku.otoroshi.groups.idPrefix` | string | | value to filter otoroshi groups based on the group d |
|`daikoku.otoroshi.sync.master` | boolean | false | value to define if the instance is the master to sync otoroshi datas |
|`daikoku.otoroshi.sync.key` | string | "secret" | sync key to sync otoroshi |
|`daikoku.otoroshi.sync.cron` | boolean | false | value to define if otorshi values are sync by cron |
|`daikoku.otoroshi.sync.instance` | number |  | Daikoku instance number |

## Daikoku init

| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
|`daikoku.init.host`|String|"localhost"|  |
|`daikoku.init.admin.name`|String|"Super admin"| Daikoku default admin name |
|`daikoku.init.admin.email`|String|"admin@daikoku.io"| Daikoku default admin email |
|`daikoku.init.admin.password`|String||Daikoku default admin password |
|`daikoku.init.data.from` | string |  | a file path or a URL to a Daikoku export file. If the datastore is empty on startup, this file will be used to import data to the empty DB  |


## DB configuration

| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
|`mongodb.uri` | string | "mongodb://localhost:27017/daikoku" | the uri to mongdb datastore |

## Play specific configuration

As Daikoku is a [Play app](https://www.playframework.com/), you should take a look at [Play configuration documentation](https://www.playframework.com/documentation/2.6.x/Configuration) to tune its internal configuration

| name | type | default value  | description |
| ---- |:----:| -------------- | ----- |
| `http.port` | number | 8080 | the http port used by Daikoku. You can use 'disabled' as value if you don't want to use http |
| `https.port` | number | disabled | the https port used by Daikoku. You can use 'disabled' as value if you don't want to use https |
| `play.http.secret.key` | string | "secret" | the secret used to sign Daikoku session cookie |
| `play.http.session.secure` | boolean | false | whether or not the Daikoku backoffice session will be served over https only |
| `play.http.session.httpOnly` | boolean | true | whether or not the Daikoku backoffice session will be accessible from Javascript |
| `play.http.session.maxAge` | number | 259200000 | the number of seconds before Daikoku backoffice session expired |
| `play.http.session.domain` | string | null | the domain on which the Daikoku backoffice session is authorized |
| `play.http.session.cookieName` |  string | "daikoku-session" | the name of the Daikoku backoffice session |
| `server.https.keyStore.path` |  string |  | the path to the keyStore containing the private key and certificate, if not provided generates a keystore for you |
| `server.https.keyStore.type` |  string | "JKS" | the keyStore type |
| `server.https.keyStore.password` |  string | "" | the password |
| `server.https.keyStore.algorithm` |  string |  | The keyStore algorithm, defaults to the platforms default algorithm |



## More config. options

See https://github.com/MAIF/daikoku/blob/master/daikoku/conf/base.conf and https://github.com/MAIF/daikoku/blob/master/daikoku/conf/application.conf

if you want to configure https on your Daikoku server, just read [PlayFramework documentation about it](https://www.playframework.com/documentation/2.6.x/ConfiguringHttps)

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
      name = "Super admin"
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
}

mongodb {
  uri = "mongodb://localhost:27017/daikoku"
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
