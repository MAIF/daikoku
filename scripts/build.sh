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

build_dev_manual () {
  rm -rf $LOCATION/docs/devmanual
  rm -rf $LOCATION/daikoku/public/devmanual
  cd $LOCATION/manual
  node indexer.js
  sbt ';clean;paradox'
  cp -r $LOCATION/manual/target/paradox/site/main $LOCATION/docs
  mv $LOCATION/docs/main $LOCATION/docs/devmanual
  cp -r $LOCATION/docs/devmanual $LOCATION/daikoku/public/devmanual
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
  rc=$?; if [ $rc != 0 ]; then exit $rc; fi
}

pre_release_daikoku () {
  fmt_ui
  fmt_server
  git commit -am 'Format sources before release'
  cd $LOCATION/manual/src/main/paradox
  find . -type f -name '*.md' | xargs node $LOCATION/scripts/version.js $1 $2
  cd $LOCATION/docs
  find . -type f -name '*.html' -d 1 | xargs node $LOCATION/scripts/version.js $1 $2
  # TODO: build swagger, now its done manually by copying the file as generation takes place at runtime
  build_manual
  git add --all
  git commit -am 'Update documentation before release'
  cd $LOCATION/daikoku
  sbt "release with-defaults release-version $2 next-version $3"
}

release_daikoku ()  {
  if [ -z "$TRAVIS_TAG" ];
  then
    echo "Not a tag"
  else
    if test "$TRAVIS_PULL_REQUEST" = "false"
    then
        if test "$TRAVIS_BRANCH" = "master"
        then
            echo "On the master branch"
        else
            BINARIES_VERSION=`echo "${TRAVIS_TAG}" | cut -d "v" -f 2`

            rm -rf $LOCATION/daikoku-manual.zip
            zip -r $LOCATION/daikoku-manual.zip $LOCATION/docs/manual -x '*.DS_Store'

            cd $LOCATION/scripts
            yarn install
            $LOCATION

            node $LOCATION/scripts/publish.js $BINARIES_VERSION

            cd $LOCATION/daikoku

            sbt 'docker:publishLocal'
            # docker tag daikoku "maif/daikoku:latest" 
            # docker tag daikoku "maif/daikoku:${BINARIES_VERSION}" 
            docker login -u ${DOCKER_USER} -p ${DOCKER_PASS} 
            docker push "maif/daikoku:latest"
            docker push "maif/daikoku:${BINARIES_VERSION}"
        fi
    else
        echo "Just a pull request"
    fi
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
  build-ui)
    build_ui
    ;;
  build-server)
    build_daikoku
    ;;
  test)
    test_server
    ;;
  release)
    export TRAVIS_TAG=$2
    export TRAVIS_BRANCH=$2
    export TRAVIS_PULL_REQUEST=false
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
  devmanual)
    build_dev_manual
    ;;
  doc)
    build_manual
    ;;
  devdoc)
    build_dev_manual
    ;;
  docs)
    build_manual
    build_dev_manual
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