#!/usr/bin/env bash
# Kills workerd processes orphaned by interrupted test runs (parent PID 1). A workerd under a running
# `vite dev` or `wrangler dev` has that process as its parent and is left alone. Leftovers load the
# machine until vitest hooks time out.
set -euo pipefail
pids=$(ps -eo pid,ppid,command | awk '$2==1 && /workerd/ {print $1}')
if [ -z "$pids" ]; then echo 'no orphaned workerd'; exit 0; fi
echo "$pids" | xargs kill
echo "killed $(echo "$pids" | wc -l | tr -d ' ') orphaned workerd"
