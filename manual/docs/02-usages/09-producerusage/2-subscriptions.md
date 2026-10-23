# Managing API subscription

Team administrator can access to all API subscriptions by clicking on the `key` action on the table in team APIs page of your team back office.

## Subscription process editor

The process cards display the plan's actual validation steps: email, HTTP request, form,
team administrator approval, and payment. Editing, reordering, adding, or deleting a card
updates the process draft. Save the process to persist those changes.
The editor uses the validation steps directly, without converting them into a separate
card model. The same editor is used for tenant account-creation processes.

The palette above the flow displays all five step types and stays visible when scrolling
the drawer. Drag an available type to an insertion point before, between, or after cards.
Alternatively, select a type and click its destination. Select the same type again or click
anywhere other than a type button or insertion point to cancel the selection.
Dropping outside the flow does not add a step.

Unavailable types remain visible but grayed out, with an explanation on hover. A process
can contain only one form and one team administrator approval step. Payment steps are
managed through the plan's billing configuration and cannot be added from the palette.
Email, HTTP request, and form cards open their existing editors. Form cards remain
non-draggable and cannot be deleted through the card actions.

Creation is handled by the existing step forms: cancelling a form does not insert a card,
and email creation can insert one step per recipient. Team administrator approval adds a
motivation form automatically when one is missing. All new steps respect the chosen
insertion point, including form and team administrator steps. When both are needed, the
form is inserted immediately before the administrator step at that point. An existing
form is kept in place; the editor does not enforce a new ordering rule between them.

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