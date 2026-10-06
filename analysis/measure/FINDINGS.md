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
