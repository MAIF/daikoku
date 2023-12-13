# Run Daikoku

Now you are ready to run Daikoku. You can run the following command with some tweaks depending on the way you want to configure Daikoku. If you want to pass a custom configuration file, use the `-Dconfig.file=/path/to/file.conf` option in the following commands.

## From .zip file

```sh
unzip daikoku-x.x.x.zip
cd daikoku
./bin/daikoku
```

## From .jar file

For Java 21

```sh
java -jar daikoku.jar
```

## From docker

```sh
docker run -p "8080:8080" maif/daikoku
```

You can also pass useful args like :

```
docker run -p "8080:8080" daikoku -Dconfig.file=/usr/app/daikoku/conf/daikoku.conf -Dlogger.file=/usr/app/daikoku/conf/daikoku.xml
```

If you want to provide your own config file, you can read [the documentation about config files](../05-firstrun/configfile.md).

You can also provide some ENV variable using the `--env` flag to customize your Daikoku instance.

The list of possible env variables is available [here](../05-firstrun/env.md).

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

[info] play.api.Play - Application started (Prod)
[warn] daikokuEnv - Main dataStore seems to be empty, importing from /home/user/daikoku.conf ...
[warn] daikokuEnv - Importing from: /home/user/daikoku.ndjson
[info] p.c.s.AkkaHttpServer - Listening for HTTP on /0:0:0:0:0:0:0:0:8080
```

If you choose to start Daikoku without importing existing data, Daikoku will create a new admin user and print the login details in the log.

```sh
$ java \
  -Xms2G \
  -Xmx8G \
  -Dhttp.port=8080 \
  -jar daikoku.jar

[info] play.api.Play - Application started (Prod)
[warn] DaikokuEnv - Main dataStore seems to be empty, generating initial data ...
[info] p.c.s.AkkaHttpServer - Listening for HTTP on /0.0.0.0:8080
[warn] DaikokuEnv -
[warn] DaikokuEnv - You can log in with admin@daikoku.io / wr4pHmVRArCGhHoteMfwqV6UuvQh6J2z
[warn] DaikokuEnv -
[warn] DaikokuEnv - Please avoid using the default tenant for anything else than configuring Daikoku
[warn] DaikokuEnv -

```
