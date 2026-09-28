# Minecraft Agent — Plan

**Goal:** your own neural-net policy that plays **real Minecraft Java 1.21.x**, learning from
**objectives + playthroughs** (imitation), then improving with RL.
**North star:** Ender Dragon. **v1 target:** iron pickaxe. **v2:** diamond.

Recipe: VPT-style — behavior cloning (BC) on demonstrations → RL fine-tune with a KL penalty
to the BC policy — with a goal-conditioned policy (STEVE-1 idea), but on symbolic observations
instead of pixels so the model is small enough for local hardware (RX 7600 / CPU).

---

## Architecture

```
Vanilla server 1.21.x (local, offline-mode, localhost only)
   ↕
Mineflayer bot (Node)  ──JSON lines over TCP──  Python gymnasium Env
                                                  ├─ obs adapter
                                                  ├─ action adapter
                                                  └─ reward = objective completion
Python: recorder → dataset (.npz) → BC trainer → PPO fine-tune → checkpoint
```

**One interface for recording, training, eval and deployment → no sim-to-real gap.**
Deployment = point the same bot at any real server/LAN world.

### Observation (per decision tick)
| Part | Spec |
|---|---|
| Voxels | 15×15×15 egocentric grid of block ids (vocab from `minecraft-data`); blocks without line of sight = `UNKNOWN` |
| Entities | 8 nearest visible: type id, relative (dx,dy,dz), health |
| Inventory | count vector over items in the objective tree (~150 ids) |
| Status | health, food, y, time of day, dimension, held item, on_ground, in_water |
| Objective | current objective id (one-hot) — this is the "prior knowledge" input |

### Action space (discrete, decision every 4 ticks = 5 Hz)
- move fwd/back/left/right, jump, sprint (held 4 ticks)
- look: yaw ±15°/±90°, pitch ±15°
- attack/dig (held until block breaks or 20 ticks), use/place
- hotbar select 1–9
- `craft(item_id)`, `smelt(item_id)` — no-op + `info["invalid"]` if missing ingredients (agent must learn recipes)

Fallback if BC plateaus on navigation: add macros `go_to(block_type)`, `mine_nearest(block_type)`.

### Objective tree
- **v1:** log → planks → crafting_table → stick → wooden_pickaxe → cobblestone → stone_pickaxe → furnace → coal → raw_iron → iron_ingot → iron_pickaxe
- **v2:** diamond → diamond_pickaxe, iron armor, bucket
- **v3:** obsidian → nether_portal → blaze_rod → ender_pearl → eye_of_ender → stronghold → dragon

### Model (PyTorch, ~2–5M params)
`Embedding(block,16) → 3D CNN → 256` ‖ `MLP(inventory+status)` ‖ `mean-pool MLP(entities)` ‖
`Embedding(objective)` → concat → `LSTM(512)` → action logits + craft/smelt head + value head.

### Demonstration sources
1. **Scripted teacher** — Mineflayer + `mineflayer-pathfinder` + `mineflayer-collectblock` solving v1 objectives; its control states / look deltas / dig/craft events are logged through the action adapter (volume source).
2. **Your playthroughs via teleop** — keyboard → same action space, watching through `prismarine-viewer`. Labels are exact because you play *in* the agent's action space (quality source, fixes teacher blind spots).
3. *(later, optional)* LLM teacher (Mindcraft) for v2/v3 objectives the scripted teacher can't do.

---

## Phases

### Phase 0 — Scaffolding (week 1)
- [ ] 0.1 Install Java 21, Node 22, Python 3.11, PyTorch; check ROCm on RX 7600, else CPU
- [ ] 0.2 Local vanilla server 1.21.x, `online-mode=false`, bound to localhost
- [ ] 0.3 Repo layout: `bot/` (Node), `agent/` (Python), `tests/`; pin Minecraft + mineflayer versions
- **Gate:** `python -m agent.check_device` prints the device; bot joins the server and chats "hello".

### Phase 1 — Env bridge (weeks 2–3)
- [ ] 1.1 Node bridge: `reset()`, `step(action) → obs, reward, done, info` as JSON lines over TCP
- [ ] 1.2 Obs adapter incl. line-of-sight raycast
- [ ] 1.3 Action adapter
- [ ] 1.4 Reset = teleport to random far spot + clear inventory + restore health; wait for chunks
- [ ] 1.5 gymnasium `Env` wrapper

**Tests**
- [ ] `test_obs_voxels` — `/setblock` a known pattern → grid matches exactly
- [ ] `test_occlusion` — diamond ore behind stone → `UNKNOWN`
- [ ] `test_action_move` — 20× forward → position advances along facing
- [ ] `test_craft` — `/give` logs → `craft(planks)` → +4 planks
- [ ] `test_craft_missing` — `craft(wooden_pickaxe)` without sticks → inventory unchanged, `info["invalid"]`
- [ ] `test_reset` — fresh inventory, full health, new position, chunks loaded
- [ ] `test_env_checker` — `gymnasium.utils.env_checker.check_env` passes
- [ ] Benchmark: decisions/s for 1 and 10 bots; server TPS stays ≥ 19

