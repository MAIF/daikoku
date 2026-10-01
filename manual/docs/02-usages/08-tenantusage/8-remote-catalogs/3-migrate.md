# Move an existing tenant to a catalog

A tenant built by hand can be moved under a catalog without recreating anything.

1. **Export.** In `Remote catalogs`, use **Export this tenant**. The zip holds one folder per kind and
   one YAML file per entity, in the envelope format:

   ```
   team/team-weather.yaml
   api/api-weather.yaml
   usage-plan/plan-weather-free.yaml
   keyring/keyring-weather.yaml
   api-subscription/subscription-weather.yaml
   cms-page/page-weather-home.yaml
   ```

   By default only the entities managed by no catalog are exported; tick the option to export
   everything. Keyring credentials are never exported. The same export is available on the admin API:
   `GET /admin-api/remote-catalogs/_export?all=false`.

2. **Commit** the files in a repository. Rearrange them as you like, for instance in
   [team folders](./1-files.md#team-folders).

3. **Create the catalog** on that repository, with **Adopt existing entities** on, and `recursive` (or
   **One folder per team**) since the files are in subfolders.

4. **Test.** The dry run must report the entities as `updated` and no error. An entity described in
   the files but already tagged by another catalog is refused: never taken over.

5. **Deploy.** Every entity is now tagged with the catalog.

6. **Turn Adopt existing entities off.** From now on, an untagged entity described in the files is
   refused again, which protects the entities created by hand afterwards.
