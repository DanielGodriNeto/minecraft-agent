# Improvement plan: more diamonds now, a general "get X" agent later

Inputs: `analysis/out/REPORT.md` (1,329 traced runs), `docs/BOT_BEHAVIOR.md`, `PLAN.md`, and three research passes (minecraft.wiki mechanics, community/speedrun strategy, AI-agent literature).
Tags: **[W]** = read on minecraft.wiki, **[C]** = computed by us from `runs.json`, **[E]** = researcher's estimate, **[U]** = unverified, check before building.
Research gap: Reddit, YouTube and speedrun.com were unreachable (403), so speedrun timelines and "what streamers do" are NOT covered. Do a manual pass on the Metacor speedrun guide (github.com/Metacor/Minecraft-Speedrun-Guide) before relying on any of the descent/opening ideas below.

---

## 1. TL;DR

1. **The surface, not the mine, is where runs are lost.** [C] 215 of the 221 runs that never got below y=-50 ended on the surface (152 stuck, 58 deaths), and 105 of the 138 runs that mined a diamond but never banked it ended on the surface too (49 stuck in `return_home`, 23 in `go_up`, 30 deaths). That is ~320 of 430 unbanked runs (74%). Underground is comparatively safe. Deaths: 674 of 1,011 happen right after `shelter` or `flee`, at a median y of 70-72.
2. **A binary "banked >= 1" metric is hiding wins.** Rejected switches repeatedly showed more diamonds with fewer banked (veinScan, watchdog, drownCap, recovery). Make the primary A/B metric diamonds banked per slot (paired, continuous). It has far more power than 48 coin-flips.
3. **Biggest unexplored levers** (none tested yet): spare pickaxe made *in place* at the iron level, diamond pickaxe from the 4th-6th diamond, water bucket, bed/spawn handling, a surface-trip fix (home chest near the shaft), and a free re-analysis of the jittered params already in the logs.
4. **For "tell it to get X and it figures it out":** build a recipe-driven goal planner from `minecraft-data` (symbolic, validated) with an LLM used only to parse the order into a goal, as Plancraft/GITM/Voyager suggest. Enchanting is a late-tier goal; the XP cost makes it a poor lever for 60-minute diamond runs.

---

## 2. What our data says (new cuts, [C])

| Finding | Number | So what |
|---|---|---|
| Never below y=-50 | 221 / 1329 (16.6%), 215 end on surface | The opening (wood/stone/iron) plus surface survival is a 1-in-6 loss. |
| Mined diamond, never banked | 138; 105 end on surface | The *trip home* is the weak point, not mining. |
| Last skill for those 138 | return_home 52, go_up 28, flee 17, explore 19, shelter 9 | Diagnose `return_home:explore:not_found` (49 runs) first: the bot is on the surface but cannot find home. |
| Banked diamonds per run | mean 6.4; 204 runs bank exactly 1; 199 bank 10+ | Heavy tail. Raising the floor (1 -> 3) matters as much as the tail. |
| Timeout runs that banked | 548 runs, mean 7.0 diamonds | Runs that survive to 60 min are where diamonds/hour come from. |
| Deaths and banking | banked 70% with a death vs 66% without | Deaths are not what limits banking; surface stalls are. |
| Time per skill, banked runs | explore 22.7 min, dig_down 11.2, go_up 6.6, shelter 5.9, mine 3.8 | Digging time is mostly tunnelling (`explore`) and descent, not `mine`. Mining speed upgrades act on `explore` + `dig_down`, ~34 of 60 min. |
| Branch depth | -53 vs -58: no difference (exp11) | Depth within -59..-53 is already fine. |

---

## 3. Research findings that matter

**Ore generation [W, minecraft.wiki/w/Diamond_Ore, /Tutorial:Mining]**
- Diamond spawns Y=16 to -63, peaks at -58/-59 (triangular, peak -64). Three of four generation batches discard 50-70% of ore blobs that touch air; the lava/water-exposed batch has 0% discard. **Most diamonds are buried**, so the "exposed + line of sight" rule only finds the minority. veinScan tried to fix this and failed on deaths, not on discovery.
- Lava fills all air at Y -63 to -55 [W], so -54 is the safe edge of the rich band. Wiki mentions 5-6 block spacing as most efficient per block; 3 is the "practical" choice [W/guides]. We use 2-4; **never analysed** (see 4.A1).
- 1.20.2 raised diamond amounts below Y=0 [W].

