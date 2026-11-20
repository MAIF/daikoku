# Front office tests

## ReDoc internal links

From `daikoku/javascript/tests`, run `../node_modules/.bin/playwright test --config playwright.redoc.config.js`.
This isolated browser test starts Vite on port 5174; it does not require the backend.

Since the front end is built with viteJS, it can be a pain to run tests.
There are two ways to perform them:
- you have a running instance (exposed on port 5173), then you can simply run the following command in your terminal 
`npx playwright test --project chrome --workers 1`
- no daikoku instance is started. You need to create the front office with the following command (to be executed in the /javascripts directory) `npm run build` and then you can simply run the following command in your terminal 
`EXPOSED_PORT=9000 npx playwright test --project chrome --workers 1`

## why the env variable EXPOSED_PORT ? 

with viteJS, the front is exposed as an HTML page at the url `http://localhost:5173` but, when in prod mode, it is the backend which renders the front then the url is `http:/ /localhost:9000 `. So all tests have a variable to configure the exposed port to connect to Daikoku.

## Team creation workflow

The two Local browser scenarios require explicitly selected, isolated test services seeded with
`dev/config/daikoku_state_local.ndjson`. They change the test tenant's workflow, SMTP settings and
the seeded Jim and Michael accounts; never point them at a shared development or production instance.
They do not reset Daikoku, Otoroshi or the SMTP inbox. The SMTP port is reachable from the backend.

From `daikoku/javascript`, run with a visible browser:

```sh
TEAM_WORKFLOW_E2E_URL=http://localhost:15173 \
TEAM_WORKFLOW_SMTP_URL=http://localhost:11080 \
TEAM_WORKFLOW_SMTP_PORT=11025 \
./node_modules/.bin/playwright test --config tests/playwright.local.config.js team-creation.spec.ts --headed --workers=1
```

Without both service URLs, these scenarios are skipped. Add `--ui` to use Playwright's interactive runner.
The refusal scenario intentionally checks for a reason-entry dialog; the current frontend rejects
immediately instead, so that scenario exposes the missing interaction rather than bypassing it by API.

The three backend scenarios are grouped under `team creation workflow` in `TeamControllerSpec`.
On the existing backend test stack, select them with
`testOnly fr.maif.daikoku.controllers.TeamControllerSpec -- -z workflow`.