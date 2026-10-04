#!/bin/bash
cd /c/Users/Mancato/Documents/Github/minecraft-agent/bot
run(){ TRACELOG=1 ARMS="$1=0;$1=1" node eval.js $2 $3 12 60 auto > ../exp_$4.log 2>&1; git checkout -- ../server/diamonds.properties; }
run spawnEscape 296 343 spawnescape
run veinScan 392 439 veinscan
run earlyBank 440 487 earlybank
