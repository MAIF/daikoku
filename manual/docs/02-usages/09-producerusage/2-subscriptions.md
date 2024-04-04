# Managing API subscription

Team administrator can access to all API subscriptions by clicking on the `key` action on the table in team APIs page of your team back office.

## Enable or Disable Apikeys
By clicking on the switch button of the `enabled` column, the subscription can be toggled and enabled/disable Otoroshi apikey.

## Update Apikey properties
On the `Actions` column, the `Update metadata` button open a modal with a form
* mandatory metadata: it's the plan `custom metadata` which are only be filled by an admin 
* additional metadata: Some non mandatory/automatic metadata
* Custom Quotas: If you want to override plan quotas for an apikey
* Other custom props: 
  * read only: the Otoroshi API key can just call API with GET verb

## Refresh subscription secret
By clicking on the `refresh` button, a new client secret will be generated and will replace the Otoroshi client-secret immediately.
The subscription team admins will be informed by notification and mail about the secret refresh.