# Diamond bot: what it does, what it values, and why

Written from the code at commit `44ea7b3` (HEAD). References are `file:line` at that commit.
The "reserve kit" (section 8) is committed and measured: no effect. Newer results (gate, experiments) are in PLAN.md "Phase 2 results"; the code described below predates `402c306`.
Numbers in section 6 marked "(owner analysis)" were supplied by the project owner and were not recomputed here.

Files: `bot/planner.js` (P), `bot/agent.js` (A), `bot/skills.js` (S), `bot/eval.js` (E),
`bot/metrics.js` (M), `bot/physicsfix.js` (F), `PLAN.md`.

---

## 1. Objective and how success is measured

**Objective.** `{ item: 'diamond', count: 'max' }` (E:126): mine diamonds and put them in a storage chest
next to the spawn point, as many as possible, until the run ends. Only diamonds *in the chest* count.
A diamond in the inventory is worth nothing if the bot dies or the clock runs out (A:248 adds to
`run.deposited` only after a successful `deposit`).

**A run** (PLAN.md "Definitions"): fresh world snapshot, empty inventory, full health and food, standing on true
ground at one of 600 pre-generated land slots, chest placed two blocks east (E:69-85). Ends after
60 real minutes (`minutes` default, E:176), 3 deaths (A:211 `maxDeaths = 3`), `stuck`, `lost`, `chest_full`, or a
disconnect. Difficulty is read from `server/diamonds.properties`; all logged runs are `easy`.

**Success** = at least one diamond deposited (M:26: `deposited >= 1`).

**Metrics** (M:23-35), all from the same run list:

| Metric | Definition |
|---|---|
| success rate | mean of `deposited >= 1`, with a 2000-sample bootstrap 95% CI (M:2, M:16) |
| diamonds/hour | total deposited / total run-hours |
| deaths/hour | total deaths / total run-hours |
| stuck rate | share of runs whose end reason is `stuck` |

**Slot sets** (PLAN.md): 0-99 held-out gate (run once per phase), 100-199 dev (all tuning), 200-599 training
data for the later ML phases. **Phase 2 gate: >= 50% success on slots 0-99.** Passed: 71/100 (CI 62-80%) at `402c306`.
Per-slot randomness is deterministic: `jitterParams(mulberry32(slot.id))` (E:115, E:126).

Time-of-day: `time set 0` at batch start (E:157), so every run begins at dawn; night is ticks 13000-23000
(S:66-67). At 20 ticks/s a day is 20 real minutes, so night runs from minute ~10.8 to ~19.2 of each day (8.3 min), assuming the server keeps time at 20 TPS.

---

## 2. The decision loop

`runObjective` (A:211-261) repeats until it returns an end reason:

```
loop:
  checks (in order): stopped, lost, deaths >= 3, now >= deadline  -> finish
  if dead: wait for respawn; if respawn is > 256 blocks from home -> 'lost'
  state  = observe(bot, run)                    A:46
  action = nextAction(state)  (planner, pure)   P:268
  result = runSkill(action.skill, ...args)      S:1241  -> { ok, reason, ticks }
  remember(run, action, result)                 A:134   (planner memory)
  stuck tracker sees the result -> maybe finish 'stuck'
```

**Observe** (A:46-79) gives the planner only: inventory counts, health, food, `hasFood`, y, the run's surface y
(= home y), night flag, `enclosed` (sealed cell), hostile within 16 / within 4, `canShelter` (>= 6 placeable
blocks), animal within 24, `visible[...]` per resource (exposed to air **and** in line of sight - no x-ray, S:288),
table/furnace within 6, free slots, uses left on the cheapest pickaxe that can dig stone, home, distance home,
deposited count, ms left, `recentlyAttacked`, `drowning`, jitter params, and planner memory. The planner is a pure
function of this, so a learned policy can later replace it (P:1-2).

**Skill wrapper** (`run`, S:220-269). Every skill:
- is capped at `min(180 s, time to deadline + 30 s)` (S:10, S:213-216), then aborted with `timeout`;
- is cancelled cooperatively (`checkCancelled`) because an abandoned promise would otherwise keep driving the bot;
- is aborted with `attacked` if health drops while a hostile is within 16 blocks, unless the skill is
  `flee/eat/shelter/fight` (S:51, S:244);
- is aborted with `drowning` (head in water and own air < 10 levels, or a drowning hit) unless it is one of the
  escapes `go_up/flee/shelter` (S:49, S:52, S:234, S:242);
- is aborted with `suffocating` after 3 hp of suffocation damage, then the runner digs the head cell open (S:243, S:1244);
- logs the last 10 damage causes, and one JSONL line per call to `logs/skills-<bot>.jsonl` (S:1245).

**Planner memory** (A:214, updated in `remember`, A:134-157). This is how failures change later decisions:

| Memory | Updated by | Effect |
|---|---|---|
| `digFails`, `lastDigReason` | `trackDigging` A:97 | after 1 stuck `dig_down` (`blocked`/`timeout`/`no_tool` with no descent, A:93) the planner relocates (P:134) |
| `relocations`, `relocFailed` | relocation hops, A:106 | rotate hop direction; failed hop -> climb to surface and hop from there (P:137) |
| `baseDir`, `leg`, `hazards`, `hazardUp` | `failBranchLeg` A:121 | a tunnel that hit lava/water/bedrock (`hazard`, `undiggable`, `no_tool`) turns 90 degrees and restarts; 2 in a row -> climb 4 blocks first |
| `surfaceDir`, `surfaceLeg` | failed surface `explore` A:153 | rotate direction, and lengthen the next search: `min(64 + 32*leg, 192)` blocks (P:143) |
| `optionalFails[key]` | any failed `optional` action A:145 | spare/sword crafts stop after 2 fails, hunt after 4, shelter waits after 4 (P:45, P:46, P:53) |
| `shelters`, `noShelter` | `trackShelter` A:82 | 2 plain shelters in a row -> next 5 decisions fight instead of sheltering (A:14-16) |
| `drownings` | A:143 | after 3 consecutive drowning reactions the planner stops reacting to `drowning` (A:11, A:75) |
| `nightDigs` | A:137 | at most 6 night shaft digs per run (P:54) |
| `homeFails` | `returnHome` S:1211 | see section 3.9; reset on death (A:220) |

