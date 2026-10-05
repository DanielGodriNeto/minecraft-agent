# Improvement plan v2: a bot that invests in itself first (long-run), Fortune as the headline

Supersedes v1. Inputs: `analysis/out/REPORT.md` (1,329 traced runs), `docs/BOT_BEHAVIOR.md`, `PLAN.md`, four research passes (wiki mechanics, community strategy, AI-agent literature, Fortune/enchanting routes + mineflayer feasibility) and one independent critic pass whose fixes are folded in.
Tags: **[W]** read on minecraft.wiki, **[C]** computed by us from the traces, **[S]** simulated by us (`/tmp/ench.js`, 200k rolls per cell, reproduces the researcher's hand numbers), **[E]** estimate, **[U]** unverified.
Gap: Reddit, YouTube and speedrun.com were blocked (403), so speedrun timings are not covered. Read the Metacor speedrun guide before borrowing any opening/descent trick.

---

## 1. The new objective

Old objective: bank >= 1 diamond in 60 minutes. That rewards diving with a wooden-stone-iron kit and dying.
New objective (owner): **long-run payoff.** Given "get diamonds", the bot first builds capability, then mines, and values capability alongside diamonds:

```
value = banked diamonds + lambda(horizon) * gearScore
```

`gearScore` (pre-registered, fixed before any test): armor points worn (0-20), best pickaxe tier + Fortune/Unbreaking/Efficiency levels, spare pickaxe held, water bucket, shield, food stock, bed/spawn set, gear locker stocked. `lambda` falls as time left shrinks, so a bot with 3 hours invests a lot and a bot with 10 minutes just banks. This replaces "score = diamonds only".

Consequences that change the plan:
1. 60-minute runs can no longer judge investment payoff (see section 5).
2. Death must stop being terminal and must stop wiping the investment (see 4.1, 4.2).
3. Fortune is not a single feature: it is a supply chain (5 diamonds, obsidian, lapis, XP, bookshelves, leather, sugar cane).

---

## 2. What the data says (recut after the critic's checks)

| Finding | Number | Note |
|---|---|---|
| Deaths | 1,011 over 1,329 runs; 51.5% of runs had one | Deaths are a major gear sink. Strong case for investing *and* protecting. |
| **Where deaths actually happen [C, corrected]** | surface (y>60) 339 (34%), y 0-60 312 (31%), y -40..0 158 (16%), deep 202 (20%) | v1 said "surface y~70". WRONG: the trace logs the respawn position on the death entry (`analysis/build.js:33`). Using the previous entry, deaths are spread across all depths. Top pre-death skills: `flee@surface` 179, `shelter@y0-60` 114, `shelter@surface` 99, `go_up@deep` 94, `shelter@deep` 74. |
| Unbanked with a diamond | 138; 77 ended `stuck` (return_home 49, go_up 23, explore 5), 17+ deaths | The stuck endings are valid "stuck on the way home" evidence; death-ended runs' endY is a respawn point, so ignore their surface counts. |
| Never below y=-50 | 218 by stage table (221 by `minY`; definitions differ), 152 of them `stuck` | Opening/iron failure is a 1-in-6 loss. |
| Banked diamonds per run | mean 6.4; 204 bank exactly 1; 199 bank 10+ | Heavy tail, so diamonds/run is noisy. |
| Time per skill (banked runs) | explore 22.7 min, dig_down 11.2, go_up 6.6, shelter 5.9, mine 3.8 | Digging is mostly tunnelling and descent: Efficiency helps those, not `mine`. |
| Stuck endings | 38% of runs | Incompatible with hours-long runs unless stuck is recoverable. |
| Arm table in REPORT.md section 9 | veinScan "mean held 9.79" | Likely an instrumentation outlier; mixed arms are not an A/B. Do not quote it. |

---

## 3. Research findings that drive the design

**Fortune on a pickaxe (the numbers that matter) [W + S]**
- Per table roll, iron pickaxe (enchantability 14): Fortune III only appears from a **level-30 slot**: 7.8% per roll. Any Fortune at L30: 23.4% (I 12.3%, II 3.3%, III 7.8%). At L24: Fortune II about 10.5%, III 0.3%. At L15-20: Fortune I about 11% (II 6.4% at L20). Diamond pickaxe (ench. 10): L30 III 6.4%.
- Slot levels need bookshelves: base = 1 + rand(0..7) + floor(B/2) + rand(0..B); bottom slot = max(base, 2B). **B=15 -> bottom slot 30 always; B>=12 -> >=24; B>=8 -> >=16.** [W]
- Rerolling is cheap: previews are free; the seed changes only after you enchant something. Cost per attempt = 3 levels + 3 lapis for the bottom slot, so the one big cost is *having* level 30 (1,395 XP) once; each attempt then spends about 3 levels. Mineflayer exposes `enchantments[i].level`, `.xpseed` but the preview shows only the level, not which enchant [U: some wiki claim a one-enchant clue].
- Expected attempts for Fortune III at L30: about 13 on iron [S]; but each *failed* attempt still applies a random enchant to the pickaxe, which is why the researcher suggests rerolling with junk items first. A pickaxe can hold only one roll's result; **enchanting is a one-shot per item**, so rerolls are paid on junk (wooden shovel in slot, L1 slot) to burn the seed, and the real pickaxe is enchanted only when the preview matches. [U: preview content] -> needs a live test before anything is built.
- Payoff: Fortune III averages 2.2 diamonds per ore [W]. At about 0.2 diamonds per underground minute [E from our 5.8k banked diamonds over run-hours], the added +0.24/min repays a 60-minute investment in ~50 digging minutes. Fortune I (1.33x) would need ~170. So **build to Fortune II/III or do not bother.**
- Villager route: Fortune III trade is ~0.85% per lectern roll (~117 rerolls), emerald cost 11-45; easy difficulty has 0% zombie-villager cure discount; two-input trades hit mineflayer bug #3209; no legal way to find villages. Difficulty 5. **Not in v2 scope.**
- Loot/fishing: ~0 chance of Fortune III. Skip.

**The Fortune supply chain [W]**
`iron kit -> 5 diamonds (diamond pickaxe 3 + table 2) -> bucket + water + lava -> 4 obsidian -> book (3 sugar cane -> paper, + leather) -> ~35 lapis -> bookshelves (6 planks + 3 books each; 15 shelves = 45 leather, 135 cane, 90 planks) -> 1,395 XP -> reroll junk, enchant on a match`.
- XP: mining coal/lapis/redstone/diamond gives 0-7 each; smelting 0.15-1; mobs 5 each; spawners 15-43; fishing 1-6. Mining alone gets to about level 15. Level 30 needs a grinder/spawner or hours of fishing. **XP is the real bottleneck, not obsidian.**
- Leather + cane are the next: 45 leather means a cow pen (wheat, breeding), 135 cane means a plantation next to water.
- Staged fallback: B=8 (24 books) gives >=16 slots (Fortune I about 11%/roll); B=12 gives >=24 (Fortune II about 10%/roll).

**Mineflayer feasibility** (difficulty 1-5; all [U] until a live test)
Armor/shield equip 1 (`bot.equip`), recipes already solved, auto-eat 1, durability 2, bed `bot.sleep` 2, furnace cooking 2, XP read `bot.experience` 2, enchant table 3 (`openEnchantmentTable`, `.enchant`), anvil 3 (`openAnvil`, no XP-cost accessor), farming/breeding 3, villager 4-5. Pitfall: on 1.20.5+ `item.enchants` returns raw component data (prismarine-item PR #190 still open), so **write our own `componentMap` reader first**; `bot.digTime` may ignore Efficiency because of it.

**Other facts kept from v1 [W]**
Diamond y16..-63, peak -58/-59; 50-70% of blobs touching air are discarded in 3 of 4 batches (most diamonds are buried); lava fills y -63..-55 so -54 is the safe edge; iron pickaxe 250 uses vs diamond 1,561; iron 6 / diamond 8 mining speed; Efficiency adds +2..+26 speed; Unbreaking II/III 3x/4x durability; Mending needs a villager/loot (not the table).

**Agents [arXiv/GitHub]** Voyager, GITM, Odyssey, Optimus-1 all use a skill library + dependency planning + failure memory; Plancraft shows LLMs often lose to a symbolic planner on crafting. No prior art found for a *readiness gate* on depth, so that is our own design. A learned selector has no evidence of beating a good scripted planner at this data scale.

---

## 4. The plan

Every behaviour change stays behind a switch/param and a paired A/B (existing rule). New switches: `INVEST`, `LONGRUN`.

### 4.1 Architecture (do this before any new skill)

- **`capabilityStep(state)`**: one pure function, placed in `nextAction` between food/rest and the tech tree, driven by a data table `GEAR_LADDER = [{id, have(state), want, needs, minMsLeft, riskNote}]`, not an if-chain. Each tier says what it needs (e.g. `shield` needs 1 iron + 6 planks) and when it is worth buying (`minMsLeft`).
- **`horizonMs`** param, default `msLeft`, so v1 behaviour is unchanged. With `INVEST=0` the step returns `null`.
- **Readiness gate on depth:** `descend` below y 0 is allowed only when `readiness(state) >= threshold(horizon)` (armor points, food stock, spare pickaxe, bucket). Failing the gate sends the bot to the next ladder tier instead. The thresholds are params, so they can be jittered for data and tuned.
- **`LONGRUN` mode:** `maxDeaths` and the `stuck` ending are not terminal. After death the bot respawns at home and re-gears from the **gear locker**; after a stuck signature it runs a recovery routine and keeps trying (cap on consecutive recoveries instead of an immediate end). Without this a 3-hour run is impossible: 38% of today's runs end `stuck`.
- **Gear locker chest at home** holding a spare kit (iron pickaxe, armor pieces, shield, food, torches/bucket if any). Because respawn is at home this turns "lose everything" into "walk to the chest". Also fixes the `lost` ending when combined with a bed/spawn point.
- **Gear-score potential** `Phi(state)` is the later RL shaping signal; prerequisites are action masks (no `craft shield` without iron + planks).

### 4.2 Capability ladder (order by value per iron/diamond, per critic)

| Tier | Item | Cost | Why this order |
|---|---|---|---|
| T1 | iron chestplate, then leggings | 8 + 7 iron | 0.75 / 0.71 armor points per ingot, the best value [W/E] |
| T1 | spare iron pickaxe (**in place**: mine 6+ iron at the first y16 visit) | 3 iron | 98 of 246 successful runs ended with no pickaxe; no extra transit |
| T1 | shield + raise logic | 1 iron + 6 planks | useless without raise/block logic; keep small |
| T1 | water bucket | 3 iron | lava escape, fall safety, later obsidian |
| T1 | bed (3 wool + 3 planks) at base | sheep + wood | sets spawn, skips night, kills the `lost` ending |
| T1 | cooked food stock | furnace time | auto-eat + stock; hours-long runs starve otherwise |
| T2 | helmet, boots | 5 + 4 iron | worst value per ingot, so last |
| T2 | **bulk smelting** (queue 6-8 ingots, several fuel units) | - | a full kit is about 31 iron [E]; one ingot per call is too slow |
| T3 | diamond pickaxe after **>=5 diamonds, 2 reserved for the table** | 3 diamonds | 1,561 uses, speed 8; only after a first bank |
| T3 | diamond armor/sword | 24 + 2 diamonds | only if Fortune plan allows (diamonds are the Fortune currency first) |
| T4 | obsidian (4), table, lapis (about 35), XP, books, bookshelves | see section 3 | the Fortune supply chain |

### 4.3 The Fortune vertical slice (minimum viable path, with exit tests)

0. **Live probes first (1 day, no behaviour):** (a) print `componentMap` for an enchanted pickaxe; (b) open an enchanting table and log what a preview exposes; (c) confirm enchanting a junk item burns the seed and that previews are stable. If (b)/(c) fail the table plan changes.
1. T1 kit done + base built (bed, chest, table, furnace, locker).
2. First 5+ diamonds banked; diamond pickaxe; table recipe.
3. 4 obsidian: bucket (3 iron), water + lava source at depth, mine with the diamond pickaxe.
4. Lapis: mine at y 0 (peak) / deepslate band; need about 35. Fortune applies to lapis too once enchanted.
5. **Homestead (the big one):** cow pen (wheat -> breed) for leather and food, sugar cane near water, then 8 shelves -> 12 -> 15. Enchant at B=8 or 12 only when the preview shows Fortune >= I/II (fallback), push to 15 for III.
6. XP: coal/lapis/diamond mining first, smelting second; level 30 needs a grinder. **Decision gate:** if XP to 24-30 cannot be reached in the budget, stop at Fortune II (L24 about 10%/roll).
7. Reroll on junk until the preview shows Fortune III (about 13 attempts at about 15-25 XP each), then enchant the diamond pickaxe (durable) or an iron pickaxe (about 1.4 pts better odds but 250 uses).
8. **Protect it:** with a Fortune pickaxe equipped, raise `fleeHealth`, retreat earlier, keep armor on, and keep a second pickaxe in the locker. Death drops the pickaxe (no keepInventory); optional: recover drops within 5 minutes if the death point is safe.

### 4.4 Carry-over ideas from v1 (still worth a try)

- **Re-analyse jittered params** (`spacing` 2-4, `tunnelLength`, `returnAt`, `branchY`) already in `logs/eval.jsonl`; wiki hints 3-6 spacing. Zero server cost, exploratory only.
- **veinFollow:** after mining a diamond, dig the 3x3x3 around it (blobs are 1-10 ores). Local, low hazard (veinScan's distant detours were the problem).
- **Root-cause trace of `go_up:not_reached` (72) and `return_home:explore:not_found` (49)** using `analysis/out/timelines/`.
- **Base-first descent:** shaft mouth at or near the base chest so return trips are short and the trail stays intact. Only with a bed set (otherwise the `lost` rule fires); changes the gate metric, so treat as a separate experiment.
- Drop from v1: Nether, trial chambers, villager trading (too costly for the first cut), B7 hunting changes.

### 4.5 General "get X" agent (later, uses the same ladder)

1. Recipe dependency planner from `minecraft-data` (recursive over recipes, tool tier `harvestTools`, stations, fuel). The existing `obtain(item)` is the seed. Validate every step against recipe data.
2. LLM only parses the order into `{item, count, constraints}`, validated by the planner; no LLM in the execution loop (Plancraft).
3. Typed failure memory + retry caps + re-plan with a banned-action list (generalises the 8 memory fields in `planner.js`).
4. Per-ore bands (`ORE_BANDS`): iron 16, coal 46, lapis 0, redstone -59, diamond -58.

### 4.6 ML phase (unchanged order, corrected inputs)

BC -> PPO stays. Corrections: log **success-filtered** traces (long runs that bank >= N diamonds with <= 1 death); keep `traceLog` as the observation schema; `Phi(state)` as potential-based shaping; masks from the ladder prerequisites; the scripted planner stays the fallback. Expect a learned selector to help the timing decisions (when to bank, when to retreat, when to invest), not the stuck/hazard class.

---

## 5. Evaluation (replaces "banked >= 1 in 60 min")

- **Investment cost runs (60 min):** measure time to each tier, acquisition success, deaths while investing, and the non-inferiority of banked% against the baseline (T1 kit done by minute 25 in >= 70% of runs; banked% within 5 points).
- **Payoff runs (180 min, non-terminal death/stuck):** primary metric = diamonds banked in minutes 60-180; secondaries = survival, gear score at 15-minute marks, deaths, stuck recoveries.
- **Stats:** paired by slot, pre-registered metric, interleave arms on the same server (the memory-guard losses showed load confounding). At about 68% base rate, 48 pairs have an 80%-power minimum detectable effect near 24 points, 96 pairs near 17. **Expected single-switch effects of 3-10 points are undetectable**, so judge tiers by their measured acquisition success and cost, and only A/B the *bundle* against baseline (diamonds/min 60-180). Rescoring the rejected v1 switches is exploratory only; any flip must be confirmed on fresh slots.
- **Stop rule:** if a tier's acquisition success is below 40%, stop and fix it before building the next tier.
- **Budget** [E, from the critic, 12 bots/server, 3 instances]: P0 about 6 server-hours, P1 about 12, P2 about 9 + 18 for long runs, P3 about 20; hard cap 3 evaluation sets (about 54 server-hours) until a tier passes its exit.

## 6. Roadmap with exit criteria

| Phase | Work | Exit |
|---|---|---|
| P0 | recut deaths done (this doc); reconcile 218 vs 221; pre-register metrics; diagnose `go_up:not_reached`/`return_home`; add `LONGRUN`; live probes for enchant APIs | stuck+lost <= 20% on 48 slots; probes answered |
| P1 | `GEAR_LADDER` + `capabilityStep`; bulk smelt; T1 items (chestplate, leggings, spare pickaxe in place, shield, bucket, bed, food); gear locker; readiness gate | kit by minute 25 in >= 70%, banked% non-inferior |
| P2 | T2/T3: helmet/boots, diamond pickaxe with 2 diamonds reserved, durability + spare logic, food economy; 180-min payoff runs | payoff win in minutes 60-180 vs baseline |
| P3 | Fortune supply chain: obsidian, lapis, homestead, XP, shelves, junk-reroll, enchant | a Fortune II/III pickaxe in >= 40% of 180-min runs; if XP/leather blocks, stop at Fortune II |
| P4 | general planner + LLM goal parser; then ML | a new goal type works without new code |

## 7. Risks and unverified items

- Enchant preview content, junk-reroll mechanics and seed reset on rejoin are [U]; P0 probes decide the table route.
- Anvil recipe/XP-cost accessor [U]. Leather/cow rates and spawner-time estimates [E].
- Fortune probabilities are simulated by us with the wiki's algorithm; they match the researcher's hand numbers; still validate against a live table.
- Armor kit size (about 31 iron) and the budget are estimates; bulk smelting and wood/planks for shelves (90) add real time.
- Results hold for this seed and `easy`. Normal/hard raises armor/bed value; re-run the gate before using it on a real server.
- Scope creep guard: no Nether, trial chambers or villager trading until P3 exits.

## 7b. Corrections after the independent reviews (v3, supersedes conflicting text above)

Four fresh-context agents (strategy, data audit, LONGRUN code review, enchanting fact-check) audited v2. What changed:

1. **Order of work is now: measure payoff before building acquisition.** The cheapest way to learn whether an investment pays is to *gift* it: arms start with `/give`n gear (iron armor set; spare pickaxes; Fortune II / Efficiency diamond pickaxe; combinations) under LONGRUN on the same slots, and we compare diamonds/hour, deaths and survival. That gives an upper bound per tier before any crafting/enchanting code exists. Build only the tiers whose gifted version pays. (Previous "invest" switches were all judged on the 60-minute banked>=1 metric, so investing first is *untested*, not disproven; spareAlways never ran because it required the rejected pickReady.)
2. **Primary metric = net diamonds banked over [0,T] plus the cumulative curve from `deposits[]`**, minus diamonds spent on gear. `diamondsBanked60to` ignores the baseline's first hour and favours an investing arm; it is secondary only. Statistics: paired rank/log, arms interleaved on the same servers; non-inferiority on time-to-first-bank with a >=10-point margin (the 5-point margin is not testable at 48 pairs; MDE about 24 points).
3. **Arms:** A = LONGRUN only, B = A + cheap kit, C = B + diamond pickaxe. Fortune payoff is measured with a gifted arm, not by waiting for the chain.
4. **Fortune II and XP were inconsistent.** Fortune II needs a slot level >= ~20-24 (6.4% / 10.5% per roll on an iron pickaxe [S]), i.e. roughly 550-828 total XP [U: formula from memory]; mining alone is about level 15. So "never farm XP" cannot reach Fortune II. Resolution for the owner: allow a bounded XP routine (kill hostile mobs at dusk/underground with sword + armor, smelting, ore XP) capped in time, aiming at level 24; Fortune III stays opportunistic only. The mineflayer docs show `enchantments[i].expected = {enchant, level}`, so the bot CAN see the clue before paying; still gate the table route on a live probe, and prefer rolling on a **book** first (reversible) over rolling the pickaxe directly (a bad roll is permanent).
5. **Corrections to numbers:** traced-run stats describe a non-random later subset (untraced runs in the same window bank 3.1%), so 67.6% is not the overall success rate; trace deaths undercount eval deaths (1,023 vs 1,270); 221 (not 218) runs never reached y<=-50; unbanked-with-diamond last skills are return_home 52, go_up 33, flee 17, explore 17, shelter 9. Kit iron cost: chestplate 8 + leggings 7 + pickaxe 3 = 18 for the core, about 34 for the full set + spare + bucket + shield (my earlier "31" was wrong).
6. **Ladder changes:** bulk smelting moves to P1 (T1 needs it; BOT_BEHAVIOR 3.4 smelts one ingot per call); the readiness gate gets a hard time-box (8 min, like `SPARE_BUDGET_MS`), then the bot dives with what it has and the gate-timeout rate is logged (pickReady lost 5 pairs to 1 on mid-run climbs); the gear locker holds only a spare pickaxe, food and surplus ingots (armor stays worn), and nothing crafts a chest at HEAD so the chest recipe comes with it; the diamond pickaxe is bought at **3** diamonds (gate mean is 4.2 diamonds/run), table diamonds are reserved only once the Fortune chain is unblocked; `gearScore` is a mediator only, never an outcome (Goodhart).
7. **LONGRUN fixes in progress** (code review): escape movement counted as progress so `stuck` was unreachable on the surface; escalation could run on a dead bot; incomplete loop-memory reset; progress signature mismatch; unlimited deaths; deposit clock mismatch. Fixed in a follow-up commit.
8. **Zero-cost measurements first:** death damage causes (skill logs keep the last 10), iron ingots per minute at y16, time from stone pickaxe to full iron kit.

Revised order: LONGRUN fixes -> zero-cost measurements -> gift ablation under LONGRUN -> build the tiers that pay (time-boxed) -> enchant probes -> Fortune II chain with bounded XP -> general planner.

## 8. Decisions (owner, 2026-10-05)

1. `LONGRUN` (death/stuck non-terminal) is adopted as a separate evaluation mode; the 60-minute gate stays for regression. First build: switch `LONGRUN=1`, off by default.
2. **Fortune II is the target.** Stop rule stays: no level-30 grind just to reach III. But if the bot accumulates enough XP on its own (level >= 30 with spare lapis), it keeps rerolling for Fortune III on a junk item and upgrades (II -> III by anvil with a Fortune II book, or a fresh enchant) opportunistically; the XP is never farmed for it.
3. Difficulty: easy.
4. **Bounded mob-XP routine allowed** (owner, 2026-10-05): the bot may hunt hostile mobs (with sword + armor, at dusk/underground, never at low health) plus smelting/ore XP to reach level ~24 for Fortune II. Time-capped (budget per life, logged), Fortune III stays opportunistic and is not farmed for.
