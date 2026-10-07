#!/bin/bash
# Blocks until no `node eval.js` process is running, then prints the tail of the given log and exits.
# Run it with the Claude Code background option (run_in_background): the session is woken when it exits.
# Background commands are capped at 2 h, so for longer evals this returns early (exit 3) and must be started again.
# usage: scripts/wait_eval.sh [log-file] [max-minutes=115]
log="${1:-}"; max="${2:-115}"; waited=0
running() { powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -match 'eval\.js' }) { exit 0 } else { exit 1 }"; }
while running; do
  [ "$waited" -ge "$max" ] && { echo "still running after ${max} min"; exit 3; }
  sleep 60; waited=$((waited + 1))
done
echo "eval finished after ~${waited} min of waiting"
[ -n "$log" ] && [ -f "$log" ] && tail -c 600 "$log"
exit 0