**Enchants [W: /Fortune, /Efficiency, /Unbreaking, /Mending, /Enchanting_mechanics, /Experience]**
- Fortune I/II/III on diamond ore: 1.33 / 1.75 / 2.2 diamonds per ore. Incompatible with Silk Touch.
- Efficiency I-V: +2/+5/+10/+17/+26 mining speed. Unbreaking I-III: tool lasts 2x/3x/4x.
- Mending cannot come from the table (treasure: villager, loot, fishing). Level 30 = 1,395 XP total; 15 bookshelves with one air gap each; iron pickaxe enchantability 14. Power ranges (Fortune III 33-83) mean level-30 slots cannot guarantee it.
- Table recipe is 4 obsidian + 2 diamonds + 1 book [common knowledge, wiki fetch failed, U]. Obsidian needs a diamond pickaxe.

**Tools and transit [W: /Pickaxe, /Breaking, /Ladder, /Bucket, /Fall_damage]**
- Pickaxe uses: iron 250, diamond 1,561. Mining speed 6 (iron) vs 8 (diamond). Deepslate diamond ore at hardness 4.5 takes about 1.15 s (iron) / 0.85 s (diamond) / 0.42 s (iron + Eff III) / 0.21 s (Eff V) [E, computed from the wiki formula].
- Bucket = 3 iron. Water landing negates fall damage. Water on lava source = obsidian.
- Ladder 7 sticks -> 3 ladders; ~3 blocks/s down, ~2.35 up [W/E]. A 70-block shaft would need ~70 ladders (~15 logs): too costly as the default, fine as a later "permanent shaft" upgrade.

**Players and speedrunners (thin, mostly guide-level) [W + secondary]**
- Safety kit: 2 water buckets, food, torches, blocks, never dig straight down. Speedrunners find iron via villages, ruined portals, buried treasure, and ravine lava pools; they barter for obsidian/pearls. Ancient debris: Y=16 in the Nether, bed mining, needs a diamond pickaxe [W/Wikipedia].
- Mineshaft chests: 7% iron pickaxe, 27% iron ingot, 8.9% diamond, 14% enchanted book [W/Mineshaft].
- NOT verified: minute marks for speedrun iron/diamond pickaxe, ranking of mining patterns, how speedrunners descend.

**AI agents [arXiv/GitHub, partly U]**
- Voyager (arxiv 2305.16291): skill library, auto-curriculum, self-verification on mineflayer; 15.3x faster tech-tree milestones. GITM (2305.17144): LLM goal decomposition + structured actions + text memory. Odyssey (2407.15325, mineflayer): 40 primitive + 183 compositional skills. Optimus-1 (2408.03615): knowledge graph + experience pool of successes AND failures + reflector.
- Plancraft (2412.21033): LLMs often lose to a hand-written planner on crafting and fail on unsolvable tasks. Pitfalls named: hallucinated recipes, loops, long-horizon drift. Fixes: validate against recipe data, retry caps + re-plan with the failure text, failure memory.
- No evidence found that a learned selector beats a good hand-coded planner at our data scale; BC on planner traces is capped at planner level, so gains need success-filtered data or outcome-reward RL. Our paired-slot methodology is sound.

---

## 4. Ideas to add (tiered)

Every behaviour change goes behind a switch and a paired A/B, one change per experiment (existing rule).

### Tier A: zero-cost analysis and quick wins (do first, no new server hours for A1-A2)

- **A1. Re-analyse jittered params already in the logs.** `spacing`, `tunnelLength`, `returnAt`, `branchY`, `woodStock`, `fleeHealth` are seeded from the slot id, so every one of the 2,391 eval rows already has them. Regress diamonds-per-minute-underground on `spacing` and `tunnelLength`. The wiki hints 3-6 spacing; we only sampled 2-4. If the trend points up, run `ARMS="spacing=3;spacing=5"`.
- **A2. Switch the primary metric** to paired diamonds banked per slot (Wilcoxon / paired bootstrap), keep banked% as secondary. Re-score the rejected experiments (veinScan, watchdog=1, drownCap, recovery, stationAbove): some may flip. Stack `recovery=1` (weak positive, +17/-12 slots) with `hazardGrace` (adopted) as the new baseline candidate.
- **A3. Diagnose `return_home:explore:not_found` (49 runs) and `go_up:not_reached` (72).** Timelines for 25 cases exist in `analysis/out/timelines/`. Hypotheses to check: breadcrumb trail is lost after a relocation hop or death; the bot surfaces 50-100 m from home inside a forest/hill and the pathfinder has no route; water/lava on the surface walk. Output: one named root cause, not a symptom guard.
- **A4. Home near the shaft.** Cheapest structural fix for banking: when the first dig-down starts (`dig_down` after the iron pickaxe), place a second chest (8 planks) at the shaft mouth and use it as `home` for banking (the `adoptChest` code already exists, S:1137-1215). Needs your decision on the metric (section 7): diamonds in *any* bot-placed chest counts. Removes the surface walk that kills ~8% of runs.