**Stuck tracker** (A:168-208). The run ends as `stuck` (a failure) when any of these hold:
1. 3 failed skills in a row with unchanged inventory and < 5 blocks moved from the anchor (A:5-6, A:189);
2. a window of the last 12 decisions where all failed, or where the bot moved < 5 blocks and the inventory never
   changed (A:7, A:174-176);
3. 5 decisions in a row that moved < 1 block and changed nothing, even if they "succeeded" (A:8-9, A:181).

Exemptions: a decision right after an `attacked` abort, and `shelter/eat/fight` decisions (A:12, A:253). A
successful `toss` is skipped and its thrown items are added back to the inventory signature, so dropping junk
neither counts as progress nor resets the tracker (A:193-208).

**Deaths.** `onDeath` (A:218) counts it, clears the breadcrumb trail (respawn is at home) and stops pathing.
Inventory is gone, so the state-based planner simply rebuilds the tech tree. Third death -> `deaths`.

**Lost.** After at least one death, a respawn > 256 blocks from home ends the run as `lost` (A:13, A:161-162): the
spawn point was not set (leaves in the stand cell, bed missing), and walking back would burn the run. The eval
harness now clears the stand cell and requires the console to confirm the spawn point (E:31-32, E:81) so this is rare.

**Deadline.** Checked between decisions (A:235); a skill may overrun it by at most 30 s (S:47). The planner also
sees `msLeft` and changes behaviour (section 3.8).

**Other end reasons:** `chest_full` (deposit found no free space, A:249), `stopped` (owner `!stop`), `done` (a
numeric objective was met).

---

## 3. What the bot values, in the order the planner enforces it

`nextAction` (P:268-299) is a fixed priority list. First rule that fires wins. Order:

1. objective done -> stop
2. **danger** (drowning, hostiles)
3. **food**
4. **pickaxe upgrade** after a `no_tool` dig failure
5. **rest** (low health, underground) / **night** shelter
6. **junk** toss
7. **return and bank** if carrying diamonds and a trigger fires
8. **mine a visible diamond** if an iron pickaxe is held
9. **tech tree** until the iron pickaxe exists
10. **diamond search** once it does

### 3.1 Survival first

**Drowning** (P:250, P:50): if `drowning`, `go_up(y + 4)`. `drowning` is derived from live state - head block wet AND the
bot's *own* air supply < 10 levels (S:43-44, S:179). Why so specific: mineflayer's `oxygenLevel` is overwritten by
any nearby entity's air (squid, fish, drowned), which produced 2333 false `go_up:drowning` failures in the logs
(commits d760cf9, 8399a5d, b56c2b2, 798646c). The escape skills are exempt from the drowning abort and hold jump
to swim up (S:855-868). The staircase/tunnel planners refuse any cell in or next to water (4c06dbf, S:504-505).

**Hostiles** (`dangerStep`, P:249-257), skipped when the bot is already sealed in:
- hostile within 4 blocks and health >= 8 -> `fight` (P:245-246, P:56, S:68). Why: running or sealing with a mob
  adjacent only gives it free hits (commit 1e67502).
- else if a hostile is within 16 and the bot is *threatened* - attacked last decision, or health < `fleeHealth`
  (jitter 10-16), or it is night on the surface and the bot is not doing surface work - then
  `shelter` (walls itself into a 1x1x2 cell with >= 6 placeable blocks, waits up to 30 s for the threat to leave, digs
  out; S:61-62, S:1124) or `flee` if it has fewer than 6 blocks (P:234-237).
- if sheltering did not work twice in a row (`noShelter`), fight a close hostile if health >= 8, else flee, else keep working (P:243-246; commit 08bf952).
- a hostile that is far and not threatening is ignored.

**Food** (`foodStep`, P:260-266). Eat when food <= 17 (natural regeneration needs >= 18, P:47), or when on the surface
with health < 12 and food < 20 (top up before a descent). No food in the inventory -> `hunt` a cow/pig/sheep/
chicken/rabbit within 24 blocks, surface only, max 4 failures per run (P:264-265, S:54-56). It never hunts
underground; it just keeps going hungry.

**Resting** (`restStep`, P:218-221): health < 8, no hostile in 16, more than 2 blocks below the surface, food > 17
-> `shelter(rest)`: seal in and wait up to 60 s for health >= 14 (S:64-65, S:1094). Why the food condition: a hungry
bot does not regenerate, so waiting is pointless. Up to 4 failed waits, then dropped (P:53). Commit 2929ad2.

**Night** (`nightStep`, P:224-231; commit 2929ad2 after night deaths). While it is night and the bot has neither a
diamond nor an iron pickaxe: on the surface, dig a short shaft to `surfaceY - 4` (`- 3` by hand), at most 6 times per
run; once 4-12 blocks below the surface, `shelter(dawn)` and wait up to 150 s at a time for daylight, staying sealed
(S:63, S:1093). Reason: skeletons/zombies on the surface at night were the main killer before this rule. With an
iron pickaxe the bot skips the night wait and mines through the night, because underground it is no worse off.

### 3.2 Pickaxe repair

If the last `dig_down` failed with `no_tool` (P:274, commit 2c99a3e): craft the best pickaxe above the one carried
(up to iron tier) whose inputs are already in the inventory, key `upgrade` (P:123-131). Also, mining always uses the
*cheapest* pickaxe that can harvest the block, so the iron pickaxe is not worn out on stone (S:317-325).

### 3.3 Inventory hygiene

If free slots <= 2: toss dirt/gravel/andesite/diorite/granite/tuff/netherrack entirely, and cobblestone/
cobbled deepslate down to 16 (P:34-36, P:169-174). A full inventory silently loses diamonds and blocks `mine`.

### 3.4 Tech tree: wood -> stone -> iron

Runs in `nextAction` P:288-297. Recipe data in P:10-19. Everything is `obtain(item)`, which recurses into inputs
(P:82-97), so the planner never issues a craft whose inputs it cannot have (test `planner_order`).

