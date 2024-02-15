# Import and export

With Daikoku, you can easily save the current state of the instance and restore it later. Go to `Settings (avatar icon) / Organizations settings` and then `import/export`.

## Full export

Click on the `download state` button.

Your browser will start downloading a ndjson file containing the internal state of your Daikoku instance.

> Audit trail store could be massive, you can exclude this collection from export by toggle the button below the `download state` button.

## Full import

If you want to restore an export, Go to `settings (avatar icon) / Organizations settings` and then `import/export`.  Click on the `import state` button and choose your ndjson export file.

## Database migration

Since v1.1.1 Daikoku support postgresql database. If you want to migrate you mongoDB to postgresql, it's dead simple like the following instructions.

:::danger
Since **v17.0.0**, Daikoku do not support mongoDB anymore. To run database migration, you need to be in **16.3.6 max**.
:::

  1. add your postgresql access in daikoku configuration
  2. keep mongo as daikoku.storage configuration
  3. run the migration
  4. update your daikoku.storage to postgres
  5. restart your Daikoku
  6. remember to disable the maintenance mode
