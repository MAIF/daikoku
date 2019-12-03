# Run Daikoku

Now you are ready to run Daikoku. You can run the following command with some tweaks depending on the way you want to configure Daikoku. If you want to pass a custom configuration file, use the `-Dconfig.file=/path/to/file.conf` flag in the following commands.

## From .zip file

```sh
unzip daikoku-dist.zip
cd daikoku-vx.x.x
./bin/daikoku
```

## From .jar file

For Java 11

```sh
java -jar daikoku.jar
```

## From docker

```sh
docker run -p "8080:8080" maif/daikoku:1.0.0
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
docker run -p "8080:8080" -v "$(pwd):/usr/app/daikoku/conf" maif/daikoku
```

You can also use a volume if you choose to use exports files :

```sh
docker run -p "8080:8080" -v "$(pwd):/usr/app/daikoku/imports" maif/daikoku -Ddaikoku.init.data.from=/usr/app/daikoku/imports/export.ndjson
```

## Run examples

```sh
$ java \
  -Xms2G \
  -Xmx8G \
  -Dhttp.port=8080 \
  -Ddaikoku.init.data.from=/home/user/daikoku.ndjson \
  -Dconfig.file=/home/user/daikoku.conf \
  -jar ./daikoku.jar

[warn] otoroshi-in-memory-datastores - Now using InMemory DataStores
[warn] otoroshi-env - The main datastore seems to be empty, registering some basic services
[warn] otoroshi-env - Importing from: /home/user/otoroshi.json
[info] play.api.Play - Application started (Prod)
[info] p.c.s.AkkaHttpServer - Listening for HTTP on /0:0:0:0:0:0:0:0:8080
```

If you choose to start Daikoku without importing existing data, Daikoku will create a new admin user and print the login details in the log.

```sh
$ java \
  -Xms2G \
  -Xmx8G \
  -Dhttp.port=8080 \
  -jar otoroshi.jar

[warn] otoroshi-in-memory-datastores - Now using InMemory DataStores
[warn] otoroshi-env - The main datastore seems to be empty, registering some basic services
[warn] otoroshi-env - You can log into the Otoroshi admin console with the following credentials: admin@otoroshi.io / HHUsiF2UC3OPdmg0lGngEv3RrbIwWV5W
[info] play.api.Play - Application started (Prod)
[info] p.c.s.AkkaHttpServer - Listening for HTTP on /0:0:0:0:0:0:0:0:8080
```
