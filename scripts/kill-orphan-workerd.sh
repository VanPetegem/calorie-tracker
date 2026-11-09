#!/usr/bin/env bash
# Kills workerd processes orphaned by interrupted test runs (parent PID 1). A workerd under a running
# `vite dev` or `wrangler dev` has that process as its parent and is left alone. Leftovers load the
# machine until vitest hooks time out.
set -euo pipefail
# Match the executable name only, so a process that merely mentions workerd in its arguments is spared.
pids=$(ps -eo pid=,ppid=,comm= | awk '$2==1 && $3 ~ /(^|\/)workerd$/ {print $1}')
if [ -z "$pids" ]; then echo 'no orphaned workerd'; exit 0; fi
# A process may exit between ps and kill; that is fine.
echo "$pids" | xargs kill 2>/dev/null || true
echo "killed $(echo "$pids" | wc -l | tr -d ' ') orphaned workerd"
