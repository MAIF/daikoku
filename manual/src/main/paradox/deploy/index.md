# Deploy to production

Now it's time to deploy Daikoku in production, in this chapter we will see what kind of things you can do.

## Deploy with Docker

Daikoku is available as a Docker image on DockerHub so you can just use it in any Docker compatible environment

```sh
docker run -p "8080:8080" maif/daikoku:1.0.7
```

You can also pass useful args like :

```
docker run -p "8080:8080" daikoku -Dconfig.file=/usr/app/daikoku/conf/daikoku.conf -Dlogger.file=/usr/app/daikoku/conf/daikoku.xml
```

If you want to provide your own config file, you can read @ref:[the documentation about config files](../firstrun/configfile.md).

You can also provide some ENV variable using the `--env` flag to customize your Daikoku instance.

The list of possible env variables is available @ref:[here](../firstrun/env.md).

You can use a volume to provide configuration like :

```sh
docker run -p "8080:8080" -v "$(pwd):/usr/app/daikoku/conf" maif/daikoku:1.0.7
```

You can also use a volume if you choose to use exports files :

```sh
docker run -p "8080:8080" -v "$(pwd):/usr/app/daikoku/imports" maif/daikoku :1.0.7 -Ddaikoku.init.data.from=/usr/app/daikoku/imports/export.ndjson
```

## Deploy manually

As Daikoku is a PlayFramwork application, you can follow the [PlayFramework documentation](https://www.playframework.com/documentation/2.6.x/Production) to deploy your application.
