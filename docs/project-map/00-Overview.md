# Minecraft diamond bot — project overview

> Map written from the code and the project docs on 2026-10-07. Open this folder as an Obsidian vault and use Graph View; every double-bracket link below is a node note.

**What it is.** A [[bot.js|Mineflayer]] bot that plays survival Minecraft (Paper 1.21.11, difficulty easy), mines diamonds, and deposits them in a chest. It is a rule-based planner, not a learned policy: a pure function [[nextAction()]] picks the next *skill*, and the skills are scripted behaviours. The project is mostly an **experiment machine**: every behaviour change sits behind a switch and is judged by paired A/B runs on pre-generated world slots.
**Stack.** Node.js (mineflayer 4.39, pathfinder, collectblock), Paper server jars started by [[server.js]], Python only for an old `agent/` folder. Tests: `node --test` (345 unit tests, no server) plus live flat-world tests.
**Long-term goal.** Say "get diamonds and other stuff" and have the bot first invest in itself (armor, tools, enchantments, Fortune) and survive long unattended runs, instead of optimising a 60-minute score. See [[Plan v4.1 draft (self-investment, defence)]].

---

## 1. The runtime loop (decide, act, remember)
- [[bot.js]] connects the bot, parses owner commands, and starts [[runObjective()]] in [[agent.js]].
- The loop in [[agent.js]] calls [[nextAction()]] in [[planner.js]] with the current state (inventory, health, position, hostiles, memory), runs the chosen skill from [[skills.js]], records the result, and repeats. Failures feed a **memory** ([[Planner memory (failure-driven state)]]): repeated failure blacklists goals, flips to recovery, or escalates.
- [[Planner nextAction (priority list)]]: danger first ([[dangerStep()]], [[takeCover()]]), then survival needs (food, light), then the tech tree (wood → stone pickaxe → iron → iron pickaxe), then diamond mining, then the trip home to deposit.
- Key files: [[planner.js]], [[skills.js]], [[agent.js]]. [[physicsfix.js]] patches two library problems (hitbox on block edges, 1.21 enchant format via [[normalizeEnchants()]]).

## 2. Getting diamonds
- Tech-tree skills craft, smelt and pick tools ([[cheapestPickaxe()]] picks the lowest-tier pickaxe able to harvest a block, [[breakBlock()]] digs).
- Mining uses shafts and branch tunnels near Y = -59 (the 1.18+ diamond band), with ore scanning and lava/water guards. Diamonds go to a home chest; a deposit counts as "banked".
- Known failure: **the last pickaxe wears out** (iron 249/250) and the bot loops on `craft` / `go_up` with `no_tool`. Over a third of runs lose their last pickaxe; this is the largest open weakness ([[Known weaknesses and planned redo]]).

## 3. Staying alive: fight, flee, shelter, earlySeal
- Measured deaths: zombies ~45%, skeleton arrows ~15%, spiders ~7%, drowning ~5%, and 69% of deaths happen *inside* flee or shelter.
- [[fight()]] attacks hostiles within 4 blocks while health ≥ 8. [[flee()]] runs away (places no blocks). [[shelter()]] walls the bot in ([[seal()]]) and waits to heal.
- Why shelter fails: it sealed only 0/10 with a zombie already adjacent because an entity occupies the target cell; with the zombie 3+ blocks away in a tunnel it seals 10/10 in ~66 ticks.
- **earlySeal** ([[earlySealReason()]], switch `EARLYSEAL`) starts the seal earlier (hostile ≥ 3 blocks away and low health, crowd or a skeleton in sight), holds it up to 90 s, eats inside, and is capped at 2 per 10 min with a 5-minute lockout after a failed hold. See [[trackShelter()]].
- A/B result so far (24 pairs): deaths 52 → 40, banked 143 → 165, not significant; shelter deaths per hour 0.50 → 0.27. A replication on slots 200–223 is running.

## 4. LONGRUN mode
- [[LONGRUN mode]] ([[longrun.js]]): deaths are not terminal, a stuck bot runs an **escalating recovery** ([[stuckEscalation()]], [[escalate()]]), and extra telemetry is logged ([[gearSnapshot()]], [[armorPoints()]]).
- It is the evaluation mode for the real use case (hours-long runs); the old 60-minute gate stays for regression. See [[Owner decisions LONGRUN adopted, Fortune II target]].

