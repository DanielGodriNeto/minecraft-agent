# Measurements from existing logs (read-only)
Scripts: `common.js`, `deaths.js`, `runs.js` (builds runs.json), `stats.js`, `stats2.js`, `cover.js`. Raw outputs: `deaths.out.json`, `stats.out.json`, `stats2.out.json`.
Sources: logs/eval.jsonl (2403 rows, 2062 deaths), logs/skills-*.jsonl (cover 2402 of 2403 runs; every run has before/after inv), logs/trace-*.jsonl (1450 files, 1341 in eval, 899 of the 1394 banked runs).
Run start t0 = timestamp suffix of the run tag (first skill log is a median 10.9 s later); run end = t0 + eval `minutes` (matches last skill log to <1 s). Skill `t` = skill end.

## 1. Death causes
Key: `damage` (array of last <=10 `{hp, cause}`; `cause` = `mob@dist` | suffocation | drowning | burning | lava/magma etc | `unknown` + feet/head/oxygen). Source used: skills logs, a death = a damage entry with hp<=0 (deduped by run+t+skill). N = 1964 deaths in eval runs vs 2062 deaths in eval.jsonl (95% captured; 36 other hp0 events belong to runs not in eval). Trace undercount re-measured: 1025 trace deaths vs 1272 eval deaths on 1341 trace runs = 19.4% under. Traces were not used for causes.
Cause on the hp<=0 entry (n=1964): zombie/husk/zombie_villager 893 (45.5%), skeleton/stray/bogged 289 (14.7%), unknown with air at feet/head, no fire, oxygen full 241 (12.3%; the only place a fall could hide), spider 141 (7.2%), drowning 106 (5.4%), unknown other 77 (3.9%), drowned mob 47 (2.4%), lava/magma 45 (2.3%), suffocation 22 (1.1%), creeper 18 (0.9%), warden 16, silverfish 14, fire 14, enderman 13, pillager 12, cave_spider 8, witch 7, creaking 1.
Using last non-unknown cause within the log instead: zombie 904, skeleton 292, none 289 (all unknown), spider 143, drowning 106, creeper 28.
By depth band (y at START of the skill that died, n; top causes):
- surface >60 n=777: zombie 402, skeleton 107, spider 94, unknown-air 76, drowned 30, pillager 12, creeper 7, lava 7.
- 0..60 n=630: zombie 260, skeleton 104, unknown-air 87, drowning 54, spider 33, drowned 17, suffocation 12.
- -40..0 n=253: zombie 136, skeleton 47, unknown-air 23, lava 9, spider 11.
- deep < -40 n=304: zombie 95, unknown-air 55, drowning 45, skeleton 31, lava 27, warden 16.
Skill running at death: flee 708, shelter 655, go_up 305, dig_down 131, fight 53, explore 49, mine 40, other 23. (69% in flee/shelter.)
"fall" is not a category the bot logs: fall damage would appear as `unknown`. Fall is NOT measurable; 241 is an upper bound on air-unknown deaths. Creeper deaths are likely undercounted too (explosion often logs as nearest mob only if within range).

## 2. Iron economy (stone pick -> iron pick), skills logs
Stone pick time = last 0->1 transition of stone_pickaxe before the first iron_pickaxe; 1956 of 2402 runs (81.4%) got the iron pickaxe; 1955 had no death inside the phase.
- Minutes stone->iron: median 4.84 (IQR 3.64-6.54, max 55.9). Run start->stone median 2.10, ->iron 7.57 min.
- Calls inside phase (median, IQR): all 21 (17-28); mine 4 (3-5); craft 8 (8-9); smelt 3 (3-3).
- Ingots produced: max 3, median 3, Q1 3, min 1 (smelt deltas; ~always 3; the bot smelts only what the pickaxe needs). So "ingots/min" is just 3/phase-minutes: per-run median 0.62/min (IQR 0.46-0.82), pooled 0.525/min = 1.9 min per ingot.
- Marginal cost (time between consecutive skill logs, wall clock): the whole phase median 290 s; calls whose args name iron_ore 88 s (37% of phase time); smelt 39 s (3 calls, ~13 s each, 12%). Pooled 41 s of iron-search/mine time per raw iron (runs with gain) + 13 s smelt = ~54 s (0.9 min) per extra ingot.
- Extra minutes for 3 / 6 / 15 more ingots: marginal estimate 2.7 / 5.4 / 13.5 min; average-rate (includes fixed craft/furnace overhead, so an overestimate) 5.7 / 11.4 / 28.5 min. ASSUMPTION: extrapolation, the logs never contain a run that mined more than 7 raw iron, and veins of 3-4 ore mean extra ingots may need new search.

