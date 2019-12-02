#!/usr/bin/env bash

LOCATION=`pwd`

clean () {
  rm -rf $LOCATION/docs/manual
}

build_manual () {
  cd $LOCATION/manual
  sbt ';clean;paradox'
  cp -r $LOCATION/manual/target/paradox/site/main $LOCATION/docs
  mv $LOCATION/docs/main $LOCATION/docs/manual
}

fmt_ui () {
  cd $LOCATION/daikoku/javascript
  yarn prettier
}

fmt_server () {
  cd $LOCATION/daikoku
  sbt ';scalafmt;sbt:scalafmt;test:scalafmt'
}

case "${1}" in
  travis)
    clean
    build_manual
    ;;
  manual)
    clean
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