# Plan v4.1 (draft, not approved)

Owner goal: tell the bot "get diamonds and other stuff" and have it invest in itself (armor, tools, enchantments, Fortune) because the use is long unattended runs, not a 60/90-minute window.

## Evidence
- Gift ablation (24 paired slots, 90 min, LONGRUN, easy): no arm differs from base on banked or deaths (all p >= 0.117). Armor 4.63 vs base 7.33 banked, but the gap is stuck truncation: the 11 stuck armor runs (all 0 deaths, mean 37 min) banked 17 total; the 13 non-stuck armor runs banked 94 (7.2/run, same as base). Cause of the early stuck is unknown. The gift was free, so acquisition time does not explain armor's result. Gear is lost at first death and never re-given, so the ablation understates long-run armor value.
- Fortune II works and is used (1.27 diamonds per diamond-ore `mine` call vs 0.98); banked totals are noise.
- Deaths (skills logs, all runs): 25% of all deaths (~480) follow `fight` ending `low_health` (< 8 hp) and then `shelter`/`flee` with a mob adjacent. Shelter started at >= 8 hp dies 0.5-3.3% of the time; started at < 8 hp dies 17-25%. 83% of shelter deaths end `not_sealed` with the last attacker within 1.5 blocks. 15% of shelter deaths happen after sealing (digs out into a waiting mob after the 30 s timeout, `threat` mode). `flee` places no blocks and does not eat; 48% of flee calls end in death. No shield anywhere in bot/.
- Wiki: full iron armor cuts zombie/arrow/spider damage ~55% (calculated from the wiki formula), diamond ~77%; none vs drowning/fall. Shield blocks the 90° front arc incl. skeleton arrows and creeper blasts after a 5-tick warmup; an axe disables it 5 s; 6 planks + 1 iron. Mineflayer: `bot.equip(item,'off-hand')`, `activateItem(true)`, re-raise after `set_cooldown`/held-item changes (unverified live).
- Server speed: `/tick rate` exists, but mineflayer physics is a fixed 50 ms constant and planner/skill/eval timeouts are wall-clock; faster tick = patched bot + full re-baseline. Not worth it now.

## Reading of the owner's idea (HYPOTHESIS, not shown)
The cocoon already exists (`shelter`), and the data is consistent with it being triggered too late (< 8 hp, mob already adjacent) and abandoned too early (dig-out). But the "≥ 8 hp dies less" numbers compare different situations (planner.js:491 fights any hostile within 4 blocks at ≥ 8 hp, so shelter at ≥ 8 hp mostly means the mob was far). Critic 2 also notes `seal()` swallows placement failures when an entity stands in the cell (skills.js:1393-1401), so sealing with a mob adjacent probably cannot work at any health. To check before building: shelter outcomes at ≥ 8 hp restricted to a hostile within 4 blocks; shelter minutes per call and share of runtime.

## Revisions after critic 2 (they override the rounds below where they conflict)
- `earlySeal` must preempt the fight branch (planner.js:491) and only fire when the nearest hostile is >= 3 blocks away (else back off or kill first); cap by mob type and health so weak mobs are fought, not sealed from.
- Exempt `earlySeal` from `trackShelter` (agent.js:207-216: MAX_SHELTERS then SHELTER_PAUSE) and add a hold cap, since `safeToLeave` fails whenever any hostile is within 16 blocks, even through walls (skills.js:44).
- "Eat/rest inside" is not implemented (shelter only polls `safeToLeave`; regen needs food >= 18): add an `eat` step inside the cell. Check lava/water adjacency and that the bot carries >= SHELTER_MIN (6) of ~9 wall cells.
- Before any server round: a flat-world live test (npm run test:live style) that spawns a zombie adjacent and checks seal/not_sealed, and a query of shelter cost from skills logs.
- Primary metric of round 1 is deaths per alive hour; banked is secondary because stuck truncates runs (diagnose the armor stuck in round 0 first).
- Defer re-gift (round 3); test armor as a 2x2 arm (armor x earlySeal) in the earlySeal round instead.

## Order (one change per round, behind a switch, paired 24 slots, LONGRUN 90 min, same launch for both arms, no bot-side change in the same round)
0. Zero-cost, no server: skills-log first-death time and damage by cause, armor vs base; diagnose the armor `stuck` rows (stuck snapshot, last skills). Add telemetry (switch off by default): damage events with timestamp, amount, attacker entity and distance; cell/entity occupancy when `seal` fails; TRACELOG on; per-pickaxe ore-broken vs diamonds-picked. Toss loop fix as its own switch.
1. `earlySeal`: start the cocoon when a hostile is within range and health < ~14 or while in a 1x2 tunnel (plug ahead and behind first: 2 blocks), do not dig out while a hostile is near or health < rest target, eat/rest inside. Metrics: cumulative banked at 60/90 min (primary), deaths per alive hour, stuck rate; stuck is censoring so report it separately.
2. `fightGuard` off / lower `FIGHT_HEALTH` (existing switches) as a cheap parallel round if round 1 is a no.
3. Gear value on top of the fixed defence: re-gift-on-respawn arms (base, armor, armor+shield), 3 h runs, same launch. Needs the `/give` hook reachable from the respawn path (eval.js:104, :213, worker.js:95-98; gate the planner until equip finishes; ignore dropped gear).
4. Only if round 3 is positive: acquisition ladder, time-boxed: bulk iron smelting, iron armor (24 ingots), shield (1 ingot), spare pickaxe, then Fortune II chain with bounded XP.
5. Server speed: measure `/mspt` in the first minutes only.

