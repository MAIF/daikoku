# Managing APIs

## Create a new API
To create a new API, you can click on the `+ API` button in the catalog page or the `Create new API` button in the Team's APIs page in your back office's team.
After clicking on the button localized in the catalog page, you need to choose a team which is the owner.

### API information
An API needs a name to be created.
Then, you can add a small description, which will be displayed on the corresponding catalog's page.
The API can be published or not. In the latter case, you can consider this as a draft.
An image can be provided for the "card view" of the API list page.
To go further in the customization of Daikoku, the header of frontend page of all APIs can be customized by HTML
> To keep the title and the description, use the title and description surrended by a double brace in your template. You can add a button with the `btn-edit` classname to add a direct link to the API backoffice for your team members.

### Versions and tags
Versioning your API is supported. You can update the current version of your API.
:::warning
Make sure that your main version is toggle as `use as last version` to be sure the link in the API list redirects to the correct version of your API.
:::
Supported versions are pure information for your users.
Tags and categories are arrays of items, mostly used to filter APIs.

### Visibility
Visibility can be:

* public: everybody can see the complete API.
* public with authorization: everybody sees just a part of the API, on the catalog's page (name, tags, categories and small desc.). Everybody can ask for access to an admin of owner team.
* private: Only authorized teams have access to the API.

### Authorizations
The teams that have access to the API, in the case of visibility are private.

### Description
API description. Basically, it can be written in MarkDown, but you can also use HTML.
The description can be set as a team asset.

### Plans
An API needs a plan to be subscribed.
Plan needs a name, possibly a description and an [Otoroshi instance](../08-tenantusage/1-otoroshi.md).

You can define a plan as the **default plan**, as it's possible to **make it private** (only accessible by the producer team).
It's possible to **allow multiple API keys** for a plan (by default, a team can only have one API key).
It's possible to **allow API keys aggregation**

:::info
Since version `18.2.0` plans no longer have predefined types.
:::

Plans in Daikoku are fully configurable. 
Each plan can define **quotas** (e.g., number of allowed requests per windows/sec, day or month) and **pricing** settings (e.g., fixed monthly costs, per-request pricing). 

By combining these options, you can create plans tailored to different use cases, whether free, quota-based, or pay-per-use, without being constrained by predefined categories.

The subscription process in Daikoku offers flexibility, allowing users to customize their validation steps. There are three possible types of steps:

  * **Admin Validation**: This step requires an administrator from the API's owning team to validate the subscription request. When a request is submitted, all administrators in the team receive a Daikoku notification and an email containing the request details. The first administrator who validates the notification approves the step.
> It's possible to configure this step to display a specific form when the user asks for a subscription.
> To parameterize the form, we use the JSON language used by [@maif/react-forms](https://github.com/MAIF/react-forms#maifreact-forms).
> You can write a formatter to format the form response as a notification sent to admins. It's just a string with a replacement pattern like this `[[label]]`
> the result of the form is used to automatically generate metadata which will be deletable or modifiable before validation by the admin

  * **HTTP Request**: This step is a semi-automatic step. A HTTP POST is sent to an API with the whole context of the subscription demand.
A JSON response is awaited with a precise format.
> A property `accept` as boolean to accept or reject the subscription demand
> it totally possible to calculate and give some metadata or custom property for the subscription to created
> ```json
> {
>   "accept": true, //mendatory
>   "customMaxPerDay": 42, //set quotas value for max request per day for API key
>   "customMaxPerSecond": 42, //set Quotas value for max request per second for API key
>   "customMaxPerMonth": 42, //set Quotas value for max request per Month for API key
>   "customMetadata": { //set metadata (merge with automatic metadata) for API key
>     "value1": 2,
>     "value2": true,
>     "value3": "foo"
>   },
>   "adminCustomName": "foo-bar-apikey", //admin custom name is a subscription name only visible by api producer
>   "customReadOnly": true, //set readonly property for APIkey
>   "customName": "bar-foo-apikey", //custom name is the subscription name visible by consumer (it can be overwritten by him)
>   "tags": ["tag 1", "tag 2"] //merge tags with automatic tags and set tags of API key. be aware of tags are displayed for consumer in UI
> }
> ```
> The body of the call contains a lot of data in the context: the subscription demand with the other step information, the API, the usage plan, the team and the aggregation in case of an aggregated apikey
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
Depending on the chosen plan type, certain custom properties may be accessible.

- Plan needs an Otoroshi instance to allow users to subscribe. After choosing an instance, a list of Otoroshi service groups and services is accessible to link Daikoku API/plan with one or more Otoroshi service groups or services.
- As it's Otoroshi which manages APIs, apikey quotas can be defined.
- Daikoku provides, like [Otoroshi](https://maif.github.io/otoroshi/manual/entities/apikeys.html), some apikey parameters.
- Daikoku side, billing informations can be filled (billing period, cost per month, currency ...)
- For security, you can force apikey rotation. It's an Otoroshi feature that will reset clientSecret every month with a grace period of 1 week (during this week both secrets work)
- You can force the integration process:
  * ApiKey: subscribers have access to an apikey to call API
  * Automatic: Subscribers have just access to a token, which links to a real apikey, accessible by admin API. It's a perfect solution to integrate automatically your apikey in your prod environment if rotation is activated.

:::note
As Otoroshi does, it's possible to add metadata to API keys. __Automatic metadata__ will be calculated and added after subscription validation. __Asked metadata__ will switch the plan subscription mode to manual then, on subscription acceptation, a team admin will have to add the metadata manually. 
:::

### OpenAPI definition
The OpenAPI definition can be provided as an URL or just some content pasted on the UI.
An additional configuration allow to 

### Testing

You can enable the testing for your API.

> The testing is based on the openAPI definition of your API. Beware of set up the right host for your testing service.

Click on the `Generate a dedicated testing key in Otoroshi` to choose an Otoroshi instance and service group or service which is used to receive the testing APIkey. Then, just follow the instructions displayed on UI?

#### Configure your openAPI

Your openAPI has to be configured to accept apikey from Basic authentication header or from the `Otoroshi-Client-Id` and `Otoroshi-Client-Secret` headers.

If you have changed the Otoroshi headers to pass the apikey don't forget to apply the changes on your openAPI.

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
The documentation tabs allow you to create paginated documentation. Like description, every page can be written with MarkDown or set from an asset.

## Manage subscription

On the team APIs screen in your team back office, it's possible to manage every APIs its subscriptions by clicking on the `key` button.
You can activate/deactivate API keys or update metadata.

## API consumptions
On the team APIs screen in your team's back office, it's possible to see every APIs consumptions by clicking on the `stats` button. Global stats by default but visible by API key or usage plan.