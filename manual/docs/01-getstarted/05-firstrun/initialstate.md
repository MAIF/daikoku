# Import initial state

Now you are almost ready to run Daikoku for the first time, but maybe you want to import data from previous Daikoku installation into your current datastore.

To do that, set `daikoku.init.data.from` in the Daikoku configuration, or provide the `DAIKOKU_INIT_DATA_FROM` environment variable.

It can be a file path or an HTTP(S) URL to the NDJSON export file. A local file must be readable by the Daikoku process (and mounted inside the container when applicable).

For an HTTP(S) source requiring headers, configure them in the configuration file:

```hocon
daikoku.init.data {
  from = "https://config.example.com/daikoku.ndjson"
  headers {
    Authorization = ${IMPORT_AUTHORIZATION}
  }
}
```

Supply `IMPORT_AUTHORIZATION` through your secret mechanism, including the authorization scheme expected by the server.

:::warning Empty datastore only
The import runs only when the datastore is empty. It replaces the generation of the default tenant and administrator: the other `DAIKOKU_INIT_*` settings do not override imported entities.

Changing the file or URL and restarting Daikoku does not reimport it into a non-empty datastore. Do not delete production data to reapply initialization settings; update existing entities through the administration UI or API.
:::

See [Initialize Daikoku](./initialization.md) for the initialization lifecycle and the alternative of generating initial data from environment variables.