## 3. Spare stock when leaving y16 (first dig_down with iron pick in inv from y>=0; n=1952 runs)
- Iron ingots on hand: median 0; >=1 in 0.1%, >=3 in 0%. Iron ingots + raw_iron >=3 in 0.6%. Max ingot 1, max raw 4. (Ingot count right after the iron-pick craft is 0 in all 1956 runs.)
- Coal+charcoal: median 0; >=1 in 17.9%, >=8 in 1.2%, >=16 in 0.1%.
- Logs+planks (fuel alternative, also tool material): median 7 (IQR 5-9).
- Leave y median 16 (IQR 15-17).
So the bot never has spare iron; to wear armor it would have to mine and smelt all of it.

## 4. Time to first bank (first deposit with diamond delta>0)
Banked runs (eval deposited>0) = 1394/2402 (58.0%); deposit sums match eval `deposited` exactly in all 1394.
Among banked: min 7.6, Q1 22.1, median 23.3, Q3 31.3, max 59.8 min. Share of banked runs with first bank by 20/30/45/60 min: 6.7% / 73.3% / 92.8% / 100% (100% is structural: runs end at 60 min).
Share of ALL runs: 3.9% / 42.5% / 53.8% / 58.0%.
Censoring-free view, only the 998 runs lasting >=59.5 min: banked by 20/30/45/60 = 4.1% / 61.1% / 80.5% / 88.4%; first bank median 23.7 min (IQR 22.1-40.9).
Iron pick -> first bank: median 16.5 min (IQR 14.2-21.5).

## 5. Steady-state diamonds banked/hour after first deposit (diamonds in later deposits / hours from first deposit to run end)
- Timeout runs (n=863): median 4.13/h, IQR 0-10.58; 326 of 863 (38%) banked nothing after the first deposit; pooled 7.0/h. Only those with >=20 min after first bank (n=639): median 6.19, IQR 0-11.3.
- Other endings (n=531: stuck 384, deaths 131, lost 14, disconnected 2): median 0, IQR 0-9.81; 311 of 531 (59%) banked nothing later; pooled 7.06/h.
Window after first bank is short (timeout median 0.61 h, IQR 0.32-0.64); first deposit is a median 1 diamond (IQR 1-3).

## Caveats
1. Death depth is the y where the dying SKILL started (flee/shelter/go_up are long and move the bot); cause "unknown-air" cannot be split into fall vs other; damage log keeps only 10 entries.
2. Iron ingots are always 3 so rates are 3/duration; extrapolation to 6/15 is an assumption, not an observation. Phase timing uses gaps between skill-log timestamps (includes planner overhead).
3. Steady-state rate is censored by the 60 min cap and by runs that died/stuck early; rows with other endings include runs ended by the harness for stuck/deaths, so their rate is not comparable per hour. Different eval eras/param arms are pooled (no stratification by commit/arm).

## Gift ablation (LONGRUN, easy, 90 min, slots 100-123, 24 paired slots per arm)
Reproduce: `node analysis/measure/gift_paired.js` (latest row per arm+slot, invalid rows dropped).
No arm differs from base on diamonds banked or deaths (all Wilcoxon p >= 0.117; 95% CIs on the log ratio include 1).
Mean banked per run: base 7.33, armor 4.63, spare 6.08, fortune2 7.46, diamondpick 7.21. Armor looks worse (5 wins / 15 losses, p=0.117) and has the most `stuck` ends (11); diamondpick has 1 stuck but the most deaths (2.08/run).
Caveats: gifted gear is lost at the first death and is not re-given (~1.4 deaths/run); rows come from several launches (the 4-instance launch lagged at 5-10 tps and the memory guard dropped batches, which were re-run on 1-3 instances), so arm/slot conditions are not perfectly matched; 24 pairs detect only large effects.

