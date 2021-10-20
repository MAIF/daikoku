# Enable the possibility to use an api key on multiple apis

By default, the api keys, generated from Daikoku, can't be used on multiple plans.

To enable this feature, you have to navigate to the settings of your tenant, to jump on the `Security` section, and to enable `Aggregation api keys security` option. Once clicked, an alert message will advert you on the risk of override metadata between key using multiple plans.

```sh
You're enabled the aggregation of api keys. \
It's an advanced usage of the api keys. Keep \
in mind that the metadatas and the quotas will \
be shared between the parent api key and his \
aggregate api keys. Daikoku will not apply any \
control when conflict metadata.
```

Now, you can navigate to your plans, and enable this security on each plan you expected this behaviour.

Once the feature is enabled on a plan, and when an user has already an existing api key, the `request api key` button will prompt to the user a choice : subscribe with a new api key or subscribe using an existing api key.

When the rights of an api key is extended, the user can visualize the link between root api key and the children "extended" api keys, directly in the api keys view.