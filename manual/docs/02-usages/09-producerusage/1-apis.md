# Managing APIs

## Create a new API
To create a new API, you can click on the `+ API` button in the catalog page or the `Create new API` button in the Team's APIs page in your back offices' team.
After clicking on the button localized in the catalog page, you need to choose a team which is the owner.

### API informations
An API needs a name to be created.
Then, you can add a small description, which will be displayed in the corresponding catalog's page.
The API can be published or not. In the latter case, you can consider this as a draft.
An image can be provide for the "card view" of the Api list page.
to go further in customization of Daikoku, the header of frontebd page of all APIs can be customized by HTML
> To keep the title and the description use title and description surrended by double brace in your template. You can add a button with the `btn-edit` classname to add a direct link to API backoffice for your team members.

### Versions and tags
Versionning your API is supported. You can update the current version of your API.
:::warning
Make sure that your main version is toggle as `use as last version` to be sure the link in the API list redirect to the correct version of your API.
:::
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
Plan needs a name, possibly a description and an [otoroshi instance](../08-tenantusage/1-otoroshi.md).

You can define a plan as **default plan** as it's possible to **make it private** (only accessible by the producer team)
It's possible to **allow multiple API keys** for a plan (by default a team can only have one API key).
It's possible to **allow API keys aggregation**

It's important to choose a type of plan :

* **free without quotas**: a plan with an unlimited number of calls per day and per month.
* **free with quotas**: a plan with a limited number of calls per day and per month. Quotas will be set by default and can be overwritten.
* **quotas with limit**: a priced plan with a limited number of calls per day and per month. Quotas will be set by default but can be overwritten. A fixed cost by month can be set. 
* **quotas without limit**: a priced plan with unlimited number of calls per day and per month. Quotas will be set by default but can be overwritten. A fixed cost by month can be set. The cost per additional requests can be set.
* **pay per use**: a plan priced on usage. A fixed cost by month can be set. The cost per additional requests can be set.

The subscription process in Daikoku offers flexibility, allowing users to customize their validation steps. There are three possible types of steps:

  * **Admin Validation**: This step requires an administrator from the AP I's owning team to validate the subscription request. When a request is submitted, all administrators in the team receive a Daikoku notification and an email containing the request details. The first administrator who validates the notification approves the step.
