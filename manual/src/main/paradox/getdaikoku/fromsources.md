# From sources

to build Daikoku from sources, you need the following tools :

* git
* JDK 11
* SBT
* node
* yarn

Once you've installed all those tools, go to the [Daikoku github page](https://github.com/MAIF/daikoku) and clone the sources :

```sh
git clone https://github.com/MAIF/daikoku.git --depth=1
```

then you need to run the `build.sh` script to build the documentation, the React UI and the server :

```sh
sh ./scripts/build.sh
```

and that's all, you can grab your Daikoku package at `daikoku/target/scala-2.12/daikoku` or `daikoku/target/universal/`.

For those who want to build only parts of Daikoku, read the following.

## Build the documentation only

Go to the `documentation` folder and run :

```sh
sbt ';clean;paradox'
```

The documentation is located at `documentation/target/paradox/site/main/`

## Build the React UI

Go to the `daikoku/javascript` folder and run :

```sh
yarn install
yarn webpack:build
```

You will find the JS bundle at `daikoku/public/react-app/daikoku.js`.

## Build the Daikoku server

Go to the `daikoku` folder and run :

```sh
sbt ';clean;compile;dist;assembly'
```

You will find your Daikoku package at `daikoku/target/scala-2.12/daikoku` or `daikoku/target/universal/`.