### Tier B: fix the funnel (current score)

- **B1. Spare pickaxe in place.** pickReady failed because it climbs back to y16 (extra transit). Instead, when the *first* iron pickaxe is made at y16, keep mining the same vein until 6+ iron (spare pick = 3, optionally bucket = 3 more), smelt in the same session, craft the spare before leaving. Marginal cost 1-3 min, zero extra transit. Evidence: 98/246 successful runs ended with no pickaxe; iron pickaxe is only 250 uses [W]. Switch name `spareInPlace`.
- **B2. Diamond pickaxe from diamonds #4-#6 (after the first bank).** 3 diamonds + 2 sticks. 1,561 uses [W] ends the pickaxe-loss class of failure and is ~25% faster. Rule: only when `deposited >= 1` and >= 25 minutes left, and a table is at home (craft at home, so no transit). Net cost is 3 diamonds against a banked mean of 6.4; the A/B decides if it pays.
- **B3. Water bucket** (3 iron, ties into B1). Uses: (a) `water-bucket-clutch` safety on falls, (b) extinguish/neutralise lava exposure at depth, (c) later obsidian (Tier C). Do not use for descent in v1 (the bot never digs straight down by design).
- **B4. Sleep/spawn point.** Bed = 3 wool + 3 planks; wool from sheep (shears optional, sword fine). Sleeping skips the night (night shelter is 5.9 min of banked-run time, and shelter/flee precede 66% of deaths) and sets spawn, which removes the `lost` ending. Only worth it when a sheep is within ~24 blocks; optional step with a 2-failure budget, same pattern as sword/spare.
- **B5. Surface-night policy.** Deaths cluster on the surface at night. Alternative to bed: when night is within 2 minutes, finish the descent shaft immediately (the bot already does a night shaft), and avoid surface work after dusk. Check what the 356 `shelter` pre-death cases look like (are they stuck at y~72 because `not_sealed`?).
- **B6. Armor and shield.** Death costs the whole inventory. Iron is already being mined at y16: a shield (1 iron + 6 planks) and iron helmet/boots (5/4 ingots) are cheap *if* B1 already collects 6+ iron. Evaluate as an extension of B1 (more iron at y16), not a separate trip. Low-medium gain, [E].
- **B7. Hunt before descent.** Food only comes from the surface; a death at depth from hunger is rare today, so keep as is.

### Tier C: more diamonds per hour (needs B done, or runs on a long-run track)

- **C1. Efficiency/Unbreaking via the table, no bookshelves.** With zero bookshelves levels are small, so Efficiency I / Unbreaking I at best. It needs a table (4 obsidian: diamond pickaxe + water + lava) + 2 diamonds + book + lapis. [U] Cost is high for a modest gain; defer.
- **C2. Fortune III is ~2.2x diamonds per ore [W]** but needs level ~30 (1,395 XP) and 15 shelves (15 x (6 planks + 3 books), books = 3 paper + leather each). Realistic routes for a bot: (a) librarian villager trade (emeralds, needs a village and a trade loop), (b) mineshaft/chest loot (14% books), (c) fishing. All are long-horizon. Treat Fortune as a **product feature** ("get me an enchanted pickaxe"), not a 60-minute-run lever.
- **C3. Pattern A/B using wiki-backed levels:** spacing 3 vs 5/6 (see A1); tunnel at y=-58 vs -57 to avoid lava band (-55 and above is lava-free; we are at -56..-59 where lava lakes exist).
- **C4. Vein follow, not scan.** veinScan (distant buried ore) was rejected. A *local* rule is different and cheap: after mining a diamond, dig the 3x3x3 neighbourhood around it (blobs are 1-10 ores [W]) before leaving. No pathing, low hazard. Switch name `veinFollow`.
- **C5. Mining safety at depth:** carry 2+ water buckets and 16+ cobble (already carries), light tunnels with torches only if mob damage shows up underground; today it is rare.

### Tier D: general goal agent ("get X")