## Step 0 (zero-cost): armor, stuck, shelter cost (gift ablation logs, slots 100-123, no server run)
Scripts (repo root): `gift_common.js` (loader, same selection as gift_paired.js), `armor_deaths.js`, `stuck_armor.js [K] [arm]`, `shelter_cost.js`. Outputs: `*.out.txt` (stuck_armor.out.txt has the last 8 skill calls of all 32 stuck runs).
Data limits: `damage[]` is per skill call, last <=10 entries, each `{hp AFTER the hit, cause}`; no timestamp and no hit amount. Hit size = previous hp - hp (first hit: `before.health` - hp; first entry skipped when the array is at the 10 cap). Regen or eating between hits is not logged, so hit sizes are slightly underestimated. Damage outside skill calls is not logged. Alive time = eval `minutes` (respawn time is not logged). Gifted armor is lost at the first death (not re-given), so "before first death" is the only window where armor is surely on (eval gear snapshot at minute 15 shows armorPoints 15 in the armor run checked).

### A. Armor vs base (24 paired slots each)
- Time to first death: base 16/24 runs died, median 33.9 min (mean 36.0); armor 9/24 died, median 35.7 (mean 38.3). Censored (no death = not counted), armor runs also end early (stuck), so no real difference is shown. Deaths per run-hour (eval.jsonl): base 33/30.2 h = 1.09, armor 25/26.4 h = 0.95. No test run.
- Damage events per alive hour (whole run): base 12.4 hits/h, 30.0 hp/h; armor 13.8 hits/h, 25.6 hp/h. By cause hp/h base vs armor: zombie 13.5 vs 7.1, skeleton 4.8 vs 4.6, spider 2.3 vs 1.6, other 9.5 vs 12.3 (other = drowning, cave spider, fall-like unknown, lava, etc.).
- Before first death (armor on): hits/h 11.0 vs 11.7 (same), hp/h 26.8 vs 16.8. Mean hp per hit (n hits) base vs armor: zombie 2.05 (107) vs 0.96 (51); skeleton 2.76 (32) vs 1.62 (39); spider 1.95 (21) vs 0.80 (25); other 3.53 (39) vs 1.74 (103). So full iron armor cut damage per hit by about 40-60% (visible and consistent across attackers) but did not reduce how often the bot is hit, and deaths per hour fell only ~13%.
- Caveat: hits are a few dozen per cell, no CIs computed; armor `other` is dominated by cave_spider (22 hits at 0.81 hp) that base rarely met, so the "other" row is not matched by terrain.

### B. Why armor runs end `stuck` (11/24, mean 37.2 min, deaths 0)
- Common pattern in 11/11: the bot has NO pickaxe in the final inventory (any tier) and cannot get one. Last snapshot with a pickaxe is 3-54 min before the end; the next call ends with `no_tool` (dig_down no_tool in 6 runs: slots 100,102,104,111,118,122; explore no_tool/timeout in 101,113,116,120,121). Example slot100 (run slot100-1791231558329): one `dig_down([-59])` call of 3504 ticks (112 shaft steps) ended at y=-46 with both iron and stone pickaxe gone from inventory (no break event is logged; "worn out" is an inference from the inventory delta).
- Then two loops until the stuck tracker fires: 5 runs `craft stone_pickaxe` = `no_tool` (x9 in the last 12 calls; it has table, 132 cobblestone, 9 sticks in inventory; recovery `recover table_spot` = `no_space`), and 6 runs `go_up` = `not_reached` (x9 in the last 12; the position does not change, moved ~0.1 blocks, 900-1000 ticks each). Why craft says `no_tool` with the materials present is UNKNOWN from logs (inferred: no placed table reachable in a 1-wide shaft).
- Not armor specific: the same pickaxe-less end shows in 19 of the 21 stuck runs of the other arms (base 7/7, spare 6/6, fortune2 6/7, diamondpick 0/1; the 2 exceptions end in `deposit no_chest` x8 with a pickaxe in hand). Armor has more stuck runs (11 vs 7/6/7/1) and earlier (median 31 min vs 68/55/48/85). Cause of the extra armor stucks is UNKNOWN. One hypothesis, not tested: with fewer deaths per life, no death resets the inventory/tech tree, so a worn pickaxe has no reset (stuck armor runs have deaths=0; 2 of 7 base stuck runs had a death). Missing data: no tool durability, no break event, no table-placement failure detail.

