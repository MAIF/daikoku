# Import and export

With Daikoku, you can easily save the current state of the instance and restore it later. Go to `Settings (avatar icon) / Organizations settings` and then `import/export`.

## Full export

Click on the `download state` button.

Your browser will start downloading a ndjson file containing the internal state of your Daikoku instance.

> Audit trail store could be massive, you can exclude this collection from export by toggle the button below the `download state` button.

## Full import

If you want to restore an export, Go to `settings (avatar icon) / Organizations settings` and then `import/export`.  Click on the `import state` button and choose your ndjson export file.

## Database migration

Since v1.1.1 Daikoku supports Postgresql databases. If you want to migrate you MongoDB to Postgresql, it's dead simple like the following instructions.

:::danger
Since **v18.4.8**, Daikoku does not support MongoDB anymore. To run database migration, you need to be in **16.3.6 max**.
:::

  1. Add your Postgresql access in Daikoku configuration
  2. Keep mongo as daikoku.storage configuration
  3. Run the migration
  4. Update your daikoku.storage to postgres
  5. Restart your Daikoku
  6. Remember to disable the maintenance mode
