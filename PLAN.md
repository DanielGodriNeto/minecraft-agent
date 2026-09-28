# Minecraft Diamond Agent — Plan

**Goal:** a bot that joins a Minecraft Java server, takes orders from its owner in chat
(e.g. `!get diamond max`), mines diamonds, and stores them in a chest — repeatedly.

**Design:** hand-coded **skills** do the moving/mining/crafting; **your own ML model** decides
which skill to run next. This is the only design with a published track record of consistent
diamonds (GITM: 67.5% ObtainDiamond with scripted skills + planner; fully learned low-level
agents top out around 20% — see References).

**Targets**
- ≥ 50% of runs deposit at least 1 diamond (normal difficulty, 60 game-minute cap)
- "max" mode: diamonds deposited per hour, measured and improved by the learned model
- Deaths/hour and stuck rate go down after RL vs the scripted baseline

---

## Architecture

```
Minecraft server (Java 1.21.x)
   ↕  (normal player connection — works on any server that allows bots)
Mineflayer bot (Node)
  ├─ command listener   (owner-only chat commands → objective)
  ├─ skills             (explore, approach, mine, dig_down, go_up, craft, smelt,
  │                      equip, eat, flee, deposit, return_home)
  └─ obs builder        (voxels, inventory, status, objective)
   ↕  JSON lines over TCP
Python
  ├─ policy             (obs → next skill + argument)
  ├─ recorder           (decision logs → .npz)
  └─ trainer            (behavior cloning → PPO)
```

Training, evaluation and real use are the **same code path** — no sim-to-real gap.

### Commands (v1: fixed grammar, owner-only)
| Command | Effect |
|---|---|
| `!get <item> <n\|max>` | objective = collect item (v1: `diamond`; later iron, logs…) |
| `!store` | storage = chest nearest to the owner; `!store x y z` for explicit coords |
| `!status` | reply with objective, inventory counts, diamonds stored, health |
| `!come` / `!stop` | walk to owner / abort current objective and idle |

Commands from any player not in `OWNER_USERNAMES` are ignored.
Free-text orders ("get as many diamonds as you can") → command mapping is Phase 6 (optional LLM).

### Skills (hand-coded, on `mineflayer-pathfinder` + `mineflayer-collectblock`)
| Skill | Argument | Done when |
|---|---|---|
| `explore` | surface / underground | new target block visible or timeout |
| `approach` | block type / entity | within reach |
| `mine` | block type | block broken + drop collected |
| `dig_down` | target y | at y (staircase, never straight down) |
| `go_up` | — | reached surface / y of storage |
| `craft` / `smelt` | item | item in inventory, else fails with reason |
| `equip` / `eat` | item | done |
| `flee` | — | no hostile within 16 blocks |
| `deposit` | storage chest | target items moved into chest |
| `return_home` | — | within 3 blocks of storage |

Every skill returns `{ok, reason, ticks}` and has a timeout.

### Decision model (your ML)
- **Obs:** 9×9×9 coarse voxel summary around the bot (block-type ids, `UNKNOWN` if unseen),
  inventory counts (~60 relevant items), health, food, y, time of day, objective,
  last 8 skills + results.
- **Output:** skill id + argument (from a small fixed menu per skill).
- **Model:** MLP + GRU, < 1M params — trains on CPU.
- **Training:** behavior cloning on the scripted planner's decisions → PPO fine-tune with a
  KL penalty to the cloned policy.
- **Reward:** +1 per diamond deposited, +0.1 per tech-tree milestone (first time per run),
  −1 death, −0.01 per failed skill.

---

## Phases

### Phase 0 — Setup (week 1)
- [ ] 0.1 Java 21, Node 22, Python 3.11, PyTorch (CPU is enough)
- [ ] 0.2 Local server 1.21.x, `online-mode=false`, localhost only; pin Minecraft + mineflayer versions
- [ ] 0.3 Repo layout: `bot/` (Node), `agent/` (Python), `tests/`
- **Gate:** bot joins and answers `!status` from the owner.

### Phase 1 — Commands + skills (weeks 2–4)
- [ ] 1.1 Command parser + owner check
- [ ] 1.2 Skills listed above, each with timeout and `{ok, reason}` result
- [ ] 1.3 Test world helpers: `/setblock`, `/give`, `/tp`, `/fill` to build fixtures

**Tests**
- [ ] `test_command_parse` — valid/invalid commands, n vs max
- [ ] `test_command_owner_only` — non-owner `!get` is ignored
- [ ] `test_mine` — diamond ore placed 10 blocks away → mined, diamond in inventory
- [ ] `test_dig_down` — reaches y=-58 by staircase; never digs into lava (lava fixture below)
- [ ] `test_craft_chain` — `/give` logs → planks → table → sticks → wooden pickaxe
- [ ] `test_craft_missing` — craft without ingredients → `{ok:false, reason:"missing"}`
- [ ] `test_smelt` — raw iron + coal + furnace → iron ingot
- [ ] `test_deposit` — diamonds end up in the chest, inventory keeps tools/food
- [ ] `test_deposit_chest_full` — full chest → `{ok:false, reason:"full"}`, bot reports in chat
- [ ] `test_flee` — zombie spawned nearby → bot ends ≥16 blocks away
- [ ] `test_skill_timeout` — unreachable target → fails within timeout, never hangs

**Gate:** all green on 3 consecutive runs.

