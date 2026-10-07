#!/bin/bash
cd "$(dirname "$0")/bot"
export LONGRUN=1 MC_HEAP_GB=3
ARMS="gift=diamondpick" node eval.js 112 123 12 90 1 > ../exp_gift_rerun3.log 2>&1
git checkout -- ../server/diamonds.properties
ARMS="gift=fortune2" node eval.js 104 105 12 90 1 > ../exp_gift_rerun4.log 2>&1
git checkout -- ../server/diamonds.properties