1. **Wood stock**: whenever a log is visible (reachable from the ground, max 3 blocks above the feet, P:22) and
   `logs + planks/4 < woodStock` (jitter 8-10), mine it. Why keep 8-10: tables, sticks and replacement pickaxes are needed
   again far from any tree (P:290; commit c304a16). Planks are made from whichever log type extends the biggest plank
   stack, because recipes need one plank type (P:62-80).
2. **Wooden pickaxe** (3 planks + 2 sticks, needs a table; the table is crafted from 4 planks and placed). If >= 3
   stone is already carried it skips straight to the stone pickaxe (P:291-293).
3. **Stone pickaxe** (3 stone + 2 sticks). Stone source: `descend(y-3)` - dig a 3-block staircase and mine what is
   visible (P:23, P:113).
4. **Extras before the descent** (`swordStep ?? spareStep ?? stickStock`, P:296):
   - stone sword (2 stone + 1 stick) right after the stone pickaxe, only from stone in hand or in view (P:194-200, commit 1e67502);
   - a *spare* stone pickaxe: want >= 2 pickaxes, or 3 if the one in use has < 20 uses left (P:42, P:181, commit 30fb4e4);
   - 8 sticks at the surface (`SURFACE_STICKS`) so the spare and the iron pickaxe never need a trip back up (P:43, P:203-205).
   All are `optional`: after 2 failures the step is dropped instead of ending the run (commit 71af608).
5. **Iron pickaxe** (3 ingots + 2 sticks). Iron ore is searched at **y = 16** (P:24), fixed, not jittered:
   `descend` to y = 16, then serpentine branch mining. Each ingot is a full cycle: mine 1 raw iron, ensure fuel (coal,
   charcoal, planks or logs), ensure a furnace (8 stone, placed), smelt (P:99-104, S:958-983). The table and furnace are
   picked back up after use (`recoverStation`, commit 58e3d87); an unreachable own station is retrieved or replaced (2496ba3).

### 3.5 Getting down

`gather` for diamond/iron calls `descend` (P:134-140) -> `dig_down(y)` (S:792): a 3-cell staircase, never straight
down. Per step it refuses (`stairRefusal`, S:502-511): lava nearby, water nearby, gravel/sand in or above the column top,
a stalactite (pointed dripstone) within 3 above, undiggable blocks, blocks the current pickaxe tier cannot dig,
or a missing floor (which it patches with a carried block from `cobblestone/cobbled_deepslate/dirt`). If all four
directions refuse it tunnels up to 3 blocks sideways to a better spot, at most twice (S:24, S:35, S:808), else
fails `blocked`. On canopy it drops through the leaves first; on a small pillar it drops down (S:739-760).

Why the gravel/dripstone refusal (fb4ec44): gravel falling into a dug column buried and suffocated the bot, and
stalactites hit it. Why the pickaxe-tier refusal: digging deepslate iron/other ore with a wooden pickaxe just
times out.

**Relocation** (P:134-140, MAX_DIG_FAILS = 1). One failed `dig_down` with no descent triggers a hop instead of retrying the same
spot: at the surface, an 8-block surface hop in a rotated direction (`RELOCATE_BLOCKS = 8`); underground, an 8-block
branch tunnel in a rotated direction; if a hop fails underground, `go_up` to the surface and hop from there. The
constant is 1 because the hop must happen before the stuck tracker's third failure (P:52). This is the code path that
had the dev11 regression (section 6).

### 3.6 Finding diamonds

Diamond search depth is `params.branchY`, jittered **-59..-56** per run (A:24). `gather('diamond')` (P:106-118):
1. diamond visible -> `mine` it (priority rule 8, P:287; this fires before anything else in the mining phase);
2. `hazardUp` set -> `go_up(y + 4)` (P:115, `HAZARD_CLIMB`);
3. more than 2 blocks above the target y -> `descend`;
4. else `explore` in branch mode.

**Branch mining** (`branchLeg`, P:146-151): a serpentine of 1-wide, 2-high tunnels. Even legs go `tunnelLength`
blocks (jitter 24-40) straight, odd legs step sideways `spacing` blocks (jitter 2-4), then the long leg reverses.
Each tunnel step checks for lava/water/falling blocks and a floor (S:513-514, S:662-677) and stops the moment the target
becomes *visible*, meaning: touching air and with line of sight, within 32 blocks (S:288-303). No x-ray, on purpose
(PLAN.md "Skill rules"). A failed leg (not_found/timeout/etc.) advances `leg`; a hazard turns and restarts (section 2).

Iron uses the same mechanism at y = 16 with the same `spacing` / `tunnelLength`.

### 3.7 Returning and banking

`shouldReturn` (P:157-167) is only true when the bot **carries diamonds**. Triggers:
- **first diamond**: `deposited === 0` -> return immediately ("secure the first diamond"; the success criterion is one diamond);
- **time**: `msLeft < 8 min` (P:37) -> bank whatever is carried;
- carried >= `min(remaining objective, returnAt)` (jitter 3-8);
- free slots <= 1;
- food <= 6 and none in the inventory;
- fewer than 2 pickaxes and the working one has < 20 uses left (P:42);
- night and the bot is within 2 blocks of the surface (P:166).

Route (P:280-286): within 4 of home -> `deposit`. Otherwise: if it is night, the bot is underground and there are
>= 15 min left (P:58) -> wait for dawn in a shelter first (a night walk home was a death cause); more than 8 blocks below the
surface -> `go_up`; else `return_home`. `go_up` and `return_home` first retrace the breadcrumb trail of dug cells
(up to 5000 crumbs, loops cut, S:29, S:585-643, S:607-615), then fall back to the pathfinder with scaffolding
(30 s cap near home, 120 s far, S:33-34, S:21), then to pillaring straight up on carried blocks (S:842-853). Why breadcrumbs:
pathfinding out of a self-dug mine is unreliable.

`deposit` (S:1142-1166) checks free chest space *before* moving items, because a transfer into a full chest
desyncs mineflayer's inventory instead of failing (S:1168-1174). A full chest ends the run as `chest_full`.

