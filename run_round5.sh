#!/bin/bash
cd /c/Users/Mancato/Documents/Github/minecraft-agent/bot
run(){ TRACELOG=1 ARMS="$1" node eval.js $2 $3 12 60 auto > ../exp_$4.log 2>&1; git checkout -- ../server/diamonds.properties; }
run "veinScan=0;veinScan=1" 488 535 veinscan_ext
run "spawnWalk=0;spawnWalk=1" 488 535 spawnwalk
run "pickReady=0;pickReady=1" 536 583 pickready
run "pickReady=1,spareAlways=0;pickReady=1,spareAlways=1" 200 247 spareal
