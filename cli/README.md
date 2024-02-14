<div align="center">
  <h1><code>wasmo</code></h1>

<strong>A <a href="https://github.com/MAIF/">MAIF</a> opensource project</strong>

  <p>
    <strong>Wasmo CLI brings WASM to your architecture</strong>
  </p>

  <p>
  Wasmo CLI can be combined with the power of <a href="https://hub.docker.com/r/maif/wasmo">Docker Wasmo server images</a> to build locally and remotely WASM binaries.
  </p>
</div>


# Installation

This project can be installed and compiled from source with this Cargo command:

```
$ cargo install wasmo
or
$ brew tap maif/wasmo
$ brew install wasmo
```

Additionally there are [precompiled artifacts built on CI][artifacts] which are
available for download as well.

[artifacts]: https://github.com/MAIF/wasmo/releases

Installation can be confirmed with:

```
$ wasmo --version
```

Subcommands can be explored with:

```
$ wasmo help
```

# Core commands

The `wasmo` CLI internally contains a number of subcommands for working
with wasm modules:

| Tool                        | Arguments | Description                                                   |
| ---------------------------- | -- | ------------------------------------------------------------- |
| `wasmo config set`            | path &#124; server &#124; clientId &#124; clientSecret | Globally configure the CLI with the path where the configuration file will be stored and the server to reach during the build. These parameters are optional and can be passed when running the build command.  |
| `wasmo config get`         |    | Get the configuration from the configured path file or from `$HOME/.wasmo` |
| `wasmo config reset`        |     | Clean configuration and reset to default settings. The default file path configuration will be `$HOME/.wasmo`                                   ||
| `wasmo init`             | template &#124; name &#124; path | Initialize a WASM plugin to the specific path. You can choose between many templates, javascript/typescript (js/ts), Open Policy Agent (opa), Rust or Golang (go). |
| `wasmo build`             | path &#124; host &#124; server &#124; clientId &#124; clientSecret | Build the plugin  by sending the contents to the remote or local Wasmo server. As soon as the build is complete, the WASM binary is donwloaded and saved in the plugin folder. |

# Quick start

``` 
wasmo init --name=my-first-plugin --template=js
wasmo build --host=OneShotDocker --path=my-first-plugin
```

Then open the content of your `my-first-plugin` folder. You should find the generated WASM binary named `my-first-plugin-1.0.0.wasm`.

## Selecting a template

You can now optionally start a new plugin from a template by appending `--template=[template-name]` to the creation command.

If you don't pass a template, Wasmo will list the available templates: `js`, `ts`, `opa`, `go` and `rust`.

```
wasmo init --name=my-first-plugin --template=[template-name] --path=[output-directory]
```

Running this command with any of theses templates will create a directory called `my-first-plugin` inside the specified output directory (or the current if omitted). Inside that directory, it will generate the initial project structure with the metadata file pre-filled with the name of your plugin.

## Creating a production WASM binary

`wasmo build` starts the process to build a WASM binary of your plugin. Inside the plugin directory will be your WASM binary and sources.

You have two ways to build your plugin:
  - locally with Docker
  - remotely by deploying a [Wasmo server][wasmoserver]

[wasmoserver]: https://github.com/MAIF/wasmo

Assuming we want to build our `my-first-plugin` locally. Enter `wasmo build --host=OneShotDocker --path=my-first-plugin` to start the build. 

Let's explain these 3 parameters:
  - the `path` parameter is explicitly used to indicate the plugin to build
  - the `host` indicates which kind of Wasmo server used. The pratical way is to use `Docker` or `OneShotDocker` because it prevents to install a Wasmo server by deploying, inside your locally Docker, a new Wasmo container. The last possible value is `Remote` and can be used to specify with a URI the remote Wasmo server used.
<!-- 
[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/NdbQR6vQ5Sk/0.jpg)](https://www.youtube.com/watch?v=NdbQR6vQ5Sk) -->

## Configure your configuration file

```
wasmo config get
wasmo config reset
wasmo config set <key>=<value>
```
Note: This command is unaware of workspaces.

### Description

wasmo gets its config from the command line, environment variables, `.wasmo` files, and in some cases, directly from the build command.

The `wasmo config` command can be used to update and edit the contents of the user and global wasmo files.

### Sub-commands

#### set

```
wasmo config set <key>=<value>
```

Sets each of the config keys to the value provided.

If value is omitted, then it sets it to an empty string.

The available keys are: 
  - `path`: configure the path where the wasmo configuration will be stored
  - `server`: the Wasmo server to build your plugins (an URL format value is expected)
  - `clientId`: the client id used in Basic and Otoroshi Auth
  - `clientSecret`: the client secret used in Basic and Otoroshi Auth

You can also edit the configuration file manually. In this case, the following values are :
  - `path` = WASMO_PATH
  - `server` = WASMO_SERVER

#### get 

```
wasmo config get
```

Show all the config settings.


#### reset

```
wasmo config get
```

Reset the configuration file with the default settings. The custom user `.wasmo` files will not be deleted.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.