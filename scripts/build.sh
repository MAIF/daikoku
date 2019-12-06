#!/usr/bin/env bash

LOCATION=`pwd`

clean () {
  cd $LOCATION/daikoku/
  rm -rf ./target/universal
  sbt 'docker:clean'
}

build_manual () {
  rm -rf $LOCATION/docs/manual
  rm -rf $LOCATION/daikoku/public/manual
  cd $LOCATION/manual
  node indexer.js
  sbt ';clean;paradox'
  cp -r $LOCATION/manual/target/paradox/site/main $LOCATION/docs
  mv $LOCATION/docs/main $LOCATION/docs/manual
  cp -r $LOCATION/docs/manual $LOCATION/daikoku/public/manual
}

build_ui () {
  cd $LOCATION/daikoku/javascript
  yarn install
  yarn webpack:build
}

build_daikoku () {
  cd $LOCATION/daikoku
  sbt -Dsbt.color=always -Dsbt.supershell=false ';clean;compile;dist;assembly'
}

fmt_ui () {
  cd $LOCATION/daikoku/javascript
  yarn install
  yarn prettier
}

fmt_server () {
  cd $LOCATION/daikoku
  sbt ';scalafmt;sbt:scalafmt;test:scalafmt'
}

test_server () {
  cd $LOCATION/daikoku
  sbt test
}

pre_release_daikoku () {
  fmt_ui
  fmt_server
  git commit -am 'Format ssources before release'
  cd $LOCATION/manual/src/main/paradox
  find . -type f -name '*.md' | xargs node $LOCATION/scripts/version.js $1 $2
  # TODO: build swagger, now its done manually
  build_manual
  git commit -am 'Update documentation before release'
  cd $LOCATION/daikoku
  sbt "release release-version $2 next-version $3"
}

release_daikoku ()  {
  if [ -z "$TRAVIS_TAG" ];
  then
      if test "$TRAVIS_PULL_REQUEST" = "false"
      then
          if test "$TRAVIS_BRANCH" = "master"
          then
              cd $LOCATION/daikoku
              BINARIES_VERSION=`echo "${TRAVIS_TAG}" | cut -d "v" -f 2`

              zip -r $LOCATION/daikoku-manual.zip $LOCATION/docs/manual -x '*.DS_Store'

              curl -X POST \
                -H "Accept: application/json" \
                -H "Content-Type: application/json" \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                "https://api.github.com/repos/MAIF/daikoku/releases" -d "
                {
                  \"tag_name\": \"v${BINARIES_VERSION}\",
                  \"name\": \"${BINARIES_VERSION}\",
                  \"body\": \"Daikoku version ${BINARIES_VERSION}\",
                  \"draft\": true,
                  \"prerelease\": false
                }" | python -c "import sys, json; print json.load(sys.stdin)['id']" | { read id; echo "release_id: ${id}"; export RELEASE_ID=$id; }

              curl -X POST \
                -H "Content-Type: application/octet-stream" \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                -d "@$LOCATION/daikoku/target/universal/daikoku-${BINARIES_VERSION}.zip" \
                "https://uploads.github.com/repos/MAIF/otoroshi/releases/${RELEASE_ID}/assets?name=daikoku-${BINARIES_VERSION}.zip" 

              curl -X POST \
                -H "Content-Type: application/octet-stream" \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                -d "@$LOCATION/daikoku/target/scala-2.12/daikoku.jar" \
                "https://uploads.github.com/repos/MAIF/otoroshi/releases/${RELEASE_ID}/assets?name=daikoku.jar" 

              curl -X POST \
                -H "Content-Type: application/octet-stream" \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                -d "@$LOCATION/daikoku-manual.zip" \
                "https://uploads.github.com/repos/MAIF/otoroshi/releases/${RELEASE_ID}/assets?name=daikoku-manual.zip" 

              sbt 'docker:publishLocal'
              docker tag otoroshi "maif/daikoku:latest" 
              docker tag otoroshi "maif/daikoku:${BINARIES_VERSION}" 
              docker login -u ${DOCKER_USER} -p ${DOCKER_PASS} 
              docker push "maif/daikoku:latest"
              docker push "maif/daikoku:${BINARIES_VERSION}"
          else
              echo "Not on the master branch"
          fi
      else
          echo "Just a pull request"
      fi
  else
      echo "Not a tag"
  fi
}

case "${1}" in
  travis)
    clean
    build_manual
    build_ui
    build_daikoku
    test_server
    release_daikoku
    ;;
  build)
    clean
    build_manual
    build_ui
    build_daikoku
    ;;
  test)
    test_server
    ;;
  release)
    export TRAVIS_TAG=$2
    export TRAVIS_BRANCH=master
    release_daikoku
    ;;
  pre-release)
    # from to next
    # 1.0.0-dev 1.0.0 1.0.1-dev 
    pre_release_daikoku $2 $3 $4
    ;;
  manual)
    build_manual
    ;;
  doc)
    build_manual
    ;;
  docs)
    build_manual
    ;;
  fmt)
    fmt_ui
    fmt_server
    ;;
  fmt-server)
    fmt_server
    ;;
  fmt-ui)
    fmt_ui
    ;;
  *)
    echo "bad params"
esac

exit ${?}