> it's possible to configure this step to display a specific form when user ask subscription.
> to parameter the form, we use the json language use by [@maif/react-forms](https://github.com/MAIF/react-forms#maifreact-forms).
> You can write a formatter to format the form response as a notification sended to admins. it's just a string with a replacement pattern like this `[[label]]`
> the result of the form is used to automatically generate metadata which will be deleteable or modifiable before validation by the admin

  * **HTTP Request**: This step is a semi-automatic step. A http POST is sended to an API with the whole context of the subscription demand
A json response is awaited with a precise format.
> a property `accept` as boolean to accept or reject the subscription demand
> it totally possible to calculate and give some metadata or custom property for the subscription to created
> ```json
> {
>   "accept": true,
>   "customMaxPerDay": 42,
>   "customMaxPerSecond": 42,
>   "customMaxPerMonth": 42,
>   "customMetadata": {
>     "value1": 2,
>     "value2": true,
>     "value3": "foo"
>   },
>   "adminCustomName": "foo-bar-apikey",
>   "customReadOnly": true
> }
> ```
> the body of the call contains lot of data as the context:  the subscription demand with the other step information, the api, the usage plan, the team and the aggragation in case of an aggergated apikey
> ```json
> {
>   "demand": {},
>   "api": {},
>   "plan": {},
>   "team": {},
>   "aggregate": {
>     "parent": {
>       "api": {},
>       "plan": {},
>       "subscription": {} 
>     },
>     "subscriptions": [
>       {
>         "api": {},
>         "plan": {},
>         "subscription": {} 
>       }
>     ]
>   } 
> }
> ```

  * **Email Validation**: This step involves a third-party person validating the subscription request by clicking on a validation link sent to the provided email address. Once the person clicks on the link, the request is validated, and the user is redirected to a public acknowledgment interface.

  * **Payment Validation**: This step requires the requester to make a payment through a payment gateway. The user is redirected to a payment page provided by the payment gateway where they need to enter their payment information. Once the payment is validated, the subscription is approved, and the user is redirected to Daikoku's home page.

> When a consumption plan for an API is priced, after its creation, one or more Stripe products are created based on the plan type:
> 
>  **Quotas Only**: A fixed-price subscription product is created.
> 
> **Quotas / Pay Per Use**: Two products are created: a fixed-price subscription and a variable component linked to the user's consumption, which is synchronized with Stripe at the end of each day.
> 
> **Pay Per Use**: Similarly, two products are created: a fixed-price subscription and a variable component linked to the user's consumption.


:::warning
Please note that the email validation step can be used multiple times, while the other steps can only be completed once in the process.
:::

The subscription process can be customized by adding new steps based on specific requirements. 
>Daikoku is an open-source project, and we encourage community initiatives to contribute new step types. We invite contributors to submit Pull Requests on the [project's GitHub repository](https://github.com/MAIF/daikoku) to propose new features.

To visualize and customize the subscription process, you can access the "Process" tab from the plan modification page. From this tab, you can view the entire process, add new steps, modify existing ones, or delete steps. 

:::warning
Please be aware that modifying or deleting a step immediately affects ongoing requests, either modifying them or validating them if necessary.
:::

When submitting a subscription request, the only required data is the team for which you want to subscribe. The subscription process may also prompt you to provide a motivation, particularly if the admin validation step is included. In such cases, a modal window appears to allow for detailed motivation for the request.

Once the subscription request is validated or declined, notifications and emails are generated to inform the user of the request's status.

If your subscription plan is associated with consumption-based pricing, you can also modify certain billing information, such as your name, address, and payment details. The link to the billing information modification page, stored by the payment gateway, can be found on Daikoku's billing page.

#### Otoroshi, billing and security
Depending on chosen plan type, certain custom properties may be accessibles.

- Plan needs an Otoroshi instance to allow users to subscribe. After choosing an instance, a list of Otoroshi service groups and services is accessible to link daikoku api/plan with one or more Otoroshi service group or services.
- As it's Otoroshi which manages apis, apikey quotas can be define.
- Daikoku provide, like [Otoroshi](https://maif.github.io/otoroshi/manual/entities/apikeys.html), some apikey parameters.
- Daikoku side, billing informations can be filled (billing period, cost per month, currency ...)
- For security, you can force apikey rotation. it's an Otoroshi feature that will reset clientSecret every month with a grace period of 1 week (during this week both secrets works)
- You can force the integration process :
  * ApiKey: subscribers have access to an apikey to call api
  * Automatic: Subscribers have just access to a token, which link to a real apikey, accessible by admin api. It's a perfect solution to integrate automatically your apikey in your prod environment if rotation is activated.

:::note
As Otoroshi does, it's possible to add metadata on API keys. __Automatic metadata__ will be calculated and added after subscription validation. __Asked metadata__ will switch the plan subscription mode to manual then, on susbcription acceptation, a team admin will have to add the metadata manually. 
:::

### OpenAPI definition
The OpenAPI definition can be provided as a url or just some content paste on the UI.
an additional configuration allow to 

### Testing

You can enable the testing for your API.

> The testing is based on the openAPI definition of your API. Beware of set up the right host of your testing service.

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



:::warning
Make sure this service descriptor is the right one for testing and not your production system !
:::

### Documentation
The documentation tabs allows you to create a paginated documentation. Like description every pages can be written with markdown or set from asset.

## Manage subscription

On the team APIs screen on your team back office, it's possible to manage for every APIs its subscriptions by clicking on the `key` button.
You can activate/deactivate API keys or update metadata.

## Api consumptions
On the team APIs screen on your team back office, it's possible to see for every APIs consumptions by clicking on the `stats` button. Global stats by default but visible by API key or usage plan.