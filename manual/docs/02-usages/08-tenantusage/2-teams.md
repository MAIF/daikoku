# Managing teams

Go to `settings/Organizations settings` and then click `teams` on the left menu. You should see the list of existing `teams`

`Teams` can only be updated (or deleted) by admin, mainly to update metadata or authorizedEntities (2 properties editable only by a tenant admin).
A team needs the folowing informations :

* Tenant (By default, the current tenant)
* Name (Name need to be unique for the tenant)
* Description, a small text to describe the team main page.
* Team contact, an email address for a simple contact
* Team avatar, it could be an URl or an asset from the object manager
* Metadata, some extra informations that will be sent with the api calls with team apikeys
* Authorized entities, a collection of otoroshi entities visible to the team, the others are not accessible.

## Update an existing team
Hover over team's avatar and click the `update` button (Pen icon). All the informations filled during the team creation can be overwritten.

## Delete an existing team

Hover over team's avatar and click the `delete` button (Bin icon) and confirm the command.

## Manage team members

Hover over team's avatar and click the `members` button (Users icons). You will redirect to team's members page.
You can refer to the [managing members](../09-producerusage/2-members.md)

