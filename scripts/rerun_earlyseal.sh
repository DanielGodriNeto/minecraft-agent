#!/bin/bash
# Re-runs the earlySeal replication batches lost to the memory guard, one server, one eval at a time.
# Writes scripts/.rerun_earlyseal_done when both evals have ended.
cd "$(dirname "$0")/../bot"
export LONGRUN=1 TELEMETRY=1 MC_HEAP_GB=3
rm -f ../scripts/.rerun_earlyseal_done
ARMS="earlySeal=0" node eval.js 200 211 12 90 1 > ../exp_earlyseal_ab4.log 2>&1
git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
ARMS="earlySeal=1" node eval.js 212 223 12 90 1 > ../exp_earlyseal_ab5.log 2>&1
git checkout -- ../server/diamonds.properties ../server/server.properties ../server/ops.json
date > ../scripts/.rerun_earlyseal_done
