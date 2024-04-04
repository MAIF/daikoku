# Managing teams

Go to `settings/Organizations settings` and then click `teams` on the left menu. You should see the list of existing `teams`

`Teams` can only be created or updated by admin, mainly to add metadata or authorizedEntities (2 properties editable only by a tenant admin).

## Create a team
A team needs the following information:

* Tenant (By default, the current tenant)
* Name (Name needs to be unique for the tenant)
* Description, a small text to describe the team main page.
* Team contact, an email address for a simple contact
* Team avatar, it could be an URL or an asset from the object manager
* Metadata, some extra information that will be sent with the API calls with team apikeys
* Authorized entities, a collection of Otoroshi entities visible to the team, the others are not accessible.

## Update an existing team
Hover over the team's avatar and click the `update` button (Pen icon). All the information filled out during the team creation can be overwritten.

## Delete an existing team

Hover over the team's avatar and click the `delete` button (Bin icon) and confirm the command.

## Manage team members

Hover over the team's avatar and click the `members` button (Users icons). You will redirect to team's members page.
You can refer to the [managing members](../09-producerusage/2-members.md)

