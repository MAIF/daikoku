#Managing APIs

## Create a new API
To create a new API, you can click on the `+ API` button in the catalog page or the `Create new API` button in the Team's APIs page in your back offices' team.
After clicking on the button localized in the catalog page, you need to choose a team which is the owner.

### API informations
An API needs a name to be created.
Then, you can add a small description, which will be displayed in the corresponding catalog's page.
The API can be published or not. In the latter case, you can consider this as a draft.
An image can be provide for the "card view" of the Api list page.
to go further in customization of Daikoku, the header of frontebd page of all APIs can be customized by HTML
> To keep the title and the description use {{title}} and {{description}} in your template. You can add a button with the `btn-edit` classname to add a direct link to API backoffice for your team members.

### Versions and tags
Versionning your API is supported. You can update the current version of your API.
@@@warning
Make sure that your main version is toggle as `use as last version` to be sure the link in the API list redirect to the correct version of your API.
@@@
Supported versions are pure information for your users.
Tags and categories are array of item, mostly used to filter APIs.

### Visibililty
Visibility can be:

* public: everybody can see the complete API.
* public with authorization: everybody sees just a part of the API, on the catalog's page (name, tags, categories and small desc.). Everybody can ask access to an admin of owner team.
* private: Just authorized teams have access to the API.

### Authorizations
The teams which have access to the API, in the case of visibility is private.

### Description
API description. Basically it can be written in markdown but you can use HTML.
The description can be set from team asset.

### Plans
An API needs a plan to be subscribed.
Plan needs a name, possibly a description and an @ref:[otoroshi instance](../tenantusage/1-otoroshi.md).

You can define a plan as **default plan** as it's possible to **make it private** (only accessible by the producer team)
It's possible to **allow multiple APIkeys** for a plan (by default a team can only have one API key).

It's important to choose a type of plan :

* free without quotas: a plan with an unlimited number of calls per day and per month.
* free with quotas: a plan with a limited number of calls per day and per month. Quotas will be set by default and can be overwritten.
* quotas with limit: a priced plan with a limited number of calls per day and per month. Quotas will be set by default but can be overwritten. A fixed cost by month can be set. 
* quotas without limit: a priced plan with unlimited number of calls per day and per month. Quotas will be set by default but can be overwritten. A fixed cost by month can be set. The cost per additional requests can be set.
* pay per use: a plan priced on usage. A fixed cost by month can be set. The cost per additional requests can be set.

####Otoroshi, billing and security
Depending on chosen plan type, certain custom properties may be accessibles.

- Plan needs an Otoroshi instance to allow users to subscribe. After choosing an instance, a list of Otoroshi service groups and services is accessible to link daikoku api/plan with one or more Otoroshi service group or services.
- As it's Otoroshi which manages apis, apikey quotas can be define.
- Daikoku provide, like [Otorshi](https://maif.github.io/otoroshi/manual/entities/apikeys.html), some apikey parameters.
- Daikoku side, billing informations can be filled (billing period, cost per month, currency ...)
- For security, you can force apikey rotation. it's an Otoroshi feature that will reset clientSecret every month with a grace period of 1 week (during this week both secrets works)
- Subscription can be: 
  * Automatic: subscriptions will be granted automatically.
  * Manual: subscriptions will require an acceptance by a team admin.
- You can force the integration process :
  * ApiKey: subscribers have access to an apikey to call api
  * Automatic: Subscribers have just access to a token, which link to a real apikey,  accessible by admin api. It's a perfect solution to integrate automatically your apikey in your prod environment if rotation is activated.

@@@ note { title='API key Metadata' }
As Otoroshi does, it's possible to add metadata on API keys. __Automatic metadata__ will be calculated and added after subscription validation. __Asked metadata__ will switch the plan subscription mode to manual then, on susbcription acceptation, a team admin will have to add the metadata manually. 
@@@

### Swagger
The swagger can be provided as a url or just some content paste on the UI.

### Testing

You can enable the testing for your API.

Click on the `Generate a dedicated testing key in Otoroshi` to choose an otoroshi instance and and service group or service which is used to receive the testing APIkey. Then, just follow the instruction display on UI?

#### Configure your openAPI

Your openAPI have to be configured to accept apikey from Basic authentication header or from the `Otoroshi-Client-Id` and `Otoroshi-Client-Secret` headers.

If you had changed the Otoroshi headers to pass the apikey don't forget to apply the changes on your openAPI.

```json
...
paths:
  /api/_verify:
    get:
      summary: Verification using query params
      operationId: getVerify
      ...
      security:
      - basicAuth: []
      - otoClientId: []
        otoClientSecret: []
components:
  schemas:
  securitySchemes:
    basicAuth:
      type: http
      scheme: basic
    otoClientId:
      type: apiKey
      name: Otoroshi-Client-Id
      in: header
    otoClientSecret:
      type: apiKey
      name: Otoroshi-Client-Secret
      in: header
```



@@@warning
Make sure this service descriptor is the right one for testing and not your production system !
@@@

### Documentation
The documentation tabs allows you to create a paginated documentation. Like description every pages can be written with markdown or set from asset.

## Manage subscription

On the team APIs screen on your team back office, it's possible to manage for every APIs its [subscriptions](./2-subscriptions.md) by clicking on the `key` button.
You can activate/deactivate API keys or update metadata.

## Api consumptions
On the team APIs screen on your team back office, it's possible to see for every APIs consumptions by clicking on the `stats` button. Global stats by default but visible by API key or usage plan.