Order matters; each step reuses existing skills.
1. **Goal = item + count** (already `{item, count}`) -> **dependency planner from `minecraft-data`**: recursive expansion over recipes, required tool tier (`harvestTools`), stations (table/furnace), fuel, with quantities. Validate every step against recipe data (stops hallucinated recipes). The existing `obtain(item)` recursion is the seed.
2. **Block/skill catalogue per goal type:** gather (ore/log/stone/sand/gravel), craft, smelt, hunt/farm, build (shelter, chest), travel (surface walk), enchant/anvil/trade (mineflayer has APIs, [U] verify).
3. **LLM only as a parser:** natural language -> structured goal JSON (`{item, count, constraints}`), validated by the planner, rejected if it names an unknown item. No LLM in the loop for execution (Plancraft: symbolic beats LLM on crafting).
4. **Failure memory + re-plan:** every failure is `{skill, reason, state}`; planner re-plans with a banned-action list and retry caps (the planner memory already does this for 8 patterns; generalise it into a typed store). Optimus-1 and Voyager both show this helps.
5. **Goal ladder to ship in order:** iron tools -> diamond pickaxe -> shield + armor -> bucket + obsidian -> enchanting table -> book/librarian route -> Nether portal -> ancient debris (Y=16, needs a diamond pickaxe, ~bed mining, big risk).
6. **Resource goals beyond diamonds:** coal/iron/gold/redstone/lapis use the same `gather(block)` with a per-ore y band; add a table `ORE_BANDS` (e.g. iron 16, coal 46, lapis 0, redstone -59) driven by the measured distributions already in `BOT_BEHAVIOR.md` section 6.

### Tier E: ML (unchanged order, one correction)

Keep BC -> PPO, but (1) log **success-filtered** traces only (runs that banked 3+ diamonds with 0-1 deaths) so cloning is not capped at the planner's mean; (2) keep the `traceLog` fields as the observation schema now; (3) hold the planner as the fallback. A learned selector is realistically worth it only for the 4 decisions in PLAN.md (return timing, flee vs mine, abandon a tunnel, spare/restock). Do not expect it to beat the planner on the surface-stall class; that is a skills/robustness problem.

---

## 5. Order of work and expected gain

Rough expected gains are [E] on banked% unless stated, assuming the proposed fix removes about half of its target class.

| # | Item | Targets | Effort | Expected |
|---|---|---|---|---|
| 1 | A1 params analysis, A2 metric + rescore | all | hours, no servers | may reveal free +diamonds; better A/B power |
| 2 | A3 root-cause trace | 105 surface-unbanked | 1 day | defines B/A4 |
| 3 | A4 shaft chest | 8% of runs | 1-2 days | +3-5 pts |
| 4 | B1 spare in place, then B2 diamond pickaxe | 98/246 pickless | 2-3 days | +diamonds/run, fewer late stalls |
| 5 | C4 vein follow | per-vein yield | 1 day | +10-20% diamonds/run [E] |
| 6 | B4 bed, B5 night policy | surface deaths 674 of 1,011 | 2 days | fewer deaths, no `lost` |
| 7 | Opening robustness (stage 0-4: 218 runs, 16%) | no-wood, no-iron | trace-first | +4-8 pts [E] |
| 8 | Tier D planner generalisation | product goal | 1-2 weeks | needed for "get X" |
| 9 | C1/C2 enchanting | product feature | weeks | defer |

Power note: previous experiments said 24 runs detect ~25 pts. Use 48+ pairs and the continuous metric; expected effects above are 3-10 pts, so also pool `recovery` and `hazardGrace` and run longer arms (96 pairs) for the final stack.

---

## 6. Risks and what I could not verify

- Enchanting numbers are partly from summarised pages (librarian prices, Fortune III range). Re-check on minecraft.wiki before building.
- Break-time and Efficiency numbers are computed, not read from a table.
- Sparse speedrun evidence: all opening-time and descent technique claims are unverified. Do not use "speedrunners do X" as justification until Metacor's guide or run videos are checked.
- Results hold for this world seed and `easy`. Hard difficulty changes mob rates and starvation; re-run the gate before shipping to a real server.
- Everything is estimated from a mixed-arm trace set; use section 9 of the report for arm differences.

## 7. Decisions needed from you

1. **Metric:** accept diamonds-in-any-bot-placed-chest (enables A4)? Keeping "spawn chest only" keeps the score comparable with the 71% gate but leaves the surface-trip losses in place.
2. **Product scope:** is "enchanted pickaxe / Fortune" a roadmap goal (Tier D+C2) or only a nice-to-have? Changes how soon Tier D starts.
3. **Difficulty:** shipping target easy or normal? Armor/bed ranks go up on normal.
