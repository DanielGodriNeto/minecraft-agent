# Minecraft Diamond Agent — Plan

**Goal:** a bot that joins a Minecraft Java server, takes orders from its owner in chat
(e.g. `!get diamond max`), mines diamonds, and stores them in a chest — repeatedly.

**Design:** hand-coded **skills** do the moving/mining/crafting; **your own ML model** decides
which skill to run next. This is the only design with a published track record of consistent
diamonds (GITM: 67.5% ObtainDiamond with scripted skills + planner; fully learned low-level
agents top out around 20% — see References).

**Deliverables, in order of certainty**
1. **Usable bot (end of Phase 2):** scripted planner + skills + chat commands. Works on its own.
2. **Your ML model in the loop (Phase 3):** cloned policy that matches the scripted planner.
3. **Stretch (Phase 4):** RL-improved policy. Bounded experiment with a fallback rule.

---

## Definitions
| Term | Meaning |
|---|---|
| **Run** | One gameplay episode under `!get diamond max`: bot starts at a spawn slot with empty inventory; ends after 60 **real-time** minutes or 3 deaths. **Success** = ≥1 diamond deposited during the run. Success rate and diamonds/hour come from the same runs. |
| **Spawn slot** | One of 600 fixed coordinates in a pre-generated world, ≥1,000 blocks apart, each pre-generated to a 256-block radius. **Slots 0–99 = held-out gate set** (used only for a phase's final gate check, once per phase), **100–199 = dev set** (all tuning/iteration), **200–599 = training set** (BC/PPO data). |
| **Fresh spawn** | Before each batch: stop the server → copy the pristine world snapshot over the live world folder → start the server → wait for full startup. No slot is reused within a batch; every batch sees identical terrain. |
| **Curriculum episode** | PPO training-only episode that starts geared at mining depth. Never counts as a Run and never used for any gate. |
| **Stuck** | 3 consecutive skill failures with no inventory change and < 5 blocks of movement. Ends the run as a failure. |
| **Test pass** | The full `tests/` suite passing once. |

All times in this plan are real wall-clock time. Runs execute **unattended** (e.g. overnight) —
bot-hours are not your working hours.

---

## Architecture

```
Paper server (Java, one pinned 1.21 patch)
   ↕  normal player connections
Mineflayer bots (Node, one process, N bots)
  ├─ command listener   (owner-only chat commands → objective)
  ├─ skills             (explore, approach, mine, dig_down, go_up, craft, smelt,
  │                      equip, eat, hunt, flee, shelter, deposit, return_home)
  ├─ obs builder        (visible voxels, inventory, status, objective)
  └─ skill log          (JSONL: every skill call + result — from Phase 1 on)
   ↕  one TCP connection per bot, JSON lines, every message carries bot_id + request id
Python
  ├─ policy             (obs + action mask → next skill + argument)
  ├─ recorder           (reads the skill log → .npz)
  └─ trainer            (behavior cloning → PPO, asynchronous transition buffer)
```

Training, evaluation and real use are the **same code path** — no sim-to-real gap.

### Commands (v1: fixed grammar)
| Command | Effect |
|---|---|
| `!get <item> <n\|max>` | objective = collect item (v1: `diamond`) |
| `!store` | storage = chest nearest to the owner; `!store x y z` for explicit coords |
| `!status` | objective, inventory counts, diamonds stored, health |
| `!come` / `!stop` | walk to owner / abort objective and idle |

**Owner authentication**
- Dev (offline-mode): server bound to `127.0.0.1` + `whitelist=on`, so nobody else can join.
  Username matching is only safe because of this — offline UUIDs are derived from the name.
- Real servers: `online-mode=true` only; commands accepted only from the owner's **UUID**
  (`bot.players[name].uuid`), not the name string. The bot refuses to take commands on an
  offline-mode server unless `ALLOW_OFFLINE_OWNER=1` is set.

### Skills (hand-coded, on `mineflayer-pathfinder` + `mineflayer-collectblock`)
| Skill | Argument | Done when |
|---|---|---|
| `explore` | surface / branch-mine | a target block becomes **visible** or timeout |
| `approach` | visible block / entity | within reach |
| `mine` | block type | block broken + drop collected |
| `dig_down` | target y | at y (staircase, never straight down) |
| `go_up` | — | reached surface / storage y |
| `craft` / `smelt` | item | item in inventory, else fails with reason |
| `equip` / `eat` | item | done |
| `flee` | — | no hostile within 16 blocks |
| `shelter` | last direction | walled into a 1x1x2 cell (≥ 6 placeable blocks, else `flee`), waited out the danger, dug out |
| `fight` | — | nearest hostile within 4 blocks killed or out of range (15 s cap); used when sheltering keeps failing |
| `hunt` | — | nearest food animal within 24 blocks killed and its drops picked up |
| `deposit` | storage chest | target items moved into chest |
| `return_home` | — | within 3 blocks of storage |

Skill rules:
- Every skill returns `{ok, reason, ticks}`.
- **External watchdog on every pathfinder/collectblock call** (`Promise.race` with a timer →
  `bot.pathfinder.stop()`); the library can hang forever on unbreakable obstacles
  (mineflayer-pathfinder #222), so its own timeouts are not trusted.
- Dig timeouts scale with `bot.digTime(block)` (deepslate is much slower than stone).
- **No x-ray:** ore is only targeted if it is exposed (air/water-adjacent) **and** within line of
  sight. Discovery underground is by branch mining, not `findBlocks` through walls. This keeps
  the bot fair on other people's servers and robust to anti-xray plugins that send fake ore.

### Decision model (your ML)
- **Obs:** 9×9×9 voxel summary around the bot (block-type ids, `UNKNOWN` if not visible),
  inventory counts (~60 items), health, food, y, time of day, objective, last 8 skills + results.
- **Action:** skill id + argument from a small fixed menu, with an **action mask** (e.g. no
  `craft` without ingredients, no `deposit` with nothing to deposit) applied in BC and PPO.
- **Model:** MLP + GRU, < 1M params — trains on CPU.
- **Where it can beat the script** (the choices the planner hard-codes, exposed as actions):
  1. branch-mining y-level and tunnel spacing
  2. when to return and deposit (inventory, tool durability, health, distance from home)
  3. flee vs. keep mining at a given health / mob distance
  4. when to abandon a tunnel direction
- **Reward:** +1 per diamond deposited · +0.1 per tech-tree milestone (one-shot per run) ·
  **−5 per death** · −0.01 per failed skill · **−0.001 per second** (aligns with diamonds/hour).
  Death (−5, plus losing carried items) must always cost more than an entire unproductive
  60-minute run (−3.6), so the policy can never profit from dying to end a bad run.

---

## Budget (measured in Phase 2.4)
Measured: N = 12 bots, runs capped at 60 min (`max` mode), ~1 min restore + restart + placement per
batch (14 GB world copy), 8 h unattended per night → ~7 batches of 12 = ~84 runs/night.
(The table below still uses the pre-measurement N = 10 estimate; with N = 12 each row needs ~15% fewer nights.)

| Use | Nights | Runs / episodes | Skill decisions |
|---|---|---|---|
| Phase 2 gate (planner, held-out 0–99) | ~1.5 | 100 | — |
| Phase 3 gate (cloned policy, held-out 0–99) | ~1.5 | 100 | — |
| Phase 4 gate (RL policy, held-out 0–99) | ~1.5 | 100 | — |
| Dev-slot tuning passes, Phases 2–4 (~6 × 100 runs) | ~9 | ~600 | — |
| BC dataset (400 training slots, ~2.5× each) | ~14 | ~1,000 | ~150k |
| PPO (800 curriculum episodes × 15 min + 800 full runs × 60 min, + restores) | ~14 | ~1,600 | ~160k |
| **Total** | **~41** | | |

Paired gates reuse the previous phase's held-out runs (same slots, same snapshot), so each gate
costs one new 100-run batch. Nights fit inside the phase windows: Phase 2 (21 nights) holds its
gate + tuning; Phase 3 (21) holds BC data + gate + tuning; Phase 4 (28) holds PPO + gate + tuning.

160k decisions is small for PPO — which is why Phase 4 uses masking, curriculum starts, a small
action menu, a KL anchor, and is a bounded experiment.

---

## Phases

### Phase 0 — Setup (week 1)
- [x] 0.1 Java 21, Node 24, Python 3.14, PyTorch 2.14 CPU (`agent/requirements.txt`)
- [x] 0.2 Paper server (1.21.11 build 132) on one exact 1.21 patch taken from mineflayer's tested-versions list;
      pin `mineflayer`, `mineflayer-pathfinder`, `mineflayer-collectblock`, `minecraft-data`
      exact versions in `package.json`
- [x] 0.3 `server.properties`: `online-mode=false`, `server-ip=127.0.0.1`, whitelist on
- [x] 0.4 Repo layout: `bot/` (Node), `agent/` (Python), `tests/`
- [x] 0.5 `require-resource-pack=false`, no forced resource pack
- **Gate:** a bare mineflayer bot joins **the actual Paper build** (not only vanilla), walks,
  digs a block and answers `!status` from the owner; a non-whitelisted client can't join.
  If that Paper build breaks mineflayer, fall back to the vanilla jar of the same patch.
  **Passed** on Paper 1.21.11-132 (`cd bot && npm run gate`, server running).

### Phase 1 — Commands + skills (weeks 2–5)
- [x] 1.1 Command parser + owner authentication (both modes above)
- [x] 1.2 Skills, each with watchdog and `{ok, reason, ticks}`
- [x] 1.3 Skill log (JSONL) — same format the Phase 3 recorder reads
      (`logs/skills-<bot>.jsonl`, override with `SKILL_LOG`; one line per call: skill, args, result,
      before/after snapshot of pos/health/food/time/inventory. Phase 3 adds obs fields.)
- [x] 1.4 Test harness on a **separate flat test world** (`tests/harness.js`; Owner is op via `server/ops.json`):
      - setup/teardown per test: `/kill @e[type=!player]`, `/clear`, `/fill` fixture area with air,
        `/tp` to staging point
      - wait by polling state (`pathfinder.isMoving()`, inventory), never fixed sleeps

**Tests**
- [x] `test_command_parse` — valid/invalid commands, n vs max
- [x] `test_command_owner_only` — non-owner `!get` ignored
- [x] `test_offline_refuses_commands` — offline-mode + no `ALLOW_OFFLINE_OWNER` → commands ignored
- [x] `test_mine` — exposed diamond ore 10 blocks away → mined, diamond in inventory
- [x] `test_no_xray` — diamond ore fully enclosed in stone → never targeted
- [x] `test_dig_down` — reaches y=-58 by staircase; lava pocket fixture below → avoided
- [x] `test_craft_chain` — `/give` logs → planks → table → sticks → wooden pickaxe
- [x] `test_craft_missing` — `{ok:false, reason:"missing"}`
- [x] `test_smelt` — raw iron + coal + furnace → iron ingot
- [x] `test_deposit` — diamonds into chest, tools/food kept
- [x] `test_deposit_chest_full` — `{ok:false, reason:"full"}`, owner told in chat
- [x] `test_flee` — zombie nearby → bot ends ≥16 blocks away
- [x] `test_skill_timeout` — target behind bedrock → fails within timeout, never hangs
- [x] `test_skill_log` — every skill call appends one JSON line with args, result, before/after state

**Gate:** 3 consecutive test passes. **Passed** (`npm test` + `npm run test:live` ×3, server running).
Notes: crafting goes through the server recipe book (`craft_recipe_request`) because mineflayer's
click-based `bot.craft()` loses clicks on 1.21.11; requests are paced for Paper's `place_recipe`
limiter. `mineflayer-collectblock` is pinned but unused (it enables `dontCreateFlow=false` and
auto-deposits into chests).
Descope rule: if week 5 ends with failures, ship `mine`/`dig_down`/`deposit` first and move
`craft_chain`/`smelt` to a one-week buffer before Phase 2.

### Phase 2 — Scripted baseline = usable bot (weeks 6–8)
- [x] 2.1 Pre-generate 600 spawn slots with Chunky (256-block radius **per slot**, not one bounding
      box); save pristine snapshot. Check free disk ≥ 2× the pre-generated world size
      (estimate: ~5–10 GB per copy — measure after generation). **Measured: 14 GB per copy**, 310 GB free.
      Slots in `bot/slots.json` (seed 20260928, land only, 1024-block grid); `node bot/pregen.js`,
      `node bot/eval.js snapshot`. Fresh spawn (restore + start) ≈ 40 s.
- [ ] 2.2 Fixed-plan planner: tech tree → iron pickaxe → dig to y≈-58 → branch-mine → deposit → repeat.
      Planner parameters (branch y, spacing, return thresholds) get small random jitter per run
      so recorded data covers more states.
- [ ] 2.3 `max` loop: return and deposit when inventory full, pickaxe low, food low, or night + surface
- [x] 2.4 **Capacity benchmark (before any eval):** raise bot count until server TPS < 19 or
      CPU > 85%; set N to the last good value; rewrite the Budget table with measured N,
      run length and restore overhead.
      **Measured** (`node bot/bench.js 4,8,12,16 8`): N=4/8/12 pass (min TPS 20/19.8/19.2, CPU median
      7/11/13%), N=16 fails (min TPS 17.6). **N = 12**; the limit is server TPS, not CPU.
- [ ] 2.5 Eval harness at that N: fresh spawn → runs on a slot set → success rate,
      diamonds/hour, deaths/hour, stuck rate, 95% CI. Tune against **dev slots 100–199**;
      run the held-out slots 0–99 once for the gate

**Tests**
- [x] `test_planner_order` — never attempts a craft whose inputs it can't have
- [x] `test_restock` — pickaxe broken mid-run → crafts a new one and continues
- [x] `test_death_recovery` — killed → respawns, rebuilds tools, resumes objective
- [x] `test_snapshot_restore` — after stop/restore/restart, a bot queries sample blocks at a slot
      through the running server and they match the pristine snapshot

**Gate:** ≥ 50% success on the 100 held-out runs (slots 0–99). This caps the ML phases — fix skills until it passes.
**At this point the bot is usable** — Phase 5 hardening can be pulled forward if you want to use it
on a real server before the ML work.

### Phase 3 — Your model: behavior cloning (weeks 9–11)
- [ ] 3.1 gymnasium Env: step = run one skill; obs, action mask, reward as above
- [ ] 3.2 Record ~1,000 runs on training slots 200–599 (≈14 nights)
- [ ] 3.3 BC trainer, train/val split by run

**Tests**
- [ ] `test_env_checker` — `gymnasium.utils.env_checker.check_env` passes
- [ ] `test_action_mask` — masked actions get zero probability; mask matches skill preconditions
- [ ] `test_recorder_roundtrip` — write → read identical
- [ ] `test_overfit_one_batch` — loss → ~0 on one batch
- [ ] `test_eval_deterministic` — same checkpoint + slots → same numbers

**Gate:** paired comparison on held-out slots 0–99 (same slot, same snapshot, planner vs policy):
success-rate difference ≥ −5 points (paired bootstrap 95% CI). Also report per-decision-type
accuracy (return, flee, branch choice) and per-slot variance, not only the aggregate.

### Phase 4 — Stretch: RL fine-tune (weeks 12–15)
- [ ] 4.1 PPO + KL penalty to the cloned policy; asynchronous collection (each bot pushes
      transitions to a shared buffer independently — no lock-step)
- [ ] 4.2 Curriculum: 50% curriculum episodes (geared via `/give` at mining depth), 50% full runs
      on training slots
- [ ] 4.3 Report the four decision types from "Where it can beat the script", plus mid-game
      diamonds/hour measured from reaching mining depth (isolates curriculum gains)

**Tests**
- [ ] `test_reward` — +1 per diamond deposited, −5 per death, time penalty applied
- [ ] `test_milestone_one_shot` — breaking and re-crafting a table gives the bonus once per run
- [ ] `test_kl_zero_at_init` — KL = 0 when initialised from the cloned policy

**Gate:** paired comparison of full Runs on held-out slots 0–99 vs the cloned policy: diamonds/hour +20% **or**
success rate +10 points, paired bootstrap 95% CI excluding 0.
**Fallback rule:** if the gate isn't met by week 15 — including because the measured budget
overran (more PPO nights than the window holds) — the Phase 3 policy (or Phase 2 planner) is the
final bot; Phase 4 results get written up as findings.

### Phase 5 — Real-server hardening (week 16, or right after Phase 2 if preferred)
- [ ] 5.1 Auto-reconnect with backoff; resume objective
- [ ] 5.2 Microsoft auth for `online-mode=true` (dedicated alt account, never your main);
      verify commands are UUID-checked before joining any multi-user server
- [ ] 5.3 Chat rate limit (≤ 1 message / 2 s)
- [ ] 5.4 Protected chests (claim plugins) → report "can't open chest" in chat

**Tests**
- [ ] `test_reconnect` — connection killed → rejoins and resumes within 60 s
- [ ] `test_protected_chest` — open fails → objective pauses, owner told
- [ ] `test_uuid_auth` — player with owner's name but different UUID → ignored

**Gate:** 3 h unattended `max` session on your own/friend's online-mode server with no manual fix.

### Phase 6 — Optional
- [ ] Free-text orders → command via small LLM (API key in `.env`, gitignored)
- [ ] More objectives: iron, logs, food
- [ ] Swap single skills (`flee`, combat) for learned ones

---

## Risks & edge cases
- [ ] Only join servers where bots are allowed; many public servers ban automation
- [ ] Bot account ≠ your main account (ban risk)
- [ ] Spoofed owner name on offline-mode servers → localhost+whitelist in dev, UUID + online-mode elsewhere
- [ ] X-ray: ore targeting limited to exposed + visible blocks; anti-xray plugins may still hide real ore
- [ ] Pathfinder hangs → external watchdog on every call
- [ ] Death drops items: deposit early; `max` loop returns home before risky states
- [ ] Lava: staircase digging; check blocks below/ahead before breaking
- [ ] Chest theft/full chest on multiplayer: `!status` reports contents; full → stop + tell owner
- [ ] Anti-cheat may flag pathfinder movement → document per server, not fixable in general
- [ ] Local PC limits (TPS/CPU/RAM with N bots) → capacity benchmark in 2.4 sets N
- [ ] Overfitting to fixed terrain → tune on dev slots, gate once per phase on held-out slots,
      400 distinct training terrains
- [ ] Paper ≠ vanilla for mineflayer → Phase 0 gate tests the actual Paper build; vanilla fallback
- [ ] Disk: pristine + live world copies → free-space check in 2.1
- [ ] Too little data for PPO → curriculum, masking, KL anchor, fallback rule
- [ ] Version drift: exact pins; re-check mineflayer's tested versions before any server upgrade

## Metrics (every reported number)
Success rate · diamonds deposited/hour · deaths/hour · stuck rate · gate runs on held-out slots
0–99 (count set in Phase 2.5, currently 100) · paired comparisons against the previous phase ·
95% CI (paired bootstrap) · difficulty stated.

## Deferred (add only on measured need)
- Carpet fake players + `/tick sprint` + Lithium/FerriteCore/C2ME for faster training — only if the
  Phase 2.4 benchmark shows the Budget table can't be met. Note: Mineflayer can't follow
  `/tick sprint`, so this means a different bot backend for training.
- Learned low-level control (VPT-style) — research track, ≤ 20% diamond rate in literature.

## Timeline (part-time, ~10 h/week; bot runs are unattended)
| Phase | Weeks | Confidence |
|---|---|---|
| 0–1 Setup, commands, skills | 1–5 | 80% |
| 2 Usable scripted bot, ≥ 50% diamonds | 6–8 | 70% (normal) / 85% (peaceful) |
| 3 Your cloned model matches the planner | 9–11 | 85% |
| 4 RL beats the cloned model (stretch) | 12–15 | 40% |
| 5 Works unattended on a real server | 16 | 75% |

## References
- GITM (scripted skills + planner, 67.5% ObtainDiamond): https://arxiv.org/abs/2305.17144
- Voyager (Mineflayer skill library, diamond tools 3/3): https://voyager.minedojo.org/
- VPT (BC + RL with KL penalty): https://arxiv.org/abs/2206.11795
- DreamerV3 (from scratch, ~0.4% diamond episodes): https://www.nature.com/articles/s41586-025-08744-2
- JARVIS-1: https://arxiv.org/html/2311.05997 · Optimus-1: https://arxiv.org/html/2408.03615v2
- Mineflayer: https://github.com/PrismarineJS/mineflayer
- mineflayer-pathfinder hang issue: https://github.com/PrismarineJS/mineflayer-pathfinder/issues/222