Home unreachable: after 2 consecutive `no_path/timeout/not_reached` home trips (reset on success or death), if the bot carries a
chest it places it and adopts it as the new home (S:1198-1215, S:1137-1140; commits 4ef1222, e0d3a25, 8a66566). At HEAD the planner never crafts a
chest, so this only works if the bot happens to hold one (see section 8).

### 3.8 Time-aware banking summary

| Constant | Value | Effect |
|---|---|---|
| `RETURN_BEFORE_MS` | 8 min | bank any carried diamond; also (uncommitted work) stop restocking |
| `NIGHT_WAIT_MIN_MS` | 15 min | closer to the deadline than this, do not wait for dawn before a diamond trip home |
| `DEADLINE_SLACK_MS` | 30 s | a skill may run 30 s past the deadline; no skill starts a new phase after it |

### 3.9 After the iron pickaxe is lost

The tech-tree branch is state-based (`!has(iron_pickaxe)`), so a broken or lost iron pickaxe (death, durability) sends the bot
back to craft wooden/stone/iron again, using whatever logs, stone and coal it carries, or by finding trees only if it is
back on the surface (`gather` log: `go_up` to surface then surface-explore, P:109-112). Underground it cannot fetch wood.

---

## 4. Skill library (`SKILLS`, S:1218-1221)

| Skill | What it does | When the planner uses it | Main failure reasons |
|---|---|---|---|
| `explore` S:662 | surface: hop 8 blocks per step (trying both perpendicular sides); branch: dig 1x2 tunnel; stops when the target is visible | log search, relocation, branch mining | `not_found` (leg ended), `hazard`, `no_floor`, `no_tool`, `undiggable`, `timeout` |
| `approach` S:679 | walk within 3 blocks | unused by the planner | `no_path` |
| `mine` S:687 | reach, dig, pick up drop. Any failure blacklists that block | visible log/stone/iron/diamond | `pickup_failed`, `reach_failed`, `dig_timeout`, `no_tool`, `undiggable`, `not_visible` |
| `dig_down` S:792 | staircase down to target y with the refusals in 3.5 | descent, night shaft, stone | `blocked` (with the refusal as detail), `timeout`, `no_tool`, `drowning`, `attacked` |
| `go_up` S:880 | retrace trail, then scaffold pathfinding, then pillar | leave the mine, hazard climb, drowning escape, return | `not_reached`, `timeout`, `drowning`, `attacked` |
| `craft` S:928 | via the server recipe book (`craft_recipe_request`, paced 4/s, shift-click result) because mineflayer's click crafting loses clicks on 1.21; places a table if none near, picks it up after | tech tree | `missing`, `recipe_locked`, `craft_failed`, `station_unreachable` |
| `smelt` S:958 | one input, one fuel, place/reuse furnace, wait up to 15 s | one iron ingot at a time | `missing`, `smelt_failed`, `timeout` |
| `equip` S:985 | equip an item | not used by the planner (skills equip themselves) | `missing` |
| `eat` S:991 | equip food, consume | food <= 17 | `not_hungry`, `missing` |
| `flee` S:999 | path away from the nearest hostile until none within 16 (20 s cap) | threatened with no blocks to shelter | `timeout` |
| `shelter` S:1124 | wall into 1x1x2, wait per `until` (`threat` 30 s, `dawn` 150 s, `rest` 60 s), dig out | danger, night, low health | `not_sealed`, `hostile_waiting`, `no_exit` |
| `fight` S:1033 | best sword/axe (else cheap pickaxe/fists), chase and swing every 12 ticks, 15 s cap | hostile within 4 | `no_target`, `not_killed` |
| `hunt` S:1048 | kill nearest food animal, pick up drops (20 s cap) | no food, on surface | `no_animal`, `not_killed`, `pickup_failed` |
| `deposit` S:1142 | put diamonds in the chest | at home with diamonds | `full`, `no_chest` |
| `toss` S:1177 | drop items down to a keep count | free slots <= 2 | none in practice (0% failure in logs) |
| `return_home` S:1201 | retrace trail, then path to within 3 of home | bank trip | `no_path`, `timeout`, `not_reached` |

Cross-cutting fixes that live inside the skills (each one answers a specific failure):
- **Physics step-up freeze** (F, commits 99b329b, fb8e772): prismarine-physics sometimes leaves the hitbox 1e-16 inside a
  block face; the server rejects the move and teleports the bot back every tick, so it froze at the first step up.
  `nudgeOffEdges` shifts the position 1e-6 away from any face after every physics tick (F:4-14, wired at `bot.js:61`).
- **No pillaring by accident** (346f9fd): `goto` uses movements with no scaffolding and no parkour (S:100-105);
  only `go_up` and station reach turn scaffolding on (S:108-112).