## Combat training arena (owner request, goes BEFORE `earlySeal`)
"Training" = measuring and tuning a rule-based planner, not machine learning. Build a superflat arena, run scenarios in minutes instead of 90-minute runs, tune combat/defence logic until scenarios improve, then confirm in the 90-min LONGRUN gate (deaths per alive hour).
Existing pieces (explorer report): tests/harness.js flat server (superflat, /difficulty easy, spawn_mobs false, /time set midnight, /tp, /clear, /effect, /kill @e[type=!player], /summon zombie {NoAI..}); `fight`/`strike`/`bestWeapon` skills.js:1318-1368 (no sword craft, only equips what it has, FIGHT_RANGE 4, FIGHT_MS 15000, FIGHT_MIN_HEALTH 8); planner `dangerStep` :486, `takeCover` :389; eval.js/worker.js run up to 12 bots per server; skills logs carry `damage` arrays.
Design:
- One flat world, 12 cells >= 128 blocks apart (a few chunks each, pre-generated), one bot per cell, bot runs the real planner `nextAction` (so fight/flee/shelter interplay is trained), mobs summoned 8-12 blocks away with NoAI off, `/gamerule spawn_mobs false`, mobGriefing false.
- Per round: reset (`/kill @e[type=!player]`, tp, `/clear`, heal and feed effects, `/give` loadout, optional `/fill` for a 1x2 tunnel), summon scenario, run until mobs dead, bot dead, or 60 s. Record win, hp lost, seconds, damage by cause (attacker, amount, tick), decisions taken, seal result. Same seeds/positions per paired arm.
- Scenario matrix (24 reps per cell): zombie x1/x3/x6; skeleton x1/x2 in the open and with cover; creeper x1; spider x1/x2; mix 2 zombie + 1 skeleton; terrain open ground and 1x2 tunnel; start hp 20 and 8; loadout current (pickaxe/hands) vs +stone sword vs +iron sword vs +iron armor (shield later).
- Timeline: A) harness + baseline of the CURRENT bot (find the weak scenarios; also tells whether a sword/armor/shield pays, cheaply). B) one improvement per round behind a switch, paired on the same scenarios: weapon choice/sword, creeper back-off, skeleton approach or cover, group handling (retreat to tunnel mouth / seal when mob >= 3 blocks away), `earlySeal` with eat inside. C) confirm the winners in the 90-min LONGRUN paired gate.
- Cost: ~40 cells x 24 reps / 12 bots at ~70 s per round is about 1.6 h of server time per full matrix.
- Risks: flat arena has no caves, lava or darkness; mob AI and targeting differ from tunnels; overfitting to the matrix (keep a held-out mix); creeper blasts and skeleton daylight burning need gamerule/time control; a bot that wins in the arena may still lose mining time in real runs, so the LONGRUN gate decides.

### Arena revisions after critic 3 (they override the section above)
- Order: round 0 (zero-cost + telemetry) -> **round 0.5a** adjacent-zombie seal test and single-mob fight test in the existing harness (tests/skills.test.js style, one bot) -> **round 0.5b** the 12-cell arena runner only if 0.5a shows signal -> `earlySeal` -> armor 2x2 -> acquisition ladder. The arena replaces nothing in the 90-min gate.
- A separate arena runner is required: `runObjective` never ends for `count:'max'` (planner.js:281-282, agent.js:556), `runOne` is hard-wired to diamonds and logs/eval.jsonl (eval.js:213-247). The runner wraps `deps.nextAction` to return null once the mobs are dead (or stops at 60 s), sets `maxDeaths:1`, seeds `home`/stand cell, gives >= 6 cobblestone (`canShelter` needs placeableCount >= 6, agent.js:184, SHELTER_MIN skills.js:70), reuses `giveCommands`/`equipGift` for loadouts, and writes its own log.
- "Paired by seed" is dropped: mob AI/RNG and wall-clock planner timeouts mean the same position does not repeat a fight. Arms are independent: randomise arm per cell and instance, pick a few primary cells and a win-rate threshold in advance, report CIs, avoid reading 40 cells at once.
- Reproduce the real failure: summons adjacent at hp 8, not 8-12 blocks at full hp. Tunnel scenario must be underground (a flat world is ~3 blocks deep; check `underground()` / `surfaceY` logic first, use a deeper carved tunnel or a deeper flat preset).
- Arena needs its own server properties (flat, easy, spawn_mobs false in the arena, lower view distance; server/server.properties has difficulty=peaceful), `PersistenceRequired:1b` on summons, a way to start at hp 8 (UNKNOWN: `/damage`; else take hits), and regeneration control. The bot has no ranged logic, so skeleton scenarios test cover and approach only. Spiders are neutral by day (midnight set hides this).
- The LONGRUN gate has no baseline or power estimate for deaths per alive hour (gift ablation found nothing at n=24, p >= 0.117); treat it as a no-regression check unless round 0 gives a variance estimate.

## Not doing
Villagers, Nether, trial chambers, Fortune III farming, single 24 h runs (n=1), tick-rate change.
