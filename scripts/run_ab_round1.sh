#!/bin/bash
# Round 1 A/B on normal difficulty: control vs NOTOOLFIX, NIGHTDEEP, FIGHTFIX on paired slots 100-147.
# Waits for any running eval, then runs. Marker: scripts/.ab_round1_done
cd "$(dirname "$0")/../bot"
while powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -match 'eval\.js' }) { exit 0 } else { exit 1 }"; do sleep 60; done
git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
export LONGRUN=1 TELEMETRY=1 MC_HEAP_GB=3
ARMS="NOTOOLFIX=0;NOTOOLFIX=1;NIGHTDEEP=1;FIGHTFIX=1" node eval.js 100 147 12 60 2 > ../ab_round1.log 2>&1
git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
date > ../scripts/.ab_round1_done
