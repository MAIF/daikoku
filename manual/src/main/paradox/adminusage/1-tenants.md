# Managing tenants

Go to `settings/Organizations settings`

And you should see the list of the existing `tenants`.

## Create a tenant

To create a new tenant, just click on the `create a new tenant` button.

### Common informations

Modify the name and the domain name of the current tenant.
It's possible to set the default language of the tenant.
Maintenance Mode and construction mode can be activated here (only super and tenant admins can login).


### Tenant style

Tenants could be customized in Daikoku.
Logo, title, description can be changed.
The css can be customized with some css code or js code, with overwriting css variables or with a css/js file.
Daikoku can be customized just on passing a new css color theme (ths theme can be rewrite by using the dedicated page by clicking on the `Set color theme from UI` button)

### Authentication & Security


Authentication can be set by choosen Local auth. or a tiers auth. like LDAP, OAuth2 or Otoroshi.
The user session duration can be set here, by default it last 24h.

### Security

A tenant can be private or public. In the last case, just public api can be accessed by unauthenticated users.

A creation security option can be activated to forbid all unauthorized teams to create API. You just have to authorize the team from the team edit page.

A subscription security option can be activated to forbid all personal team to subscribe to an API.

An API keys aggregation security can be activated to allow admin API to activate the possibility to aggregate the generated key with an existing API key. It must be activated in every plan

> Beware the risk of override metadata between key using multiple plans. 

It's possible to hide API Reference tab (for all APIs) to unlogged user. This is a feature primally intended for public tenants.

It's possible to hide teams page (/teams) to prevent everyone for knowing all teams in the organisation. This is a feature primally intended for public tenants.

### Audit trail

The settings for the output of the audit trail can be set on this page.
The output of it, in addition to writing in database, can be an elastic, a kafka or webhooks.

### Alerting
The email adresses to report some Daikoku alert.

### Mailer
The mailer type, by default just the standard output. 
Mailgun, Mailjet and Sendgrid can be configured as an sass solution.
Otherwise, a smtp client can be configured.

> The mail templates (one by supported languages) can be edited on the `internationalization page` accessible by clicking the `edit mail template` button.


### Bucket
An object storage can be set to store tenant and team assets.
### Messages

A default message, visible for all user clicking on the message button, in the top of conversation modal.

### Footer

A footer can be draw by daikoku an all frontend page. Just fill code input with HTML code

### Unlogged home description
The unlogged home description is the first content shown to user for private tenant, before the login page.
It can also be enabled for public tenant.

### SEO
A robot.txt file is serve on the path /robot.txt. by default, the file is empty but, you can fill it like you want.