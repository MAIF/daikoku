<div align="center">
  <h1><code>daikoku</code></h1>
</div>

![CLI architecture](architecture.png "Architecture")


# Installation

This project can be installed and compiled from source with this Cargo command:

```
$ cargo install daikoku
or
$ brew tap maif/daikoku
$ brew install daikoku
```

Additionally there are [precompiled artifacts built on CI][artifacts] which are
available for download as well.

[artifacts]: https://github.com/MAIF/daikoku/releases

Installation can be confirmed with:

```
$ daikoku version
```

Subcommands can be explored with:

```
$ daikoku help
```

# Core commands

Daikokucli uses your home folder to store the list of projects inside a `.daikoku` file. Each project created with the CLI should contain a `src` folder and a `.daikoku/.environments`. This file will contain

You can start a new project from scratch

```sh
daikoku init --name=<PROJECT_NAME> --path=<PROJECT_PATH_OR_CURRENT_FOLDER>
``` 

or import an existing one

```sh
daikoku clone --name=<PROJECT_NAME> --path=<PROJECT_PATH_OR_CURRENT_FOLDER>
--server=<DAIKOKU_SERVER>
--token=<DAIKOKU_TOKEN>
``` 

then add a default Daikoku environment  

```sh
daikoku environments add --name=<ENVIRONMENT_NAME> --server=<ENVIROMNENT_SERVER>
``` 

> The Daikoku server has to be reachable and will be checked before saving the configuration


you can sync the new project with your Daikoku instance and fetch the mails template

```sh
daikoku sync mail
```

you can start to develop and watch file changes

```sh
daikoku watch
``` 

Common practices involve utilizing the directives within the Daikoku CMS to access private entities based on the connected user's permissions. You have the option to configure the token for accessing your CMS with an authenticated user by pasting the token from your Daikoku profile page.

```sh
daikoku login --token=<YOUR_TOKEN>
```

If you have many environments you can switch between us simply using

```sh
daikoku watch --environment=<NAME_OF_YOUR_ENVIRONMENT>
``` 

or permanently by changing the default project or environment

```sh
daikoku environments default --name=<NAME_OF_YOUR_ENVIRONMENT>
daikoku projects default --name=<NAME_OF_YOUR_PROJECT>
``` 

you can view the currently used project and the others
```sh
daikoku projects list
``` 

At anytime, you can track an existing CMS folder or update its information
```sh
daikoku projects add --name=<NAME_OF_YOUR_PROJECT> --path=<PATH_TO_YOUR_PROJECT> --overwrite=<true|false>
``` 

Once ready, you can synchronize your sources with the Daikoku environment
```sh
daikoku sync
```

## Start a new project by importing an existing one

If you already have a legacy CMS on your Daikoku, you can start by importing it 
```sh
daikoku projects import --name=<NEW_NAME_OF_YOUR_PROJECT> \
                           --path=<PATH_TO_THE_NEW_PROJECT> \
                           --server=<DAIKOKU_SERVER_TO_PULL> \
                           --token=<AUTHENTICATION_TOKEN>
```

# Manage your assets

You can manage your images, diagrams, or any type of files directly by creating a `/assets` folder inside your CMS project.

Each asset is save in the S3 of your Daikoku using the following command
```sh
daikoku assets add --filename=<ASSET_FILENAME> \
  --path=<ONLY_NESTED_FOLDER_BEHIND_ASSETS_FOLDER> \
  --desc=<ASSET_DESCRIPTION> \
  --title=<ASSET_TITLE>
  --slug=<ASSET_SLUG>
```

If you require a particular `slug` for your asset, you have the option to replace the automatically generated one by specifying the `slug` field. Additionally, you can exclude the `path` field, which is only necessary when creating an asset from a subfolder within the `assets` directory.

To delete your asset you have to give the `filename` and the `slug` iif it differs

```sh
daikoku assets remove --slug=<CUSTOM_SLUG> --filename=<ASSET_FILENAME>
```

As others commands, you can display all registered assets 
```sh
daikoku assets list
```

If you prefer to synchronize all assets with a single command, it offers speed advantages over doing so individually, albeit with reduced configurability.
```sh
daikoku assets sync
```

# Authorized applications

Just before running the `daikoku login` command, you have to configure your tenant by adding the CLI server. By default, the server is set to `http://localhost:3334` but you can overwrite it using the `WATCHING_PORT` environment variable.

```sh
daikoku login
```

# CMS Directives

## daikoku-user

`parameters`: 
- string user id
```html
{{#daikoku-user "{{userId}}"}}
  <div>
    <span>{{user.name}}</span>
    <img src="{{user.picture}}" />
  </div>
{{/daikoku-user}}
```

## daikoku-owned-apis

`parameters`
- visibility: can be Private | Public | All
```html
{{#daikoku-owned-apis visibility="Private"}}
  <span>Mon api : {{api.name}}</span>
{{/daikoku-owned-apis}}
```

## daikoku-owned-api
`parameters`: 
- String API id
- The API version is optional, but it defaults to 1.0.0 when not specified.
      
```html
{{#daikoku-owned-api "{{apiId}}" version="1.0.0"}}
  <span>Mon api : {{api.name}}</span>
{{/daikoku-owned-api}}
```

## daikoku-json-owned-apis
`parameters`: 
- Visibility : Private, Public or All
```html
{{#daikoku-json-owned-apis visibility="Private"}}

{{/daikoku-json-owned-apis}}
```
  
