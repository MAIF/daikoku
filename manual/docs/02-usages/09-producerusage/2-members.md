# Managing teams

### Create a new Team

On the home page, on the "Your Teams" component, click on the "+" button to open a modal to create a new Team.
It's necessary to fill in the following fields:

* Name: the public name of the new team (it must be unique for the tenant)
* Description: A quick description of the new team (Display on the all team page)
* Team contact: the email to contact the team
* Team avatar: a link to the team avatar. It's possible to use Gravatar (or an asset, once the team is created)
* apiKeyVisibility: Minimum member permission to see and manage team apikeys. Default set to User.

After creation, you will be redirected to the members page to managing them 

# Managing team members
In the backoffice team, click on the `Setting/Members` entry, on the left.

### Add a new member
Simply click on `Invit a collaborator` button and then fill in his email. He will be notified that you want to add him to your team. You can see him in the "pending" tab, once he accepts the invitation, he'll appear on the members tab.
You will be notified as soon as he accepts or refuses the invitation.

### Remove a member
Hover over member's avatar and click on the `delete` button.

### Update member permission
Hover over member's avatar  and click on the `manage permissions` button.
Then, choose:

* Admin: a member can access everything.
* Api editor: a member can't manage team but can create an API.
* Nothing: a member can just subscribe another team API.