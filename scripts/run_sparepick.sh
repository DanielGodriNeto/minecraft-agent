#!/bin/bash
# SPAREPICK A/B on slots 100-123, one server, one eval at a time. Marker: scripts/.sparepick_done
cd "$(dirname "$0")/../bot"
export LONGRUN=1 TELEMETRY=1 MC_HEAP_GB=3
rm -f ../scripts/.sparepick_done
i=0
for r in "100 111" "100 111" "112 123" "112 123"; do
  a=$((i % 2)); i=$((i+1))
  # order within a slot range: arm 0 then arm 1
  ARMS="SPAREPICK=$a" node eval.js $r 12 90 1 > ../exp_sparepick_$i.log 2>&1
  git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
done
date > ../scripts/.sparepick_done
