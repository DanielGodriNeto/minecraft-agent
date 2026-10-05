#!/bin/bash
cd /c/Users/Mancato/Documents/Github/minecraft-agent/bot
TRACELOG=1 ARMS="veinScan=0;veinScan=1" node eval.js 392 402 12 60 auto > ../exp_veinscan_b.log 2>&1
git checkout -- ../server/diamonds.properties
TRACELOG=1 ARMS="veinScan=0;veinScan=1" node eval.js 428 439 12 60 auto > ../exp_veinscan_c.log 2>&1
git checkout -- ../server/diamonds.properties
