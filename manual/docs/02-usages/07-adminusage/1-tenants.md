# Managing tenants

Go to `settings/Organizations settings`

And you should see the list of the existing `tenants`.

## Create a tenant

To create a new tenant, just click on the `create a new tenant` button.

### General

Modify the name and the domain name of the current tenant.
It's possible to set the default language of the tenant.
Maintenance Mode and construction mode can be activated here (only Daikoku and Tenant admins can login).

A robot.txt file is serve on the path /robot.txt by default, the file is empty, but you can fill it like you want.

#### Customizing the Client Name Pattern

When generating an API key, you can define a **custom client name pattern** that includes dynamic values. This helps create meaningful, consistent client names that reflect key context such as the user, team, or API involved.

##### Syntax

Use the expression language (syntax like `${...}`) to insert dynamic values.  
For example:
```${team.name}::${api.name}/${plan.customName}```

Might produce:

```team-name::my-api/prod```


##### Available Variables

You can inject the following variables into your pattern:

###### User
- `${user.id}`
- `${user.humanReadableId}`
- `${user.name}`
- `${user.email}`
- `${user.metadata.<value>}`

###### API
- `${api.id}`
- `${api.humanReadableId}`
- `${api.name}`
- `${api.currentVersion}`

###### Plan
- `${plan.id}`
- `${plan.customName}`

###### Team
- `${team.id}`
- `${team.humanReadableId}`
- `${team.name}`
- `${team.metadata.<value>}`

###### Tenant
- `${tenant.id}`
- `${tenant.humanReadableId}`
- `${tenant.name}`

###### Creation Timestamp
- `${createdAt}` — ISO 8601 format (e.g. `2025-07-24T10:42:00Z`)
- `${createdAtMillis}` — Unix timestamp in milliseconds

##### Tip

If you're using metadata (e.g. `${user.metadata.department}`), make sure the key exists in the entity's metadata before applying the pattern — otherwise it may resolve as an empty string.

### Customization

Tenants could be customized in Daikoku.
Logo, title, description can be changed.

The client side can be customized with some CSS code or JS code, with overwriting CSS variables or with a CSS/JS file.
Daikoku can be customized just by passing a new CSS color theme.

:::warning
Since **v18.3.1** the file to customize your tenant must be sync with the **CLI**. Daikoku do not provide anymore UI to update your css, color theme or js. 

You can find all the information to use the CLI [here](../../04-cli/041-informations/index.mdx)
:::

You can set a default message, visible for all users clicking on the message button, at the top of conversation modal.

To go further, it is possible to create new pages with the embedded [CMS](../08-tenantusage/6-cms.md)

#### Footer
****
A footer can be drawn by Daikoku an all frontend page. Just fill the code input with HTML code

#### Unlogged home description
The unlogged home description is the first content shown to the user for private tenant, before the login page.
It can also be enabled for public tenant.

### Audit

The settings for the output of the audit trail can be set on this page.
The output of it, in addition to writing in database, can be an Elastic, a Kafka or webhooks.

Here you can set the email addresses to report some Daikoku alerts.

### Mail
The mailer type is by default, just the standard output.
Mailgun, Mailjet and Sendgrid can be configured as a SASS solution.
Otherwise, a SMTP client can be configured.

> The mail templates (one by supported languages) can be edited on the `internationalization page` accessible by clicking the `edit mail template` button.


### Authentication


Authentication can be set by choose Local auth. or a tiers auth. like LDAP, OAuth2 or Otoroshi.
The user session duration can be set here, by default it last 24h.

### Bucket
An object storage can be set to store tenant and team assets.

### Payment

Daikoku offers full integration with an online payment service, allowing users to easily manage their financial transactions as part of the subscription process.

> Currently, only integration with [Stripe](https://stripe.com) is implemented, but our project is open to integrating with other payment platforms. Daikoku's code is designed to be modular, making it easier to add support for additional payment platforms. We welcome contributions to enhance our product in this area.

#### Configuring Stripe

Before using Stripe with Daikoku, you need to complete the following steps:

* **Create a Stripe Account**: Visit the Stripe website (stripe.com) to create an account. Follow Stripe's instructions to verify your identity and set up your payment account.

* **Obtain Stripe API Keys**: Once your Stripe account is set up, you need to obtain the necessary API keys to communicate with the Stripe API from Daikoku. These keys include the secret API key and the public API key.

* **Configure API Keys in Daikoku**: Access the Daikoku configuration settings (in the tenant configuration) and provide the Stripe API keys in the appropriate fields. This allows Daikoku to communicate with Stripe for payment handling.

The next step is to configure your API to accept payments. See this [part](../09-producerusage/1-apis.md) of the documentation to learn more

### Security

A tenant can be either private or public. In the last case, just a public API can be accessed by unauthenticated users.

A creation security option can be activated to forbid all unauthorized teams to create API. You just have to authorize the team from the team edit page.

A subscription security option can be activated to forbid all personal team to subscribe to an API.

An API keys aggregation security can be activated to allow the admin API to activate the possibility to aggregate the generated key with an existing API key. It must be activated in every plan

> Beware the risk of override metadata between key using multiple plans. 

It's possible to hide the API Reference tab (for all APIs) to unlogged user. This is a feature primary intended for public tenants.

It's possible to hide the teams page (/teams) to prevent everyone for knowing all the teams in the organization. This is a feature primary intended for public tenants.

### Display mode

It's possible to switch tenant display mode from `default` to `environment`.
See this [part](../08-tenantusage/5.5-display.md) of the documentation to learn more.

