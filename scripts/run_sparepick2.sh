#!/bin/bash
# SPAREPICK A/B on slots 100-123, one server, one eval at a time. Marker: scripts/.sparepick2_done
cd "$(dirname "$0")/../bot"
export LONGRUN=1 TELEMETRY=1 MC_HEAP_GB=3
rm -f ../scripts/.sparepick2_done
i=0
for r in "200 211" "200 211" "212 223" "212 223"; do
  a=$(( (i==0||i==3) ? 1 : 0 )); i=$((i+1))
  # order within a slot range: arm 0 then arm 1
  ARMS="SPAREPICK=$a" node eval.js $r 12 90 1 > ../exp_sparepick2_$i.log 2>&1
  git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
done
date > ../scripts/.sparepick2_done
