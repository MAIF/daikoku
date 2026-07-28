#!/usr/bin/env bash
#
# scoverage measurement accumulator.
#
# scoverage writes runtime hit data to files named `scoverage.measurements.<threadId>`
# inside `daikoku/target/scala-3.x/scoverage-data/`. Those thread-id-based names collide
# between successive JVM runs (unit tests, then each e2e backend), so a later run would
# overwrite the previous one's data.
#
# To consolidate coverage across every run we HARVEST the measurement files out to a
# separate accumulation dir after each run (with a run label baked into the name so nothing
# clashes), then ASSEMBLE them all back into scoverage-data before generating the report.
# The scoverage report reader matches any file whose name starts with
# `scoverage.measurements.`, so the label suffix is transparent to it.
#
# Usage:
#   coverage-measurements.sh harvest <label>   # move current measurements out, tagged <label>
#   coverage-measurements.sh assemble          # copy every harvested measurement back in
#   coverage-measurements.sh reset             # wipe accumulation dir + scoverage report
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACC_DIR="$REPO_ROOT/coverage-measurements"
PREFIX="scoverage.measurements."

scoverage_data_dir() {
  # Resolve the (single) scoverage-data dir for the app module.
  ls -d "$REPO_ROOT"/daikoku/target/scala-3*/scoverage-data 2>/dev/null | head -1
}

cmd="${1:-}"
case "$cmd" in
  harvest)
    label="${2:?usage: harvest <label>}"
    data_dir="$(scoverage_data_dir)"
    if [ -z "$data_dir" ]; then
      echo "[coverage] no scoverage-data dir found — nothing to harvest for '$label'" >&2
      exit 0
    fi
    mkdir -p "$ACC_DIR"
    count=0
    shopt -s nullglob
    for f in "$data_dir/$PREFIX"*; do
      base="$(basename "$f")"
      thread_id="${base#$PREFIX}"
      mv "$f" "$ACC_DIR/$PREFIX$label.$thread_id"
      count=$((count + 1))
    done
    shopt -u nullglob
    if [ "$count" -eq 0 ]; then
      echo "[coverage] WARNING: 0 measurement files harvested for '$label' — the backend may not have flushed on shutdown" >&2
    else
      echo "[coverage] harvested $count measurement file(s) for '$label'"
    fi
    ;;

  assemble)
    data_dir="$(scoverage_data_dir)"
    if [ -z "$data_dir" ]; then
      echo "[coverage] ERROR: no scoverage-data dir — run an instrumented build first" >&2
      exit 1
    fi
    if [ ! -d "$ACC_DIR" ]; then
      echo "[coverage] ERROR: no accumulation dir at $ACC_DIR — nothing to assemble" >&2
      exit 1
    fi
    count=0
    shopt -s nullglob
    for f in "$ACC_DIR/$PREFIX"*; do
      cp "$f" "$data_dir/$(basename "$f")"
      count=$((count + 1))
    done
    shopt -u nullglob
    echo "[coverage] assembled $count measurement file(s) into $data_dir"
    ;;

  reset)
    rm -rf "$ACC_DIR"
    rm -rf "$REPO_ROOT"/daikoku/target/scala-3*/scoverage-report
    echo "[coverage] reset accumulation dir and report"
    ;;

  *)
    echo "usage: $0 {harvest <label>|assemble|reset}" >&2
    exit 2
    ;;
esac
