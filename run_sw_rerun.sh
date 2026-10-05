#!/bin/bash
cd /c/Users/Mancato/Documents/Github/minecraft-agent/bot
run(){ TRACELOG=1 ARMS="spawnWalk=0;spawnWalk=1" node eval.js $1 $2 12 60 auto > ../exp_spawnwalk_$3.log 2>&1; git checkout -- ../server/diamonds.properties; }
run 488 499 b
run 512 535 c
