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