## 5. The evaluation harness
- [[eval.js]] launches 2–4 Paper servers, places each bot on a **spawn slot** ([[Spawn slots (0-99 gate, 100-199 dev, 200-599 train)]], created by [[pregen.js]]), runs [[runOne()]] per bot through [[worker.js]], and appends one row per run to `logs/eval.jsonl` ([[metrics.js]] summarises).
- Switches (env or params) select **arms**: `ARMS="earlySeal=0;earlySeal=1"` runs two arms on the same slots. See [[Paired AB experiments behind env switches]] and [[Evaluation paired stats, MDE ~24 points at 48 pairs]].
- Rules of the house: one change per commit and per round; never run two evals at once; restore `server/diamonds.properties` after a run; 12 bots per server, 2–3 servers on this 32 GB box (4 trips the memory guard). The helper `scripts/wait_eval.sh` wakes the session when an eval ends.
- [[Phase 2 gate (71100 held-out)]]: the earlier held-out gate passed at 71%.

## 6. Gift ablation (measure before building)
- [[gift.js]] ([[giveCommands()]], [[equipGift()]]) `/give`s gear at spawn so each tier's payoff can be measured before any acquisition code exists: base, armor, spare pickaxes, Fortune II, diamond pickaxe. See [[Measure payoff by gifting before building acquisition]].
- Result: [[Gift ablation result (no arm differs, p=0.117)]]. Armor cuts damage per hit 40–60% but hit count is unchanged; the low banked of the armor arm came from runs that ended `stuck` (no pickaxe), not from survival. Fortune II works (1.27 diamonds per ore call vs 0.98). Limit: gifted gear is lost at the first death and never re-given.

## 7. Telemetry
- [[TELEMETRY]] ([[telemetry.js]], [[beginTelemetry()]]) is observation-only (switch `TELEMETRY=1`): damage events, seal failures with the occupying entity, hostile distance at skill start, per-mine pickaxe and ore counts, pickaxe loss events, and the last five skills at stuck time.

## 8. Tests
- Unit tests (no server): planner, agent, skills units, telemetry, gift, longrun, metrics.
- Live flat-world tests: [[harness.js]] starts a server and a bot; [[combat.test.js]] runs shelter and fight scenarios with a zombie adjacent, in a tunnel, with earlySeal off vs on.

## 9. Analysis
- `analysis/` holds read-only log analysis: the original playtest report, `measure/` scripts and `FINDINGS.md` (death causes, iron economy, first-bank time, armor vs base, shelter cost, stuck diagnosis, earlySeal telemetry). Scripts load the same rows through `common.js` / `gift_common.js` ([[_COMMUNITY_Analysis loaders|Analysis loaders]]).

## 10. Plans and decisions
- [[Improvement plan v2v3 (long-run, Fortune)]] and [[Plan v4.1 draft (self-investment, defence)]]. Decisions by the owner: LONGRUN adopted, Fortune II as target (III only opportunistic), bounded mob-XP routine allowed, easy difficulty, combat training arena on a superflat world.

---

## How the pieces connect
`bot.js` → `agent.js` loop → `planner.js` picks a skill → `skills.js` executes it → result into the planner memory. `eval.js` wraps that loop with server, slots, arms and metrics; `gift.js`, `longrun.js` and `telemetry.js` are optional layers switched on per arm. Analysis scripts read what the harness wrote.

## Risks and rough edges
- The pickaxe-wear stuck loop (see §2) and a `craft` → `no_tool` failure whose cause is unknown.
- `fight` can return `ok` with the zombie still alive when it leaves the 4-block range; its win metric in live tests is unreliable.
- 24 pairs only detect large effects; stuck runs truncate banked and bias per-hour rates.
- Telemetry fields for damage/seal/hostile distance are only exercised in unit tests until a longer run produces them (the earlySeal runs now do).
- Server speed is bounded by wall-clock logic everywhere (planner timeouts, fixed 50 ms mineflayer physics); changing the tick rate would need a patched bot and a full re-baseline.

## Where to start reading
1. `docs/BOT_BEHAVIOR.md` (what the bot values and why), then `PLAN.md`.
2. [[planner.js]] → [[nextAction()]], then [[skills.js]] → [[shelter()]] and [[fight()]].
3. [[eval.js]] and `analysis/measure/FINDINGS.md` for what was measured so far.
