#!/usr/bin/env bash
# Starts the local Postgres cluster and creates the dev and test databases.
# Local development only; production uses the DATABASE_URL set on Vercel.
set -euo pipefail

if command -v pg_ctlcluster >/dev/null 2>&1; then
  ver=$(pg_lsclusters -h | awk 'NR==1{print $1}')
  name=$(pg_lsclusters -h | awk 'NR==1{print $2}')
  status=$(pg_lsclusters -h | awk 'NR==1{print $4}')
  if [ "$status" != "online" ]; then
    pg_ctlcluster "$ver" "$name" start
  fi
fi

run_psql() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""
  else
    psql -v ON_ERROR_STOP=1 -U postgres -tAc "$1"
  fi
}

run_psql "SELECT 1 FROM pg_roles WHERE rolname='studycoach'" | grep -q 1 \
  || run_psql "CREATE ROLE studycoach LOGIN PASSWORD 'studycoach'"
for db in studycoach studycoach_test; do
  run_psql "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || run_psql "CREATE DATABASE $db OWNER studycoach"
done
echo "Postgres ready: postgres://studycoach:studycoach@localhost:5432/studycoach"