### C. Shelter cost (all 120 gift runs, 153.7 run-hours, 1113 shelter calls)
Duration = wall time since the previous skill log (includes planner gap).
- All: 7.2 calls/h, median 0.53 min, p90 2.52 min, 1044 min total = 11.3% of run time (per run median 10.7%, p90 21.2%, max 30.0%).
- dawn: 612 calls (4.0/h), 10.0% of time. dawn `ok` 403 calls, median 2.50 min (p90 2.53, a cap; 9.2% of time). dawn `not_sealed` 151 (0.0%), `hostile_waiting` 30 (median 1.23), `no_tool` 28.
- threat: 493 calls (3.2/h), median 0.11 min, p90 0.58, 1.3% of time. Results: not_sealed 255 (0.05 min), hostile_waiting 146 (0.55), ok 47, no_tool 35, suffocating 9, error 1.
- rest: 8 calls only (0.0%); rest is almost never used.
- So shelter time is nearly all dawn waiting (10 of 11.3 points); threat shelters are cheap but 52% of them fail to seal (not_sealed).

### D. Re-check: shelter death rate by start health, split by nearby hostile
UNKNOWN field: the skill log start state (`before`) has pos, health, food, time, inv only; hostile distance at start is NOT logged (the planner's `hostileClose` <=4 is not saved). Proxy (labelled): "near4-proxy" = the previous skill call (same run) ended <=10 s before and its last damage entry is a mob at distance <=4. Death = hp<=0 entry inside the shelter call. All skills logs (14270 shelter calls, 2014 runs), eval-wide, not only gift runs.
- hp [0,4): near4-proxy 134/271 = 49.4%; no proxy 36/720 = 5.0%.
- hp [4,8): near4-proxy 407/818 = 49.8%; no proxy 33/1064 = 3.1%.
- hp [8,12): 18/265 = 6.8% vs 13/2204 = 0.6%. hp [12,16): 6/184 = 3.3% vs 47/1407 = 3.3%. hp [16,20]: 4/100 = 4.0% vs 30/7237 = 0.4%.
- By mode: threat with proxy 569/1615 = 35.2%; threat without 145/6461 = 2.2%; dawn 10/6014 = 0.2%; rest 4/180.
- Reading: the high death rate of low-health shelters is concentrated in calls that start right after a hit from an adjacent mob (about 50% regardless of whether hp is <4 or 4-8); without that, low-health shelter calls die 3-5%. Health alone is not the driver in this data. Caveat: the proxy misses hostiles that have not hit yet (ranged, approaching), so the "no proxy" stratum is contaminated and its rate is an upper bound for truly hostile-free starts; the proxy and low health are correlated (being hit lowers hp). A dying bot is also a selection effect on which calls reach shelter at all.

## earlySeal A/B telemetry (arms earlySeal=0 vs 1, slots 100-123, commit 2a0aedd, TELEMETRY=1; no server run)
Script (repo root): `node analysis/measure/earlyseal_telemetry.js` (full JSON). 24 runs per arm, all with skill logs. Run-hours: off 33.86, on 29.34 (eval `minutes`). Call duration = `result.ticks/20`. Deaths = skill-log entries with a `damage` hp<=0 (deduped on run+t+skill); they undercount eval `deaths` (50 vs 52 off, 36 vs 40 on: deaths outside skill calls are not logged).

| metric | earlySeal=0 | earlySeal=1 |
|---|---|---|
| shelter calls/h, early / not early | 0 / 7.00 | 1.87 / 11.69 |
| early by reason /h (ranged, health, crowd) | - | 1.02, 0.75, 0.10 |
| flee calls/h (no early flag or reason exists for flee) | 1.57 | 1.29 |
| early outcomes (n=55) | - | hostile_waiting 29, not_sealed 16, ok 7, died inside 1, no_tool 1, timeout 1 |
| early shelter median min / total min / % run time | - | 1.51 / 54.7 / 3.1% |
| deaths/h by skill at death: shelter | 17 (0.50) | 8 (0.27) |
| flee | 19 (0.56) | 19 (0.65) |
| fight / mine (+dig_down) / other | 1 / 3 / 10 | 1 / 3 / 5 |
| hp0 deaths per hour, total | 1.48 | 1.23 |
| shelter deaths, hostileDist <3 / 3-8 / >8 | 16/30 / 1/46 / 0/161 | 4/16 / 3/70 / 1/312 |
| shelter deaths by startHealth [0,4) [4,8) [8,12) [12,16) [16,20] | 4/12 12/33 1/20 0/26 0/146 | 2/9 4/66 1/34 0/171 1/118 |
| early shelters only, by dist 3-8 / >8 | - | 1/23, 0/32 (none <3 by design) |
| seal-fail placements: entity in cell / other | 67 / 586 | 66 / 1327 |
| shelter calls with any entity-in-cell fail | 27 of 98 calls with fails | 21 of 251 |
| early holds that reached the 90 s cap (ticks>=1800) | - | 28 of 55 (hostile_waiting 25, ok 2, no_tool 1) |
| early fails that start the 5 min lockout | - | 48 (all non-ok) |

Seal-fail detail: non-entity errors are cannot_hold 339 / 844, not_placed 164 / 457, missing 74 / 21, timeout 9 / 5 (off / on). Occupants: zombie 44 / 29, item 20 / 13, skeleton 2 / 12, spider 1 / 3, others rare. Inside early shelters: 4 placements with an entity in the cell, 124 other.

Caveats
- Lockout and the 2-per-10-min cap suppress shelters that never run, so how often they blocked is NOT observable in the logs. Only counted: 48 early fails that started a lockout; 1 early start inside a 5 min lockout window of a previous failed early on the same run/bot (expected 0; possibly my start-time estimate `t - ticks/20` or a lock reset, not investigated); 18 early seals after which 2 were within 10 min (cap reached).
- Hold cap = ticks>=1800 is an inference (a timed-out hold logs ~1900-1950 ticks); one of the 28 ended no_tool.
- Arms differ in run time (off 33.9 h vs on 29.3 h; on has more stuck/early-ending runs, see section B), so per-hour rates are not matched; no CIs or paired tests. Deaths are a few dozen per cell.
- Most early shelters fail (45 of 55 not ok): hostile_waiting 29 and not_sealed 16. Early shelters had 1 death in 55; the non-early shelter death count dropped 17 to 7 but that is not shown to be caused by earlySeal (different hostileDist mix: <3 calls 30 vs 16).
- `hostileDist` is the nearest hostile entity at call start, never null in these shelter entries; flee has hostileDist but no reason field. A death in a shelter call is counted by hp<=0 inside it, including deaths after the bot dug out.

## earlySeal stuck diagnosis (7 stuck runs of the A/B, slots 100-123; no server run)
Script (repo root): `node analysis/measure/earlyseal_stuck.js [--all]` (all 48 runs; `--all` adds detail for non-stuck runs). Pickaxes come from skill-log inventories, `pickLost` from `telemetry.pickLost`, stuck context from `telemetry.stuck` (row of the final detection has `end:true`).

Per-run (minute = eval `minutes`; all 7 have 0 pickaxes in the final inventory and `pickaxes: []` in every stuck row):
| arm | slot | min | last 5 skills before end | last pickaxe seen | final pickaxe lost | early shelters (in last 10 min) | class |
|---|---|---|---|---|---|---|---|
| on | 108 | 26.1 | craft:no_tool x4 + explore:no_tool, y=-23 | 24.4 | iron 249/250 + stone 130/131 worn_out, dig_down, 26.1 | 2 (one at 23.4 min, hostile_waiting 96 s, ~2.7 min before the end) | (b) |
| on | 100 | 26.3 | same craft:no_tool loop, y=-58 | 23.3 | iron 249/250 + stone worn_out, dig_down | 0 | (b) |
| on | 105 | 50.0 | go_up:not_reached x4 + explore:no_tool, y=-28 | 41.5 | iron 249/250 worn_out, go_up, 42.2 | 1 (none in last 10 min) | (b) |
| on | 106 | 61.3 | go_up:not_reached, y=-44 | 44.5 | iron worn_out, go_up, 45.7 | 1 (none) | (b) |
| on | 101 | 87.6 | go_up:not_reached, y=-39 | 76.5 | iron worn_out, go_up, 78.1 | 0 | (b) |
| off | 121 | 64.0 | craft:no_tool, y=-29 | 62.1 | iron + stone worn_out, dig_down, 63.9 | 0 | (b) |
| off | 117 | 67.7 | go_up:not_reached, y=-22 | 59.4 | iron + stone worn_out, go_up, 61.8 | 0 | (b) |

Counts: (a) earlySeal-induced 0, (b) no pickaxe 7, (c) other 0. (a) cannot be fully excluded for slot108 (early shelter 2.7 min before the pickaxe ran out); the pickaxe wear itself (iron 249/250 on a dig_down at y=-23) is not shelter related.
- Tracker view: every end row has the same inventory and position (pos moved <5 blocks, same `inv` across the whole last-5 tail in only 2 of 7 (slots 100, 121); the other tails include an `explore:no_tool` or small inventory changes, so the tracker fired on repeated failure plus no movement, not on a strictly frozen inventory) and a repeated failure (`craft no_tool` x5 or `go_up not_reached` x5). After 6-10 escalations (`stuckResets` total 6-10, levels 1-3) with no progress >= 30 blocks (PROGRESS_MOVE) the run ends. No `recent` entry is a shelter in any of the 7.
- pickLost: in all 48 runs the pickaxe wears out regularly (wooden 58/59, stone 130/131, iron 249/250 = `worn_out`; `unknown` = inventory delta with a lower last-seen durability, e.g. 63/131). The bot normally replaces them; the run is stuck when the final iron pickaxe wears out and `craft stone_pickaxe` returns `no_tool` (materials present, e.g. slot108 had cobblestone 232, stick 11, crafting_table 1) or `go_up` cannot reach the surface without a pickaxe. Why craft says no_tool is still UNKNOWN (Step 0 B hypothesis: no table placeable in the shaft).
- Runs that lose their last pickaxe (had one earlier, none in the last log entry): earlySeal=0 9/24, earlySeal=1 9/24; of those, stuck 2 vs 5, the rest end as timeout/lost (7 vs 4; e.g. earlySeal=1 slot110 has no pickaxe from 39.4 min and survives to 90 min; the escalation freed it). Same loss rate in both arms.
- Correlation with early-shelter count (earlySeal=1 only; off arm has 0): early<=2: 8/14 lost the pickaxe, early>2: 1/10. This points the opposite way and is confounded by run length (runs that end early have fewer shelters); no causal reading. Fisher exact for stuck 5/24 vs 2/24: p = 0.42, so the stuck difference is not distinguishable from noise.
- Cost: the 4.6 alive hours are runs ended early by the pickaxe-loss stuck; no data show that earlySeal makes the pickaxe wear out sooner. UNKNOWN: pickaxe use per minute by arm (no durability-per-action log), position/depth at the moment of the wear-out beyond the logged y, and why the on-arm stuck runs end earlier (26, 26, 50, 61, 88 vs 64, 68 min).

Verdict: main cause is (b), the known pickaxe wear-out with no recoverable replacement; the 90 s hold, repeated early shelters and the lockout are not in the final minutes of 6 of 7 runs and not in any stuck row. A fix in the hold (bot/skills.js:83 EARLY_HOLD_MS, SHELTER_WAITS.early at 1444, bot/agent.js lockout) would not remove these stucks. The place to look is the craft `no_tool` path (bot/skills.js:1253 craft, `nearbyOrPlaced` at 1264) and spare-pickaxe logic before the iron pickaxe wears out.
