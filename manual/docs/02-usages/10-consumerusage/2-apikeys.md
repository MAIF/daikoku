# Manage APIkeys
In the backoffice team, click on the `API keys` entry, on the left.
And you should see the list of subscribed `APIs`

## View APIkeys
On the right of the API line, click on the `API Keys` button.
All subscribed plan for the API are displayed.

### Pending requests

The API key list also shows your team's requests that are waiting or in progress for
the selected API. A request to create a new API key appears as a temporary card,
using the requested name when available. It has no credentials or key-management
actions: the API key is only created when the request is approved.

Requests to extend an existing API key appear as rows in its subscription table,
with the requested API, plan/environment and a **Request in progress** status.
All pending extensions of that API key are shown, even when they target a different
API from the page being viewed. Its pending-request badge counts those same extensions.
The environment/plan summary includes both existing subscriptions and open requests
across the API key, with duplicate names removed.
Temporary cards for new API keys remain limited to requests for the selected API.
Expand the card to see the requester, request date and current validation step.
A pending-request badge remains visible when the card is collapsed.

Search and pagination include pending requests, but their counters remain separate
from existing API keys and subscriptions. Pending rows have no subscription actions
or usage statistics. Requests that have finished are not kept as history here.
On refresh view, an approved request is replaced by the resulting API key or subscription.

first of all, you can rename your API key, it's just for better reading

 - Secret can be reset for an API key
 - API key usage statistics are available after clicking on the `stats` button.
Stats are available for `today`, `yesterday`, `last week`, `last month` or `the billing period`.
You can see a graph to see usage or some global informations likes hits count, average duration or average overhead.
 - To copy credentials, click on the `copy` button at the bottom right of the component.
 - APIkey Rotation can be enabled and setup (by choosing rotation period and grace period)
 - APIkey can be enabled or disabled
 - The subscription provide integration token in addition to the APIkey. This token could be used to avoid to display APIKey and must be considered as a reference to the APIKey. Daikoku provide an API to get credentials from integration token, please read the OpenAPI definition for more information.
 
Every subscription have an integration token, which make credentials accessible by admin API. This token is visible in integration token tab.

## View global statistics
After clicking on the `Global stats` button, global statistics are displayed.
It's a view of your usage by APIs, split by APIkeys.