- **Holding forward instead of pathfinding** inside dug tunnels (commit 7fe8e94, S:566-583): the pathfinder needs ~1 s to plan each step.
- **Watchdogs** on every library await (`guard`, S:94, 5 s) and window opens (10 s) because mineflayer-pathfinder can hang (#222).
- **Station placement** avoids flower beds and remembers spots the server refused (6948dec, S:380-418).
- **Drops that fail pickup once are skipped** afterwards (3258dbd, S:347-372).

---

## 5. Tunable parameters (`jitterParams`, A:20-31; defaults P:32)

Drawn once per run from the slot-seeded RNG, so a slot always gets the same values.

| Param | Default | Jitter range | What it does |
|---|---|---|---|
| `branchY` | -58 | -59..-56 | y of the diamond branch mine. Iron y (16) is not jittered |
| `spacing` | 3 | 2..4 | blocks between parallel branch tunnels |
| `tunnelLength` | 32 | 24..40 | length of each long branch leg |
| `returnAt` | 5 | 3..8 | carried diamonds that trigger a bank trip |
| `woodStock` | 9 | 8..10 | wood kept in reserve (logs + planks/4) |
| `fleeHealth` | 14 | 10..16 | health below which a nearby hostile triggers shelter/flee |

The jitter exists for data diversity in the later recording phase (PLAN.md 2.2), not to tune. No sweep of these
has been run; the chosen ranges are guesses around the measured ore layers (section 6).
Non-jittered constants that matter more: `MAX_DIG_FAILS` 1, `HAZARD_CLIMB` 4, `RELOCATE_BLOCKS` 8, `EAT_AT` 17,
`FIGHT_HEALTH` 8, `REST_BELOW` 8, `RETURN_BEFORE_MS` 8 min, `SKILL_CAP_MS` 180 s.

---

## 6. Measured behaviour

**Eval history** (60-min runs, `easy`, N = 12 bots per server; `logs/eval.jsonl`, batches recomputed from run tags):

| Dev set | Slots | Runs | Success | Notes |
|---|---|---|---|---|
| dev9 | 100-123 | 24 | 58% (14/24) | before the "stuck" round of fixes |
| dev10 | 124-199 | 76 | 59% (45/76) | 2.26 diamonds/hour (owner analysis) |
| dev11 | 100-123 | 24 | 33% (8/24) | regression after the stuck fixes; cause: relocation-hop bug, fixed in `44ea7b3` |

Early dev batches (dev1-8, slots 100-119, 10 bots) were 0-30% and are the record of the bugs fixed in the git log.
The 0-99 gate set was later run once: 71/100 (PLAN.md). A later 4-run partial batch in the log (slots 106-115, all ended `stuck` after
10-15 min, after the `44ea7b3` timestamp) has no tag saying what it tested; treat it as unexplained until someone
looks at it. `44ea7b3` is therefore **not yet confirmed** to have cured dev11.

**Where time goes** (owner analysis): 45% of a successful run's time is vertical transit (descending and climbing),
not mining. 18 of 31 failed runs (owner analysis, failed-run sample) never reached y <= -50; 12 never obtained an iron pickaxe.

**Ore layers measured in this world** (owner analysis): iron density peaks around y = 13, diamond around y = -53, coal
around y = 46. The bot digs for iron at y = 16 (P:24, close to the peak) and for diamonds at y = -59..-56 (A:24),
i.e. 3-6 blocks below the density peak. Diamonds at y = -53 are visible from a tunnel at -56 only if within line of
sight and 32 blocks.

**Time per skill across every skill log on disk** (`logs/skills-*Bot*.jsonl`, 26,458 calls, 119 bot-hours, all
code versions mixed, so this is history, not the current bot; computed from `result.ticks` / 20):

| Skill | Share of time | Calls | Failure rate |
|---|---|---|---|
| dig_down | 36% | 2354 | 43% |
| explore | 31% | 4597 | 84% |
| go_up | 9% | 3261 | 82% (2333 of these are the old false-drowning bug) |
| mine | 8% | 5831 | 11% |
| shelter | 6% | 721 | 69% |
| craft | 5.5% | 6468 | 3% |
| smelt | 2.4% | 772 | 1% |
| return_home, flee, fight, hunt, eat, deposit, toss | < 1% each | | |

Explore's 84% "failure" is mostly `not_found`: a branch leg that ends without seeing ore is a normal outcome, not a
bug. Top failure reasons overall: `go_up:drowning` 2333, `explore:not_found` 2307, `explore:hazard` 1140,
`dig_down:timeout` 449, `shelter:not_sealed` 324, `mine:pickup_failed` 240, `mine:reach_failed` 214, `dig_down:blocked` 202.

**Run end reasons** (all logged runs): mostly `stuck` and `timeout`; deaths are rare per run (dev10: 3 of 100 logged runs ended by the
3-death rule). Stuck is the largest single failure end, which is why the redo list below starts with it.

---

## 7. Known weaknesses and the planned redo

**Weaknesses (from code and logs):**
1. **Stuck is the top failure end.** The tracker is deliberately strict (3 fails / 12-decision window / 5 idle) and ends
   the run instead of trying a different strategy. A stuck run scores 0 for its remaining minutes.
2. **Travel is expensive.** Each descent is a dug staircase (`dig_down`, avg 66 s per call in the logs), each climb
   retraces dug cells; 45% of a good run is transit. There is no reuse of a shaft, no ladder, no water-bucket.
3. **No loop detection beyond the tracker.** A cycle of *successful* but useless skills (e.g. mine, toss, mine) is only caught
   by the idle rule (5 decisions with < 1 block moved). Loops that move the bot around are not detected.
4. **One tunnel setting for every ore.** Iron and diamond share `spacing` and `tunnelLength`; iron is a single-vein goal
   (need 3 ingots), diamond is a sweep.
5. **No stockpile for recovery.** A death or a cave-in leaves the bot with nothing to rebuild from, no chest to adopt, and
   underground it cannot fetch wood. The home-adoption code exists (S:1137) but nothing crafts a chest.
6. **No learning.** Every rule above is hand-set; the jitter is not tuned against results.
7. **Hunting only on the surface; food underground is whatever was carried.**
8. **Gate not run**, and dev results have wide intervals: 24-run batches swing 33%-58% on the same slots.

**Planned redo, in order** (owner plan):
1. Confirm the stuck fix (`44ea7b3`): rerun dev slots 100-123 and compare to dev9/dev11.
2. Cheaper travel: fewer, faster vertical transits.
3. Loop detection: detect repeating (state, skill) cycles rather than only failures/idleness.
4. Per-ore tunnel settings: separate spacing/length for iron and for diamond.
5. Milestone score: score progress by tech-tree milestones (wood, stone, iron, depth, diamond) so partial progress is visible and comparable, instead of only "deposited >= 1" (PLAN.md's learned-phase reward uses +0.1 per milestone).
6. Learned skill selector: replace `nextAction` with the cloned then RL policy (PLAN.md phases 3-4), trained on slots 200-599.
7. Tuning on slots 200-599, keeping 0-99 for the one gate run.

---

## 8. The "reserve kit" (committed, measured: no effect)

Paired experiment exp1: reserve kit on 46% vs off 50% success, so no effect; it sits behind the `RESERVE` switch.
What it is (from the earlier diff):
- a chest recipe (8 planks) and `RESERVE = { planks: 16, chest: 1, stone: 32, food: 6 }`;
- a `reserveStep`, placed after "mine a visible diamond" and before the tech tree: once the iron pickaxe is held, on the
  surface, with no hostile, not night, and >= 8 min left, top the reserve up from what is *in view* (wood, then the chest,
  then stone, then food), each item capped at 12 steps and 2 failures per trip;
- the stone-junk toss threshold moves from 16 to the reserve's 32 cobblestone;
- the purpose was to give the recovery skills (table, pickaxe, pillar, shelter, `adoptChest`) their materials.

## pickFirst (switch `PICKFIRST=1`, off by default)

A bot holding no pickaxe at all obtains or crafts one before any home trip, because `go_up` and dig need a pickaxe (48 of 84 stuck runs ended pickaxe-less after banking). Off, the home trip runs first. Result: paired A/B on slots 200-247, 48 runs/arm, banked 34 vs 34, diamonds 191 vs 192, stuck 19 vs 20 -> no effect, left off.

## drownCap (switch `DROWNCAP=1`, off by default)

After the second drowning in a life while `mine` is running, the ore area (radius 2 around the target) goes into `bot.unreachable` so the planner picks another target. The existing drowning counter resets on any other result, so a `mine:drowning` <-> `go_up:ok` loop (slot 102, y 58->62->58, no inventory change) never reached the cap or the stuck tracker. Result: REJECTED 2026-10-04 (48 pairs, slots 200-247: banked 37 vs 43, better 0 worse 6, deaths 8 vs 4; more diamonds but fewer banked). Stays off.

## stationAbove (switch `STATIONABOVE=1`, off by default)

`placeSpot` (table/chest placement) also tries the cell two above the feet and the cell below the feet, after the horizontal neighbours. In a shaft or 1-wide tunnel none of those is free, so the bot tried to dig a side wall without a pickaxe and failed `craft:no_tool` (21 runs). Result: REJECTED 2026-10-04 (48 pairs, slots 248-295: banked 33 vs 34, better 6 worse 7; deaths 3 vs 10 but timeouts 30 vs 17). Stays off.

## hazardGrace (switch `HAZARDGRACE=1`, off by default)

An `explore` hazard failure does not count toward the stuck tracker while a `hazard_up` climb is pending (same exemption idea as relocation hazards), because 20 stuck endings were repeated explore:hazard at y -60..-50 before the climb could run. Result: hazardGrace: ADOPTED (default on). A/B slots 248-295, 48 pairs: banked 37 vs 25, diamonds 186 vs 129, stuck 14 vs 25, better on 13 slots, worse on 1.

## watchdog (switch `WATCHDOG=1`, off by default)

A pathfinder goal that moves the bot less than 1 block in 5 s is dead: `goto` cancels it, flags the skill cancel token, blacklists the goal block in `bot.unreachable` (so `findVisible` and the planner stop re-targeting it; cleared on death and on each new trip) and fails the skill as `no_progress`. The detector is the pure `stalled(samples)` in skills.js. Pillar and dig loops are not covered (they have their own bounded fail counters). Result: watchdog: REJECTED (default off). A/B slots 296-343, 48 pairs: banked 28 vs 32, better on 5 slots worse on 9, stuck 27 vs 14, but diamonds 181 vs 140 and deaths 2 vs 11 - it cancels slow-but-progressing paths into stuck; worth revisiting with a longer window.

Variants (WATCHDOG=<n> or ARMS="watchdog=0;watchdog=3"; integer param, 1 = the above): 2 skips the watchdog for scaffold gotos (go_up pillar/dig paths), 5 s elsewhere; 3 gives scaffold gotos a 15 s window, 5 s elsewhere; 4 is a global 10 s window; 5 keeps 5 s but a 
o_progress failure does not count toward STUCK_FAILURES in the stuck tracker. Watchdog variants: 3 and 5 REJECTED in paired A/B (3: banked 34 vs 34, diamonds 149 vs 207; 5: banked 25 vs 35, stuck 30 vs 19); 2 and 4 not run. The cancel hurts bots that stand still while digging; only a trigger tied to the pathfinder reporting no path is worth trying.

## recovery (switch `RECOVERY=1`, off by default)

Before the stuck tracker ends a run, the failing action's signature (`skill:reason`) maps to one named routine (`recoveryFor` in planner.js), run once per signature per life through the `recover` skill, after which the tracker starts fresh: `go_up:not_reached` or `go_up:no_progress` -> `dig_out` (2 blocks sideways, then up 1; needs a pickaxe) else `pillar_out` (3+ stone); `craft:no_tool` with 2 sticks, 3 stone and a table in the pack -> `table_spot` (walk to open ground and place the table); `explore:hazard` twice -> `retreat` (back along the trail, then the branch direction flips). The routines that ran are listed in the run result as `recoveries`. Result: recovery: REJECTED (weak positive: 96 pairs, banked 65 vs 60, better 17 worse 12, diamonds 406 vs 329).

## traceLog (switch `TRACELOG=1`, off by default)

Diagnostic only. One JSONL line per planner decision is appended to `logs/trace-<run>.jsonl` (ts, skill/key/args, position, health, food, pickaxe tiers, sticks, stone, wood, diamonds, deaths, hazardUp, stuck counters, last failure), built by the pure `traceLine` and written through an append stream. `node tools/trace-summary.js` (from `bot/`) aggregates the last 20 decisions of every `stuck` run in `logs/eval.jsonl`. Result: traceLog: pending A/B (check it costs nothing).

## earlyBank (switch `EARLYBANK=1`, off by default)

Banking the first diamond at once already exists: `wantsReturn` is true whenever a diamond is held and `deposited === 0`, so `returnAt` is never consulted for the first deposit. The one thing that still delays it is `lingerUnderground` (nightAscent: keep mining while the surface arrival would be in the dark). earlyBank skips the linger while `deposited === 0`, so a carried first diamond starts the trip immediately. Later deposits are unchanged. Result: REJECTED 2026-10-04 (26 of 48 pairs: banked 24 vs 22, better 3 worse 2, deaths 10 vs 3). Stays off.

## spawnEscape (switch `SPAWNESCAPE=1`, off by default)

23 of 58 zero-diamond stuck runs never got a stone pickaxe: they sat on a bad spawn (water, basin) looping `go_up:not_reached` / flee with no wood. With no log, planks or pickaxe held, and either 2 `go_up:not_reached` failures or 2 failed surface searches in this life, the log gather step becomes one 64-block surface `explore` (key `spawn_escape`) before the climb or the next search. The first escape heads opposite `surfaceDir`, later ones rotate from the first (`escapeStart`), so no direction repeats; at most 3 per life. A found log (explore ok) clears the two trigger counters. Water is not detected: the pathfinder's own refusal to cross it is what the hop retries sideways. Result: REJECTED 2026-10-04 (26 of 48 pairs after memory-guard losses, better 1 worse 2, no measurable effect). Stays off.

## spawnWalk (switch `SPAWNWALK=1`, off by default; A/B rejected: no effect, banked 33 vs 32)

spawnEscape was a bounded 64-block walk (3 per life) and showed no effect; a bad spawn (water, basin) with no wood needs the bot to leave the whole area. With spawnWalk on, the same trigger (no log, planks or pickaxe; 2 `go_up:not_reached` failures or 2 failed surface searches) starts one walk and spawnEscape is not used. The heading is fixed by the first leg (opposite `surfaceDir`) and kept in 56-block surface `explore` legs (key `spawn_walk`, state in `memory.walk`: heading, blocks walked, consecutive fails, detour, start time). A leg that ends `not_found` counts as walked; any other failure sidesteps with a 16-block lateral leg (alternating sides) and then the heading resumes, it never reverses. A log in view (explore ok) clears the walk and the trigger counters. Safety caps: 600 blocks, 10 minutes, or 6 failed legs in a row, after which the normal log search and climb run. Water avoidance: oceans, beaches, deserts and mushroom fields have no trees, so each 8-block hop looks at the top block 8 and 16 blocks ahead (`surfaceAhead`, `surfaceClass` in skills.js). Sand, red sand, terracotta and ice ahead only keep the bot walking; water, kelp or lava ahead bends that hop along the shore (`shoreHop`): to the dry side that shows more green (grass, leaves, logs, snow, which cover forests and snowy spruce hills), never into the water and never reversed; with water on all three sides the heading is kept. The leg then resumes the heading. The explore arg is `shore: true`. Dead bush sticks are not picked up. Pure helpers: `spawnWalk`, `walkAfter` in planner.js. Result: pending A/B.

## pickReady (switch `PICKREADY=1`, off by default; A/B rejected: worse on 5 pairs vs better on 1)

98 of 246 successful runs ended with no pickaxe and 35 of 58 stuck runs had none, so the bot mined until the tool broke with nothing to replace it. With pickReady (`pickReadyStep` in planner.js, step restock key `pick_ready`, sharing the restock budgets so it cannot loop): (a) before the final descent (above branchY + 2, not at night, 20+ minutes left) and with one iron pickaxe, it prepares a spare from what is near: visible iron is mined until 3 raw/ingots are held, smelted when a table, fuel and a furnace (or 8 stone) are on hand, sticks are crafted from carried wood, and the second iron pickaxe is crafted when a table is on hand. It never fetches wood or searches for ore for this. (b) With one iron pickaxe at 80% used (20% left) (`ironLeft`, observed from the pack) or none, and no spare: if the materials for one are on hand it is crafted at once; otherwise, below y14, the bot climbs to the iron level (y16, key `pick_up`, max 2 per life) and restocks there with the normal iron/smelt/craft steps. With none and at the surface the normal tech tree runs unchanged. Result: pending A/B.

## veinScan (switch `VEINSCAN=1`, off by default; A/B rejected: no banking gain, more deaths)

Branch mining only reacts to a diamond that is *visible* (an exposed face in line of sight, `findVisible`, 32 blocks), so `explore:not_found` legs dig blind past buried veins. With veinScan, at y <= -40 each tunnel step of a diamond branch explore also asks `bot.findBlocks` (radius 48, 4 results) for diamond ore; the nearest one that a tunnel at the current height would expose (-1..+2 blocks vertically, |dx|+|dz| <= 32) is not skipped but tunnelled toward along the longer horizontal axis, and the normal visible-then-`mine` path takes over as soon as it is exposed. Steps toward an ore that fail (hazard, no floor, dig failure) blacklist that ore in `bot.unreachable` and the leg goes back to its branch direction. No separate "mine it" skill was needed: `mine` already handles a visible ore. Ores outside the vertical window are ignored (no vertical digging). Result: pending A/B.

## MINEY (env override of branchY, unset by default)

`branchY` is drawn per slot from the seeded rand in `jitterParams` (-59..-56). `MINEY=-53` fixes it for every bot of that eval; the draw still happens, so the other jittered params are unchanged and arms stay paired. Env cannot differ per arm, so a two-arm run uses the param form, `ARMS="branchY=-58;branchY=-53"` (parseArm overrides the draw the same way). Result: branch level A/B: pending.

## spareAlways (switch `SPAREALWAYS=1`, off by default, requires pickReady)

An iron pickaxe has 250 uses (one per block, deepslate the same as stone), so one spare doubles the digging to about 500 blocks. pickReady only prepares the spare from iron that happens to be in view; with spareAlways (`spareAlwaysStep` in planner.js, restock key `spare_always`, own budget of 40 steps) it is deliberate: with one iron pickaxe, calm, 20+ minutes left and above y0 (the final descent not started) the bot descends to the iron level (y16, where iron peaks; stone iron is mined faster than deepslate iron), searches there with the normal branch explore, mines 3 raw iron, smelts, crafts sticks from carried wood and crafts the spare. It only starts with fuel for 3 smelts on hand (coal/charcoal, or 2 logs) and never fetches wood. The spare is never tossed: the junk list holds only dirt, gravel, stone types and netherrack. The attempt has an 8 minute budget from its first step (`memory.spareSince`, set in `remember`, reset on death); when it expires, or any bound above fails, pickReady's opportunistic path and the normal descent continue. Result: pending A/B (arms `pickReady=1,spareAlways=0` vs `pickReady=1,spareAlways=1`).


## earlySeal (switch `EARLYSEAL=1`, off by default; A/B pending, arms `earlySeal=0;earlySeal=1`)

Seals in while the hostile is still far enough that the walls can go up: placement takes ~66 ticks in a tunnel and fails only when an entity stands in a wall cell (zombie at 3 or 8 blocks: sealed 10/10; adjacent: 0/10, see `analysis/measure/combat_baseline.md`). When ON, `dangerStep` seals before the fight branch if the nearest hostile is >= 3 blocks away and: health < 14, or >= 2 hostiles within 8 blocks, or a ranged hostile (skeleton etc.) has a clear shot; and `canShelter` (>= 6 blocks), no water/lava in or next to the cell, fewer than 2 early seals in the last 10 minutes, and no failed early hold (`hostile_waiting`/`not_sealed`) in the last 5 minutes (`earlyLockUntil`, per run, not reset on death). A lone weak mob at health >= 14 is still fought; with a hostile within 3 blocks nothing changes. The action is `shelter(dir, 'early', reason)` with key `early_seal`: it is exempt from the MAX_SHELTERS/SHELTER_PAUSE count (agent.js `trackShelter` timestamps it instead). The cell holds up to 90 s (`SHELTER_WAITS.early`): it leaves only when no hostile is within 16 blocks, health >= 14, and (not hungry or no food), and it eats inside while hungry with no hostile within 3 blocks. At the 90 s cap the existing exit runs. TELEMETRY adds `early:true, earlyReason` (health/crowd/ranged) to the shelter entry. With the switch off, behaviour is unchanged.

## longRun (switch `LONGRUN=1`, off by default)

For runs of 1-4 hours (`node eval.js ... 240`). With the switch off nothing below applies (the `longrun` param key is only present when it is on). Deaths no longer end the run (`maxDeaths` is skipped, deaths are still counted and each one still resets the per-life memory and the stuck tracker); `lost` stays terminal. Exception: `DEATH_LIMIT` (6) deaths within `DEATH_WINDOW_MIN` (30) minutes with nothing deposited and no new diamond seen in the inventory between them end the run as `deaths`. A skill during which the bot died is never fed to the stuck check. A stuck detection is no longer final: `stuckEscalation` (longrun.js) escalates per detection, level 1 runs the `recoveryFor` routine for the failing signature (even with `RECOVERY` off; if none applies it falls through), level 2 clears all per-life/per-trip planner memory (everything `lifeMemory()` defines; the rotating directions and the relocation budget are kept) and restarts the stuck tracker, level 3 does the same and forces one escape (above y=0: `go_up` then a 64-block surface walk in a rotated direction; underground: one 16-block tunnel hop in a new direction). The position and inventory compared at the next detection are taken after the escalation actions, so the escape walk or a recovery's own inventory change is not progress; only change after it is (inventory changed, or 30+ blocks moved) and restarts at level 1. 6 escalations in a row with no progress end the run as `stuck` (`MAX_ESCALATIONS`, `PROGRESS_MOVE`). Result rows add `longrun: true`, `stuckResets` (count and per-level counts), `deaths`, `gear` (a snapshot every 15 minutes: armor points, best pickaxe tier, pickaxe count, shield, bucket, bed, food, diamonds carried and deposited) and `deposits: [{minute, count}]` (minute counted from the same start as the eval deadline); metrics.js adds `diamondsBanked60to` (mean diamonds deposited from minute 60 on, over LONGRUN runs that lasted more than 60 minutes) and `diamondsBanked60toRuns` (that n) when rows have `longrun`. Result: pending A/B (arms `longrun=0` vs `longrun=1`).

## telemetry (switch `TELEMETRY=1`, off by default)

Observation only (`bot/telemetry.js`): reads bot state, adds no waits or packets, so decisions do not change. With the switch off the `telemetry` param key is absent and the skill log and result rows are unchanged. On, each `skills-*.jsonl` entry gets a `telemetry` object and damage entries get extra fields: `t`, `tick`, `amount`, `attacker {id,type,name,dist,rel}`, `healthAfter`, `foodAfter`. `telemetry` holds: `hostileDist`, `startHealth`, `startFood` (shelter and flee entries; nearest hostile at skill start, null if none tracked), `sealFails` (target cell, error, occupant entity, `sealedCount`, `ticks` since skill start; capped at 20), `mine` (`heldStart`, `picks` with enchants and durability, `ore`, `oresBroken`, `pick` after the dig, `diamondsGained`) and `pickLost` (a pickaxe that left the inventory, last durability seen, cause `worn_out`/`toss`/`unknown`). With LONGRUN, each stuck escalation adds a row to `telemetry.stuck` on the result row: level, last 5 skills and results, pickaxe list.

## gift (ARMS gift=...)
Ablation harness, absent = no change. `gift=base|armor|spare|fortune2|diamondpick` makes eval.js `give` the preset right after placement (base = 1 iron pickaxe; armor = base + iron set, worn by `equipGift` at run start; spare = 3 iron pickaxes; fortune2 = one Fortune II iron pickaxe; diamondpick = one diamond pickaxe). Mining already uses the cheapest pickaxe that can dig a block, so single-pickaxe arms use that pickaxe for everything. Armor is never tossed or crafted over (junk list is dirt/stone only). Rows carry `gift` and `armorPointsEnd`. Gear is not re-given after a death. The `enchantments={"minecraft:fortune":2}` give syntax is unit-tested as a string only and needs one live check.

---

## Addendum: last-pickaxe stuck endings (craft no_tool)

- Fix (unconditional): `digSpot` (S, `skills.js`) now breaks the side wall by hand. With no pickaxe left, a table in the bag could not be placed in a 1-wide shaft (no free cell, wall dig refused `no_tool`), so `craft stone_pickaxe` returned `no_tool` with materials present. Hand-digging stone is slow but needs no drop.
- Switch `SPAREPICK` (`sparePick`, OFF): with exactly one pickaxe and <= 40 uses left, the spare stone pickaxe/sticks (`spareStep`) is crafted before visible diamonds and a home trip, and its failure cap is 6 instead of 2. Details: `analysis/measure/sparepick.md`. Not yet measured.
- Switch `NOTOOLFIX` (`noToolFix`, OFF): with no pickaxe, the replacement (stone from 3 cobble, else wooden) is crafted right after danger and food (`noPickStep`); the spare also fires with two pickaxes and <= 40 uses on the cheapest, keeps 3 sticks, cap 6. Not yet measured.