### Phase 2 — Scripted baseline (weeks 4–6)
- [ ] 2.1 Fixed-plan planner: tech tree → iron pickaxe → dig to y≈-58 → branch-mine → deposit → repeat
- [ ] 2.2 "max" loop: return and deposit when inventory full, pickaxe low, food low, or night + surface
- [ ] 2.3 Eval harness: 50 runs on fresh spawns (normal difficulty, 60 game-min cap) →
      success rate, diamonds/hour, deaths/hour, stuck rate, 95% CI
- [ ] 2.4 20 bots in parallel, spawns ≥ 5k blocks apart

**Tests**
- [ ] `test_planner_order` — never attempts a craft whose inputs it can't have
- [ ] `test_restock` — broken pickaxe mid-run → crafts a new one and continues
- [ ] `test_death_recovery` — killed → respawns, rebuilds tools, resumes objective

**Gate:** ≥ 50% of runs deposit ≥ 1 diamond. **This number caps the ML phases — fix skills
until it passes before moving on.**

### Phase 3 — Decision env + behavior cloning (weeks 6–8)
- [ ] 3.1 gymnasium Env: step = run one skill; obs/reward as above
- [ ] 3.2 Recorder logs the scripted planner's decisions (≥ 2,000 runs)
- [ ] 3.3 BC trainer, train/val split by run

**Tests**
- [ ] `test_env_checker` — `gymnasium.utils.env_checker.check_env` passes
- [ ] `test_recorder_roundtrip` — write → read identical
- [ ] `test_overfit_one_batch` — loss → ~0 on one batch
- [ ] `test_eval_deterministic` — same checkpoint + seeds → same numbers

**Gate:** cloned policy's success rate within 5 points of the scripted baseline.

### Phase 4 — RL fine-tune (weeks 8–11)
- [ ] 4.1 PPO + KL penalty to the cloned policy, 20 parallel bots
- [ ] 4.2 Track where it beats the script: deaths, caves, where it looks for diamonds

**Tests**
- [ ] `test_reward` — deposit gives +1 per diamond; death gives −1
- [ ] `test_kl_zero_at_init` — KL = 0 when initialised from the cloned policy

**Gate:** beats the scripted baseline by ≥ 10 points success rate **or** ≥ 20% diamonds/hour,
non-overlapping 95% CI.

### Phase 5 — Real-server hardening (week 12)
- [ ] 5.1 Auto-reconnect with backoff; resume objective after reconnect
- [ ] 5.2 Microsoft auth for `online-mode=true` servers (dedicated alt account, never your main)
- [ ] 5.3 Chat rate limit (≤ 1 message / 2 s) so it doesn't trip spam filters
- [ ] 5.4 Handle protected chests (claims plugins) → report "can't open chest" in chat

**Tests**
- [ ] `test_reconnect` — kill server connection → bot rejoins and resumes within 60 s
- [ ] `test_protected_chest` — open fails → objective pauses, owner is told

**Gate:** 3 h unattended "max" session on a friend's/own online-mode server with no manual fix.

### Phase 6 — Optional
- [ ] Free-text orders → command via small LLM (API key in `.env`, gitignored)
- [ ] More objectives: iron, logs, food
- [ ] Swap single skills (e.g. `flee`, combat) for learned ones

---

## Risks & edge cases
- [ ] Only join servers where bots are allowed (your own / friends'); many public servers ban automation
- [ ] Bot account ≠ your main account (ban risk)
- [ ] Owner whitelist — otherwise anyone in chat can command it
- [ ] Death drops items: deposit early; `max` loop returns home before risky states
- [ ] Lava: `dig_down` staircases and checks blocks below/ahead before breaking
- [ ] Chest theft/full chest on multiplayer: `!status` reports chest contents; full → stop + tell owner
- [ ] Anti-cheat may flag pathfinder movement on some servers → not fixable in general, document it
- [ ] Version drift: pin Minecraft, mineflayer, pathfinder, minecraft-data versions
- [ ] Night/mobs on surface: skill planner avoids surface travel at night where possible

## Metrics (every reported number)
Success rate (≥1 diamond deposited) · diamonds deposited/hour · deaths/hour · stuck rate ·
50 runs on fresh spawns · 95% CI · difficulty stated · baseline = scripted planner.

## Deferred (add only if measured need)
- Carpet fake players + `/tick sprint` + Lithium/FerriteCore/C2ME + Chunky for faster training —
  only if 20 real-time bots can't produce enough runs for PPO.
- Learned low-level control (VPT-style) — research track, ≤ 20% diamond rate in literature.

## Timeline (part-time, ~10 h/week)
| Phase | Weeks | Confidence |
|---|---|---|
| 0–1 Setup, commands, skills | 1–4 | 85% |
| 2 Scripted baseline ≥ 50% diamonds | 4–6 | 70% (normal) / 85% (peaceful) |
| 3 Cloned policy matches baseline | 6–8 | 85% |
| 4 RL beats baseline | 8–11 | 50% |
| 5 Works unattended on a real server | 12 | 75% |

## References
- GITM (scripted skills + planner, 67.5% ObtainDiamond): https://arxiv.org/abs/2305.17144
- Voyager (Mineflayer skill library, diamond tools 3/3): https://voyager.minedojo.org/
- VPT (BC + RL with KL penalty): https://arxiv.org/abs/2206.11795
- DreamerV3 (from scratch, ~0.4% diamond episodes): https://www.nature.com/articles/s41586-025-08744-2
- JARVIS-1: https://arxiv.org/html/2311.05997 · Optimus-1: https://arxiv.org/html/2408.03615v2
- Mineflayer: https://github.com/PrismarineJS/mineflayer
