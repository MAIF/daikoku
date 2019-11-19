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

case "${1}" in
  travis)
    clean
    build_manual
    ;;
  manual)
    clean
    build_manual
    ;;
  *)
    echo "bad params"
esac

exit ${?}