**Gate:** all green; 10 bots × 1 h of random actions with no crash or memory growth.

### Phase 2 — Demonstrations (weeks 3–5)
- [ ] 2.1 Recorder: `(obs, action, objective)` per decision tick → one `.npz` per episode
- [ ] 2.2 Scripted teacher for v1 objectives
- [ ] 2.3 Teleop + prismarine-viewer; record your own playthroughs
- [ ] 2.4 Collect ≥ 500 teacher episodes + ≥ 20 human episodes

**Tests**
- [ ] `test_recorder_roundtrip` — write → read gives identical arrays
- [ ] `test_action_labels` — replaying recorded actions from the same start (flat, peaceful world) reproduces final inventory in ≥ 90% of episodes
- [ ] Dataset report: action histogram, objective coverage, episode lengths

**Gate:** scripted teacher reaches iron_pickaxe in ≥ 70% of episodes.

### Phase 3 — Behavior cloning (weeks 5–7)
- [ ] 3.1 Model
- [ ] 3.2 BC trainer (cross-entropy, sequence length 64, invalid-action masking), train/val split **by episode**
- [ ] 3.3 Eval harness: 50 episodes on held-out spawn points → per-objective success rate + time-to-objective, 95% CI

**Tests**
- [ ] `test_model_shapes` — batch in, correct logits/value shapes out
- [ ] `test_overfit_one_batch` — loss → ~0 on a single batch (catches wiring bugs)
- [ ] `test_eval_deterministic` — same checkpoint + seeds → same numbers

**Gate:** crafting_table ≥ 60%, wooden_pickaxe ≥ 30%.

### Phase 4 — RL fine-tune (weeks 7–11)
- [ ] 4.1 PPO; reward +1 on current objective completion → advance objective; −1 on death
- [ ] 4.2 KL(π ‖ π_BC) penalty with decaying coefficient (prevents forgetting the demos)
- [ ] 4.3 20 parallel bots (spaced ≥ 10k blocks apart, or several servers)

**Tests**
- [ ] `test_reward_objective_advance` — completing an objective gives +1 and switches the objective id
- [ ] `test_kl_zero_at_init` — KL = 0 when π is initialised from π_BC
- [ ] Sanity run: PPO from scratch learns "collect 1 log" in a flat world in < 1 h

**Gate:** stone_pickaxe ≥ 50%, iron_pickaxe ≥ 10%, and beats BC by ≥ 10 points (non-overlapping 95% CI).

### Phase 5 — Climb the tree (month 3+)
Repeat Phase 2→4 per objective block (v2, then v3). Use start-state curricula via `/give` + `/tp`
(e.g. start in the Nether with iron gear) to learn late sections before chaining them.
**Gate per block:** ≥ 20% success from its start state, then ≥ 5% chained from a fresh spawn.

---

## Risks & edge cases
- [ ] Run bots only on your local offline server — never public servers (bans, ToS)
- [ ] Any API key (LLM teacher) lives in `.env`, gitignored, never logged
- [ ] Stuck detection: no position change for 30 s → end episode
- [ ] Death: respawn, mark episode terminal, restore on reset
- [ ] Train on peaceful first, then normal difficulty; report difficulty with every result
- [ ] Server lag with many bots → measure TPS, cap bot count
- [ ] Far teleports → wait for chunk load before the first observation
- [ ] Teacher bias: BC inherits teacher mistakes; RL phase must beat BC, not just match it
- [ ] Version drift: pin Minecraft, mineflayer and minecraft-data versions

## Evaluation protocol (every reported number)
≥ 3 training seeds · 50 eval episodes on held-out spawns · 95% CI · baseline (random + previous
phase) · difficulty stated · video/log of one success and one failure.

## Timeline (part-time, ~10 h/week)
| Phase | Weeks | Confidence |
|---|---|---|
| 0–1 Scaffolding + env | 1–3 | High |
| 2 Demonstrations | 3–5 | High |
| 3 BC | 5–7 | Medium-high |
| 4 RL fine-tune → iron | 7–11 | Medium |
| 5 Diamond | +1–2 months | Low-medium |
| 5 Dragon | open-ended | Low |

## References
- VPT (BC + RL fine-tune with KL): https://arxiv.org/abs/2206.11795
- STEVE-1 (goal-conditioned Minecraft policy): https://arxiv.org/abs/2306.00937
- DreamerV3: https://www.nature.com/articles/s41586-025-08744-2
- Mineflayer: https://github.com/PrismarineJS/mineflayer
- Mindcraft (LLM teacher option): https://github.com/mindcraft-bots/mindcraft
- CraftGround (faster real-Minecraft env if RL throughput becomes the bottleneck): https://github.com/yhs0602/CraftGround
