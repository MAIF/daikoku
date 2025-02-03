# Front office tests

Since the front end is built with viteJS, it can be a pain to run tests.
There are two ways to perform them:
- you have a running instance (exposed on port 5173), then you can simply run the following command in your terminal 
`npx playwright test --project chrome --workers 1`
- no daikoku instance is started. You need to create the front office with the following command (to be executed in the /javascripts directory) `npm run build` and then you can simply run the following command in your terminal 
`EXPOSED_PORT=9000 npx playwright test --project chrome --workers 1`

## why the env variable EXPOSED_PORT ? 

with viteJS, the front is exposed as an HTML page at the url `http://localhost:5173` but, when in prod mode, it is the backend which renders the front then the url is `http:/ /localhost:9000 `. So all tests have a variable to configure the exposed port to connect to Daikoku.