# Manage APIkeys
In the backoffice team, click on the `API keys` entry, on the left.
And you should see the list of subscribed `APIs`

## View APIkeys
On the right of the API line, click on the `API Keys` button.
All subscribed plan for the API are displayed.

first of all, you can rename your API key, it's just for better reading

 - Secret can be reseted for an API key
 - API key usage statistics are avalaible after clicking on the `stats` button.
Stats are avalaible for `today`, `yesterday`, `last week`, `last month` or `the billing period`.
You can see a graph to see usage or some global informations likes hits count, average duration or average overhead.
 - To copy credentials, click on the `copy` button at the bottom right of the component.
 - APIkey Rotation can be enabled and setup (by choosing rotation period and grace period)
 - APIkey can be enabled or disabled
 - The subscription provide integration token in addition to the APIkey. This token could be used to avoid to display APIKey and must be considered as a reference to the APIKey. Daikoku provide an api to get credentials from integration token, please read the swagger for more information.
 
Every subscription have an integration token, which make credentials accessible by admin api. This token is visible in integration token tab.

## View global statistics
After clicking on the `Global stats` button, global statistics are displayed.
It's a view of your usage by APIs, split by APIkeys.