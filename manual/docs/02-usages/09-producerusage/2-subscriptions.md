# Managing API subscription

Team administrator can access to all API subscriptions by clicking on the `key` action on the table in team APIs page of your team back office.

## Subscription process editor

The cards show the validation steps currently configured for the plan: email, HTTP request, form, team administrator approval, and payment. Drag an available type to an allowed insertion point, or select it and click its destination.

Adding, editing, reordering, or deleting a card updates the draft. Save the process to persist your changes. Unavailable types remain visible but disabled, with an explanation on hover.

The editor allows at most one form step and one team administrator approval step. Payment steps are managed through the plan’s billing configuration and cannot be added from the palette. Email, HTTP request, and form cards have dedicated editors. Form cards cannot be moved or deleted and, when allowed, always remain first in the workflow. Other steps cannot be inserted before them.

If a team administrator approval step is added to a workflow that requires a form but has none, the editor adds a form at the beginning and places the administrator step at the selected insertion point relative to the existing steps.

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
