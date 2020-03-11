#Managing teams

###Create a new Team
In the home page, on the "Your Teams" component, click on the "+" button tio open a modal to create a new Team.
It's necessary to fill in the following fields :
* Name: the public name of the the new team (it must be unique for the tenant)
* Description: A quick description for the new team (Display in the all team page)
* Team contact: the mail to contact the team
* Team avatar: a link to the team avatar. It's possible to use gravatar (or an asset, once the team is created)

After creation, you will be redirected to the members page to managing them 

#Managing team members
In the backoffice team, click on the `Team members` entry, on the left.

### Add a new member
Simply select a user in the selector in the top left of the page. He will be notified that you want to add him to your team. You can see him in the "pending" tab, once he accept the invitation he'll appear on the members tab.
You will be notified as soon as he accepts or refuses the invitation.

### Remove a member
Hover over member's avatar and click on the `delete` button (bin icon).

### Update member permission
Hover over member's avatar  and click on the `manage permissions` button (user/cog icon).
Then, choose:

* admin: member can access everything.
* api editor: member can't manage team but can create an api.
* nothing: member can just subscribe another team api.

### Update apikeys visibility
A switch button allow to team admins to set apikey visibility. If it is set on `on`, only team admins are able to see APIkeys.