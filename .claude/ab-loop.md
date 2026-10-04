# A/B loop state (read me every loop tick; update me when something changes)

Run from repo root. Eval runs on slots 200-599 only (never 0-99). Max 2 instances. Check running with `tasklist | grep -ci java` (>0 = eval running).
Summary: `node bot/tools/ab-summary.js <first> <last> <key>` (prints STATUS RUNNING/DONE and a paired verdict).
All A/B evals use env TRACELOG=1. Command: `cd bot && TRACELOG=1 ARMS="k=0;k=1" nohup node eval.js <first> <last> 12 60 2 > ../exp_<k>N.log 2>&1 &`

## Queue (in order; fresh 48-slot ranges)
1. watchdog   slots 296-343  ARMS="watchdog=0;watchdog=1"   STATUS: REJECTED 2026-10-02 (28 vs 32 banked, 5 better 9 worse; fewer deaths 2 vs 11, more diamonds, but stuck doubled)
2. recovery   slots 344-391  ARMS="recovery=0;recovery=1"   STATUS: REJECTED 2026-10-02 after extension (96 pairs: banked 65 vs 60, better 17 worse 12, dia 406 vs 329) - weak positive, revisit later
3. minY       slots 392-439  STATUS: REJECTED 2026-10-02 (-53: 28 banked vs 29, 8 better 9 worse; fewer stuck, more deaths)
4. then re-run any ambiguous result on 48 more fresh slots (440-487, 488-535, 536-583) once.

## Decision rule (48 pairs, "banked" = deposited>0)
- ADOPT: arm1 better on >= 10 slots AND worse on <= 4 (roughly sign-test p<0.05) AND diamonds not lower. Make the switch default-on (on('X') in bot/planner.js DEFAULT_PARAMS like hazardGrace), fix its default test, `cd bot && npm test` must be green, update PLAN.md + docs/BOT_BEHAVIOR.md with the numbers, commit (Conventional, NO AI attribution), `git push origin master` (user approved pushing tested commits).
- REJECT: worse >= better + 3, or no difference after the extension run. Leave default off, record result in PLAN.md, commit, push.
- AMBIGUOUS: queue ONE extension on fresh slots, then decide from the combined 96 pairs.
- After a run: `git checkout -- server/diamonds.properties` if it shows modified.
- Use sonnet sub-agents for any code edits/diagnosis (main session stays lean); use traceLog output (bot/tools/trace-summary.js) to diagnose a switch that disappoints. One change per commit.
- Do not start a new eval while one is running. Do not touch bot/ files while an eval is running (edit in a worktree if needed).

## Log
- 2026-10-01 hazardGrace adopted (37 vs 25 banked). 4 new switches merged (watchdog, recovery, traceLog, MINEY). pickFirst rejected.
- 2026-10-02 watchdog rejected (see queue). Idea to revisit after queue: watchdog with a longer window (10-15 s) since it cut deaths 11->2 and raised diamonds.
- NOTE minY: ab-summary sorts arms alphabetically, so for branchY the 'better/worse' line compares -58 against -53 (reversed). The candidate is -53: swap better/worse when applying the rule.
- 2026-10-02 QUEUE EMPTY. Adopted: hazardGrace. Rejected: pickFirst, watchdog (revisit longer window), recovery (weak +), minY -53.

## Round 2 (watchdog variants; merged e67aeb8..d7e72ac)
Diagnosis: watchdog=1 misread digging/pillaring go_up as stalled (69/230 no_progress), 3x go_up:no_progress tripped STUCK; explore cancels (133) likely give the death reduction.
Queue (key watchdog, arms sorted alphabetically: arm "watchdog=0" is first, candidate second):
1. watchdog=3 vs 0, slots 536-583  STATUS: REJECTED 2026-10-03 (34 vs 34 banked, 8 better 8 worse, dia 149 vs 207, stuck 21 vs 16, deaths 3 vs 5)
2. watchdog=5 vs 0 on slots 488-535  STATUS: RUNNING (started 2026-10-03)
3. if both ambiguous: watchdog=2 vs 0 on fresh slots 392-439 are used, so use 584-599 only for a final 16 pair check, else stop
Same decision rule as above. Adopt = set default to the winning integer (planner.js DEFAULT_PARAMS watchdog: Number(process.env.WATCHDOG||0) -> default N), update default test, npm test green, docs, commit, push.
- 2026-10-02 PC shut down mid-run; watchdog=3 restarted for slots 548-583 only (536-547 already complete). Check with ab-summary 536 583 watchdog.
- 2026-10-03 watchdog effort closed: =3 and =5 rejected (see PLAN.md exp10). Queue empty.

## Round 3 (overnight, auto instances incl. 4 when free RAM >= 16 GB, memory guard kills at most one instance)
Command: cd bot && TRACELOG=1 ARMS="k=0;k=1" nohup node eval.js <first> <last> 12 60 auto > ../exp_<k>.log 2>&1 &
Slots may be reused across experiments (train range 200-599; each pair compares the same slot). Arms sort alphabetically: k=0 first, candidate k=1 second.
If the memory guard killed an instance, ab-summary shows fewer than 48 paired slots: restart only the missing slots (list printed at the end of the eval log, or compute from ab-summary) with the same ARMS.
1. drownCap=1 vs 0, slots 200-247    STATUS: REJECTED 2026-10-04 (37 vs 43 banked, 0 better 6 worse)
2. stationAbove=1 vs 0, slots 248-295 STATUS: REJECTED 2026-10-04 (33 vs 34 banked, 6 better 7 worse). QUEUE EMPTY.
Same decision rule as above (adopt: better >=10 and worse <=4 of 48 and diamonds not lower; reject: worse >= better+3 or no difference after one extension on fresh/reused slots 296-343). Adopt = default on via on('X') in planner.js DEFAULT_PARAMS, fix default test, npm test green, docs, commit, push.

## Round 4 (new switches from the research review; run_round4.sh chains them, keys are env names: spawnEscape, veinScan, earlyBank)
Arms are "spawnEscape=0;spawnEscape=1" (check ab-summary key). Slots: spawnEscape 296-343 (log exp_spawnescape.log), veinScan 392-439 (exp_veinscan.log), earlyBank 440-487 (exp_earlybank.log). Same decision rule; adopt = on('X') default. Lost slots (memory guard): re-run missing ones with the same ARMS. Script started 2026-10-04 ~08:30; if java is not running and exp_earlybank.log is missing, restart run_round4.sh from the first unfinished item.

## Round 5 (user-requested: walk-to-tree and pickaxe prep) - built in worktree branch worktree-agent-a4125b0887a8561f0 (commits ca0bc4c spawnWalk, 024ea5c pickReady; 280 tests green there)
Merge ONLY when no java runs (eval reads bot/ from disk): `git merge worktree-agent-a4125b0887a8561f0`, `cd bot && npm test`, push. Then queue: spawnWalk (arms "spawnWalk=0;spawnWalk=1") slots 488-535 log exp_spawnwalk.log; pickReady (arms "pickReady=0;pickReady=1") slots 536-583 log exp_pickready.log. Chain them in a script like run_round4.sh (run_round5.sh). Same decision rule; lost slots re-run. Note spawnWalk targets only ~6% of runs: if the bad-spawn rate is too low to show, judge on zero-wood/stuck-at-surface runs count (ab-summary stuck column) as well as banked.