## daikoku-json-owned-api
`parameters`: 
- The API id, string value expected
- The API version is optional, but it defaults to 1.0.0 when not specified.

```html
{{#daikoku-json-owned-api "{{apiId}}" version="1.0.0"}}
{{/daikoku-json-owned-api}}
```

## daikoku-owned-teams

```html
{{#daikoku-owned-teams}}
  <span>Ma team : {{team.name}}
{{/daikoku-owned-teams}}
```

## daikoku-owned-team
`parameters`: 
- The team ID, string value expected"
```html
{{#daikoku-owned-team "{{teamId}}"}}
  <span>Mon team : {{team.name}}</span>
{{/daikoku-owned-team}}
```

## daikoku-json-owned-teams

```html
{{daikoku-json-owned-teams}}
```

## daikoku-json-owned-team
`parameters`: 
- The Team ID, String value expected
        
```html
{{#daikoku-json-owned-team "{{teamId}}"}}

{{/daikoku-json-owned-team}}
```

## tenant

```html
{{tenant.name}} - {{tenant.style.description}}
```

## is_admin
        
```html
{{is_admin}}
```
    
## connected
        
```html
{{connected}}
```

## user

When you have an user returned from directive, you can use the following fields
      
  - `name`
  - `email`
  - `_id`
  - `_humandReadableId`
  - `picture`
  - `isDaikokuAdmin`
  - `starredApis`

```html
<div>
  {{user.name}} - {{user.email}}
</div>
```

## request
```html
<div>
  {{request.path}} - {{request.method}} - {{request.headers}}
</div>
```

## daikoku-css
```html
<div>
  {{daikoku-css}}
</div>
```

## for
`parameters`: 
- the fieldname used in the helper content
        
```
{{#for '{{team.users}}' field='myuser' }}
  {{myuser.userId}}
{{/for}}
```

## size
        
```html
{{size '{{team.users}}'}}
```

## ifeq

```html
{{#ifeq "{{plan.type}}" "FreeWithoutQuotas"}}
  You'll pay nothing and do whatever you want
{{/ifeq}}
```

## ifnoteq
      
```html
{{#ifnoteq "{{plan.type}}" "FreeWithoutQuotas"}}
  You'll pay nothing and do whatever you want
{{/ifnoteq}}
```

## getOrElse
        
```html
{{getOrElse "{{plan.customName}}" "Un plan"}}
```

## translate

```html
{{translate 'Logout'}}
```

## daikoku-path-param
`parameters`: 
- the position of the path params
        
```html
{{daikoku-path-param '0'}}
```

## daikoku-query-param
`parameters`: 
- the name of the query param

```html        
{{daikoku-query-param 'my-query-param'}}
```


## daikoku-template-wrapper
`parameters`: 
- Block path
- List of key=value usable in content

```html
{{#daikoku-template-wrapper '<wrapper-id>' <named-parameter>="<value>" }} 
  
{{/daikoku-template-wrapper}}"
```


## daikoku-apis

```html
{{#daikoku-apis}}
  <span>Api : {{api.name}}</span>
{{/daikoku-apis}}
```

## daikoku-api

`parameters`: 
- API id, String value expected

```html
{{#daikoku-api "{{apiId}}" version="1.0.0"}}
  <span>Mon api : {{api.name}}</span>
{{/daikoku-api}}"
```

## daikoku-json-apis

```html
{{daikoku-json-apis}}
```

## daikoku-json-api

`parameters`: 
- API Id, String value expected

```html
{{#daikoku-json-api "{{apiId}}" version="1.0.0"}}

{{/daikoku-json-api}}
```

## daikoku-teams

```html
{{#daikoku-teams}}
  <span>Team : {{team.name}}</span>
{{/daikoku-teams}}
```

## daikoku-team

`parameters`: 
- Team Id, String value expected
        
```html
{{#daikoku-team "{{<teamId>}}"}}
  <span>My team : {{team.name}}</span>
{{/daikoku-team}}
```


## daikoku-json-teams

```html
{{daikoku-json-teams}}
```

## daikoku-json-team

`parameters`:
- Team Id, String value expected
        
```html
{{#daikoku-json-team "{{<teamId>}}"}}

{{/daikoku-json-team}}
```

## daikoku-documentations

`parameters`: 
- API id, String value expected
        
```html
{{#daikoku-documentations "{{<apiId>}}"}}
  <span>{{documentation.title}}</span>
{{/daikoku-documentations}}
```

## daikoku-documentations-page
        
`parameters`: 
- API ID, String value expected
- Page ID as String value
        
```html
{{#daikoku-documentations-page "<apiId>" page="<pageId>"}}
  {{documentation.content}}
{{/daikoku-documentations-page}}
```

## daikoku-documentations-page-id
       
`parameters`: 
- Team ID, String value expected
- The named page parameter corresponding to the id of the expected page

```html
{{#daikoku-documentations-page-id "<apiId>" page="<pageId>"}}
  {{content}}
{{/daikoku-documentations-page-id}}"
```

## daikoku-plans
        
`parameters`: 
- API ID

```html
{{#daikoku-plans "<apiId>"}}
  <span>{{plan.type}}</span>
{{/daikoku-plans}}
```

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.


#### Run tests
```
cargo test --test <filename> -- --nocapture --test-threads 1
```
