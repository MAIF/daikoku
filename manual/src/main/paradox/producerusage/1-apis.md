#Managing Apis

## Create a new api
To create a new api, you can click on the `+ api` button in the catalog page or the `Create new api` button in the Team apis page in your back offices's team.
After clicking on the button localized in the catalog page, you need to choose a team which is the owner.

### Api informations
An api needs a name to be created.
Then, you could add a small description, displayed in the catalog page.
Api can be published or not. In the latter case, you can consider it as a draft.

### Versions and tags
here are just pure information like current version of the api and supported versions.
Tags and categories are array of item, mostly used to filter apis.

### Visibililty and subscription
Visibility can be:

* public: everybody could see the complete api
* public with authorization: everybody could see just a part of the api, in the catalog page (name, tags, categories and small desc.). Everybody could ask an access to see more to an admin of owner team.
* private: Just authorized teams have access to the api.

Subscription can be: 

* Automatic: all api subscriptions will be accepted automatically
* Manual: api subscriptions will require an acceptance by a team admin


### Authorizations
The teams which have accessed to the api, in the case of visibility is private.

### Description
The api description.
Basically it could be written in markdown.
The description can be set from team asset.

### Plans
An api need plan to be subscribed.
Plan need name, eventually description and mostly an [otoroshi instance](../tenantusage/1-otoroshi.md)
It's possible to allow multiple apikey for a plan for teams.

It's important to choose a type of plan need to be choosen :

* free without quotas: a plan with unlimited number of calls per day and per month
* free with quotas: a plan with limited number of calls per day and per month. Quotas set by default but can be overwritten.
* quotas with limit: a priced plan with limited number of calls per day and per month. Quotas set by default but can be overwritten. A fixed cost by month can be set. 
* quotas without limit: a priced plan with unlimited number of calls per day and per month. Quotas set by default but can be overwritten. A fixed cost by month can be set. The cost per additional requests can be set.
* pay per use: a plan priced on usage. A fixed cost by month can be set. The cost per additional requests can be set.

### Swagger
The swagger can be an url or just some content paste on the UI

### Testing
You can enable the testing for your ap.
Click on the `Generate a dedicated testing key in Otoroshi` to choose an otoroshi instance and and service group which is used to receive the testing apikey.

@@@warning
Make sure this service descriptor is the right one for testing and not a production system.
@@@

### Documentation
the last tabs allows you to create a paginate documentation. Like description every page can be written with markdown or set from asset.