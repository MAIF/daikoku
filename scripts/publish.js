
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DAIKOKU_VERSION = process.argv[2];
const LOCATION = process.cwd();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

console.log(LOCATION)

async function createGithubRelease() {
  return fetch('https://api.github.com/repos/MAIF/daikoku/releases', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `token ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      "tag_name": `v${DAIKOKU_VERSION}`,
      "name": `${DAIKOKU_VERSION}`,
      "body": `Daikoku version ${DAIKOKU_VERSION}`,
      "draft": true,
      "prerelease": false
    })
  }).then(r => r.json()).then(r => {
    console.log(r);
    return uploadAllFiles(r);
  });
}

async function uploadAllFiles(release) {
  await uploadFilesToRelease(release, { name: `daikoku-${DAIKOKU_VERSION}.jar`, path: path.resolve(LOCATION, `../daikoku/target/scala-2.12/daikoku.jar`) });
  await uploadFilesToRelease(release, { name: `daikoku-${DAIKOKU_VERSION}.zip`, path: path.resolve(LOCATION, `../daikoku/target/universal/daikoku.zip`) });
  await uploadFilesToRelease(release, { name: `daikoku-manual-${DAIKOKU_VERSION}.zip`, path: path.resolve(LOCATION, `../daikoku-manual.zip`) });
}

async function uploadFilesToRelease(release, file) {
  const assetUrl = `https://uploads.github.com/repos/MAIF/daikoku/releases/${release.id}/assets?name=${file.name}`;
  return fetch(assetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Authorization': `token ${GITHUB_TOKEN}`,
    },
    body: fs.readFileSync(file.path)
  }).then(r => r.text()).then(r => {
    console.log(r);
    return r;
  })  
}

createGithubRelease();
