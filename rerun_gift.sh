#!/bin/bash
cd "$(dirname "$0")/bot"
export LONGRUN=1 MC_HEAP_GB=3
ARMS="gift=base;gift=spare;gift=diamondpick" node eval.js 112 123 12 90 3 > ../exp_gift_rerun1.log 2>&1
git checkout -- ../server/diamonds.properties
ARMS="gift=armor" node eval.js 100 111 12 90 1 > ../exp_gift_rerun2.log 2>&1
git checkout -- ../server/diamonds.properties
