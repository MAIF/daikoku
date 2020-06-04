#!/bin/bash -e

exec /opt/docker/bin/daikoku -Dplay.server.pidfile.path=/dev/null "$@"
