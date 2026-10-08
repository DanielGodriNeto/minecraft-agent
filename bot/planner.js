// Fixed-plan planner (Phase 2.2): pure function from observed state to the next skill call.
// Phase 3 swaps this for the learned policy, so it sees only what the policy will see.
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']
const GROUPS = {
  log: WOODS.map(w => `${w}_log`),
  planks: WOODS.map(w => `${w}_planks`),
  stone: ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  fuel: ['coal', 'charcoal', ...WOODS.map(w => `${w}_planks`), ...WOODS.map(w => `${w}_log`)],
}
const RECIPES = {
  planks: { out: 4, in: { log: 1 } },
  stick: { out: 4, in: { planks: 2 } },
  crafting_table: { out: 1, in: { planks: 4 } },
  wooden_pickaxe: { out: 1, in: { planks: 3, stick: 2 }, table: true },
  stone_pickaxe: { out: 1, in: { stone: 3, stick: 2 }, table: true },
  stone_sword: { out: 1, in: { stone: 2, stick: 1 }, table: true },
  iron_pickaxe: { out: 1, in: { iron_ingot: 3, stick: 2 }, table: true },
  furnace: { out: 1, in: { stone: 8 }, table: true },
  chest: { out: 1, in: { planks: 8 }, table: true },
}
// Where raw materials come from: blocks to mine, and how to find them when none is visible.
const SOURCES = {
  log: { blocks: GROUPS.log, find: 'surface', maxAbove: 3 }, // only logs reachable from the ground
  stone: { blocks: ['stone', 'deepslate'], find: 'dig' },
  raw_iron: { blocks: ['iron_ore', 'deepslate_iron_ore'], find: 'branch', y: 16 },
  diamond: { blocks: ['diamond_ore', 'deepslate_diamond_ore'], find: 'branch' },
}
const DIRS = 4
const SURFACE_BLOCKS = 64
const SURFACE_GROWTH = 32
const SURFACE_CAP = 192

const on = (name) => process.env[name] !== '0'
const DEFAULT_PARAMS = { branchY: -58, spacing: 3, tunnelLength: 32, returnAt: 5, woodStock: 9, fleeHealth: 14, shaft: on('SHAFT'), nightSurf: on('NIGHTSURF'), foodGate: on('FOODGATE'), fightGuard: on('FIGHTGUARD'), reserve: on('RESERVE'), crowdFlee: on('CROWDFLEE'), nightAscent: on('NIGHTASCENT'), branchRelocate: on('BRANCHRELOCATE'), goUpLoop: on('GOUPLOOP'), localSurface: process.env.LOCALSURFACE === '1', pickFirst: process.env.PICKFIRST === '1', stationAbove: process.env.STATIONABOVE === '1', drownCap: process.env.DROWNCAP === '1', hazardGrace: on('HAZARDGRACE'), watchdog: Number(process.env.WATCHDOG) || 0, recovery: process.env.RECOVERY === '1', traceLog: process.env.TRACELOG === '1', earlyBank: process.env.EARLYBANK === '1', spawnEscape: process.env.SPAWNESCAPE === '1', veinScan: process.env.VEINSCAN === '1', spawnWalk: process.env.SPAWNWALK === '1', pickReady: process.env.PICKREADY === '1', spareAlways: process.env.SPAREALWAYS === '1', earlySeal: process.env.EARLYSEAL === '1', sparePick: process.env.SPAREPICK === '1', ...(process.env.LONGRUN === '1' && { longrun: true }), ...(process.env.TELEMETRY === '1' && { telemetry: true }) }
// A/B switches: env var (=0 turns off) | param key (also the ARM=key=0 name; eval.js records env by the env var name) | effect.
//   SHAFT      shaft       dig_down as a 1x1 shaft (off = stairs only)
//   NIGHTSURF  nightSurf   the iron pickaxe does not exempt the bot from digging in / sheltering at night
//   FOODGATE   foodGate    no descent without food, rest when hurt and hungry
//   FIGHTGUARD fightGuard  fight health guard (skills.js)
//   RESERVE    reserve     reserve kit restock before a descent
//   CROWDFLEE  crowdFlee   two or more hostiles in reach and too few blocks to seal in: flee instead of fight
//   NIGHTASCENT    nightAscent    a deep bot with a diamond keeps mining while its predicted surface arrival is in the dark
//   BRANCHRELOCATE branchRelocate after many empty branch legs at depth, hop 40 blocks sideways to fresh ground
//   GOUPLOOP   goUpLoop    go_up loops trail/path/pillar rounds with a no-progress watchdog and a 360 s cap for climbs over 60 blocks
//   PICKFIRST  pickFirst (OFF by default; =1 enables) a bot with no pickaxe obtains/crafts one before any home trip, since go_up and dig need it
//   STATIONABOVE stationAbove (OFF by default; =1 enables) craft's placeSpot also tries the cell above the head and the one below the feet, so a table fits in a shaft or 1-wide tunnel without a pickaxe dig (craft:no_tool endings)
//   DROWNCAP   drownCap (OFF by default; =1 enables) after 2 drownings in a life while mining, the ore area (radius 2) is banned in bot.unreachable, ending mine:drowning <-> go_up:ok loops
//   LOCALSURFACE localSurface (OFF by default; =1 enables, experiment 5 found no gain) open sky (or two failed climbs) below home's height makes that height the surface, so the bot stops climbing toward a hill it cannot reach
//   HAZARDGRACE hazardGrace (ON by default since A/B 248-295: 37 vs 25 banked; =0 disables) an explore hazard does not count toward stuck while a hazard_up climb is pending
//   WATCHDOG   watchdog (OFF by default; integer, 1 enables, 2-5 are variants, see watchdogWindow in skills.js) a path goal that moves the bot <1 block in 5 s is cancelled, its target blacklisted, and the skill fails as no_progress
//   TRACELOG   traceLog (OFF by default; =1 enables) diagnostic only: one JSONL line per planner decision in logs/trace-<run>.jsonl, no behaviour change
//   EARLYBANK  earlyBank (OFF by default; =1 enables) wantsReturn already banks the first diamond at once; this stops lingerUnderground (nightAscent) from delaying that first deposit
//   SPAWNESCAPE spawnEscape (OFF by default; =1 enables) no wood and no pickaxe after 2 go_up:not_reached or failed surface searches: one 64-block surface walk in a fresh direction (max 3 per life) before the next log search
//   VEINSCAN   veinScan (OFF by default; =1 enables) at y <= -40 each branch tunnel step scans radius 48 for a buried diamond (visible needs an exposed face) and tunnels toward it; an ore whose detour fails is blacklisted (skills.js veinTarget)
//   SPAWNWALK  spawnWalk (OFF by default; =1 enables) supersedes spawnEscape: on the same bad-spawn trigger the bot picks one heading (opposite surfaceDir) and keeps walking it in 56-block surface legs, sidestepping a blocked leg with a 16-block lateral leg then resuming, until a log is seen; cap 600 blocks or 10 min, then the old behaviour
//   PICKREADY  pickReady (OFF by default; =1 enables) keeps a spare iron pickaxe (mines visible iron, smelts, crafts it before the final descent) and, with one low (<=20% durability left) or no iron pickaxe and no spare, climbs to the iron level (y16) and restocks instead of mining on until it breaks
//   RECOVERY   recovery (OFF by default; =1 enables) before the stuck tracker ends a run, one named recovery routine per failure signature and life (recoveryFor)
//   SPAREALWAYS  spareAlways (OFF by default; =1 enables, needs pickReady) makes the spare iron pickaxe deliberate: after the first iron pickaxe and above y0 the bot goes to the iron band (y16), mines 3 iron, smelts, crafts sticks and the spare, within an 8 minute budget and only with 20+ minutes left and fuel on hand
//   EARLYSEAL  earlySeal (OFF by default; =1 enables) a hostile 3+ blocks away with health < 14, 2+ hostiles or a skeleton in sight starts the shelter before the fight branch; the cell holds up to 90 s (no dig-out near a hostile or below 14 hp) and eats inside; max 2 per 10 min, 5 min lockout after a hold that fails, exempt from the shelter pause
//   SPAREPICK  sparePick (OFF by default; =1 enables) with one pickaxe left and <= 40 uses on it, the spare (stone pickaxe, sticks) is crafted before visible diamonds are mined, and its failure cap is 6 instead of 2, so the last pickaxe never wears out with materials in the bag (stuck endings)
//   LONGRUN    longrun (OFF by default; =1 enables) hours-long runs: deaths are not terminal, a stuck detection escalates (recover, clear loop memory, forced escape) and only 6 no-progress escalations in a row end the run; adds gear/deposit telemetry to the row (longrun.js)
//   TELEMETRY  telemetry (OFF by default; =1 enables) observation only: detailed damage, seal-failure, pickaxe/ore, pickaxe-loss and stuck-context fields in the skill log and result row (telemetry.js); no decision changes
const SWITCHES = ['shaft', 'nightSurf', 'foodGate', 'fightGuard', 'reserve', 'crowdFlee', 'nightAscent', 'branchRelocate', 'goUpLoop', 'localSurface', 'pickFirst', 'stationAbove', 'drownCap', 'hazardGrace', 'recovery', 'traceLog', 'earlyBank', 'spawnEscape', 'veinScan', 'spawnWalk', 'pickReady', 'spareAlways', 'earlySeal', 'sparePick', 'longrun', 'telemetry']
// ARM values parse to numbers ("shaft=0"); code checks `=== false` in places, so switches are coerced to booleans once, here.
// watchdog is the one multi-value param (0 off, 1-5 variants), so it is coerced to an integer instead.
const normalizeParams = (params) => ({ ...params, ...Object.fromEntries(SWITCHES.filter(k => k in params).map(k => [k, Boolean(params[k])])), ...('watchdog' in params && { watchdog: Number(params.watchdog) || 0 }) })

const PURE_JUNK = ['dirt', 'gravel', 'andesite', 'diorite', 'granite', 'tuff', 'netherrack']
const STONE_JUNK = ['cobblestone', 'cobbled_deepslate']
// Backup materials held before a descent, so recovery skills (table, pickaxe, pillar, shelter, adoptChest) never lack them.
// planks counts logs as four; stone is cobblestone for pillars, scaffolds and a shelter seal; food is any edible item.
const RESERVE = { planks: 16, chest: 1, stone: 32, food: 6 }
const MAX_RESTOCK_STEPS = 12 // per item and trip, so restocking can never become a loop
const MAX_RESTOCK_FAILS = 2
const RETURN_BEFORE_MS = 8 * 60000
const PICKAXES = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
const SWORDS = ['stone_sword', 'iron_sword', 'diamond_sword', 'netherite_sword']
const HAZARD_CLIMB = 4
const IRON_TIER = 2 // index in PICKAXES
const LOW_PICK = 20
const SURFACE_STICKS = 8 // enough for the spare and iron pickaxes so nothing needs a trip back up
const SURFACE_SLACK = 8
const MAX_SPARE_FAILS = 2
const SPARE_PICK_FAILS = 6 // params.sparePick
const SPARE_PICK_AT = 40 // params.sparePick: uses left on the only pickaxe
const MAX_HUNT_FAILS = 4
const EAT_AT = 17 // natural regeneration needs food >= 18
const WEAK_HEALTH = 12
const FULL_FOOD = 20
const DROWN_RISE = 4
const FIGHT_HEALTH = 8 // keep equal to FIGHT_MIN_HEALTH in skills.js (fight gives up below it); tests/planner.test.js asserts it
const MAX_FIGHT_FAILS = 4 // consecutive failed fights per trip; then the mob counts as unreachable (behind a wall) and is ignored
const EARLY_SEAL_HEALTH = 14 // = fleeHealth; below it a hostile that is still 3+ blocks away is sealed out
const EARLY_MIN_DIST = 3
const EARLY_SEAL_MAX = 2
const EARLY_SEAL_WINDOW_MS = 600000
const MAX_CROWD_FLEES = 3 // per life: flights from a crowd of hostiles when there is nothing to seal in with
const MAX_BURN_UPS = 2 // per life: climbs after a burning abort
const BURN_RISE = 4
const MAX_DIG_FAILS = 1 // the relocation hop must come before the stuck tracker's third failure
const MAX_WAIT_FAILS = 4
const MAX_NIGHT_DIGS = 6
const NIGHT_DEPTH = 4 // below the surface with a pickaxe; by hand it is HAND_DEPTH
const HAND_DEPTH = 3
const NIGHT_BAND = 12 // shallower than this and underground at night counts as the night hole
const NIGHT_WAIT_MIN_MS = 15 * 60000 // closer to the deadline than this, a diamond trip home does not wait for dawn
const REST_BELOW = 8
const RELOCATE_BLOCKS = 8
const MIN_FOOD_TO_DESCEND = 4
const MAX_HOPS = 3 // relocation hops in a row without descending before a fresh column is chosen
const FRESH_COLUMN_BLOCKS = 30
// All guesses, to be A/B tested. Hostiles are dangerous roughly from dusk to dawn (a day is 24000 ticks).
const DANGER_FROM = 12500
const DANGER_UNTIL = 23500
const ASCENT_DEEP = 20 // shallower than this the climb is short enough not to plan around
const ASCENT_MS_PER_BLOCK = 1500 // guess: measured go_up is 0.5-2 s/block, slower in practice
const ASCENT_SLACK_MS = 60000
const ASCENT_MARGIN_MS = 12 * 60000 // never linger with less than climb + this left
const MAX_ASCENT_DELAY_MS = 20 * 60000 // per life, so lingering can never become a stuck loop
const BRANCH_MISSES = 12 // consecutive not_found diamond branch explores before one relocation
const BRANCH_HOP_BLOCKS = 40
const MAX_BRANCH_RELOCS = 2 // per life
const ESCAPE_FAILS = 2 // go_up:not_reached failures or failed surface searches before a spawn escape
const ESCAPE_BLOCKS = 64
const MAX_ESCAPES = 3 // per life, each in a different direction
const WALK_BLOCKS = 56 // spawnWalk leg along the heading
const WALK_SIDE_BLOCKS = 16 // lateral leg that goes around a blocked one
const WALK_CAP_BLOCKS = 600
const WALK_CAP_MS = 10 * 60000
const MAX_WALK_FAILS = 6 // consecutive failed legs (including sidesteps) before giving up
const IRON_PICKS = ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
const IRON_LEVEL = 16 // SOURCES.raw_iron.y
const IRON_DURABILITY = 250
const LOW_IRON_USED = 0.8 // restock once 80% of the pickaxe is used, i.e. 20% (50 uses) left
const LOW_IRON = IRON_DURABILITY - Math.round(IRON_DURABILITY * LOW_IRON_USED)
const SPARE_INGOTS = RECIPES.iron_pickaxe.in.iron_ingot
const MAX_PICK_UPS = 2 // per life: climbs to the iron level to restock
const SPARE_BUDGET_MS = 8 * 60000 // spareAlways: from its first step, then the descent goes on without a spare
const SPARE_MAX_STEPS = 40 // own restock budget (pick_ready's 12 is too few for a descent plus mining)
const SPARE_MIN_Y = 0 // spareAlways stops below this: the final descent has started
const PREP_MIN_MS = 20 * 60000 // closer to the deadline than this, no spare is prepared

// Recipes take one plank/stone type (recipe data is per type), so those mean the biggest single stack.
const BIGGEST_STACK = new Set(['planks', 'stone'])
const count = (s, item) => {
  const counts = (GROUPS[item] ?? [item]).map(name => s.inv[name] ?? 0)
  return BIGGEST_STACK.has(item) ? Math.max(...counts) : counts.reduce((n, c) => n + c, 0)
}
const pickaxeCount = (s) => PICKAXES.reduce((n, name) => n + (s.inv[name] ?? 0), 0)
const atSurface = (s) => s.y >= s.surfaceY - SURFACE_SLACK
const has = (s, item) => count(s, item) > 0
const act = (skill, ...args) => ({ skill, args })
const mineAct = (key) => act('mine', SOURCES[key].blocks, SOURCES[key].maxAbove ?? null)

// Planks come from the held log type that extends the biggest existing plank stack.
function concrete(s, item) {
  if (item !== 'planks') return item
  const planksOf = (log) => s.inv[log.replace('_log', '_planks')] ?? 0
  const logs = GROUPS.log.filter(l => has(s, l)).sort((a, b) => planksOf(b) - planksOf(a) || s.inv[b] - s.inv[a])
  return logs[0].replace('_log', '_planks')
}

function obtain(s, item, n) {
  if (count(s, item) >= n) return null
  if (RECIPES[item]) return craftStep(s, item)
  if (item === 'iron_ingot') return smeltStep(s)
  return gather(s, item)
}

function craftStep(s, item) {
  const recipe = RECIPES[item]
  for (const [input, n] of Object.entries(recipe.in)) {
    const step = obtain(s, input, n)
    if (step) return step
  }
  if (recipe.table && !s.tableNear && !has(s, 'crafting_table')) return obtain(s, 'crafting_table', 1)
  return act('craft', concrete(s, item), recipe.out)
}

function smeltStep(s) {
  return obtain(s, 'raw_iron', 1)
    ?? (has(s, 'fuel') ? null : obtain(s, 'planks', 1))
    ?? (s.furnaceNear ? null : obtain(s, 'furnace', 1))
    ?? act('smelt', 'iron_ingot')
}

function gather(s, item) {
  const source = SOURCES[item]
  if (s.visible[item]) return mineAct(item)
  if (source.find === 'surface') {
    const escape = spawnEscape(s, source)
    if (escape) return escape
    if (s.y < s.surfaceY - 8) return act('go_up', s.surfaceY)
    return act('explore', { target: source.blocks, mode: 'surface', dir: s.memory.surfaceDir, maxBlocks: surfaceReach(s.memory), maxAbove: source.maxAbove })
  }
  if (source.find === 'dig') return descend(s, s.y - 3, source.blocks)
  const y = source.y ?? s.params.branchY
  if (s.memory.hazardUp) return { ...act('go_up', s.y + HAZARD_CLIMB), key: 'hazard_up' }
  if (s.y > y + 2) return descend(s, y, source.blocks)
  if (item === 'diamond' && branchStale(s)) return { ...act('explore', { target: source.blocks, mode: 'branch', dir: (s.memory.baseDir + 1) % DIRS, maxBlocks: BRANCH_HOP_BLOCKS }), key: 'branch_relocate' }
  return act('explore', { target: source.blocks, mode: 'branch', ...branchLeg(s) })
}

// A bad spawn (water, a basin) with no wood and no tool keeps failing the same climb or search: walk far in a fresh direction instead.
// The first escape goes opposite surfaceDir; later ones continue from escapeStart (set by agent.js), so no direction repeats.
function spawnEscape(s, source) {
  if (s.params.spawnWalk) return spawnWalk(s, source)
  const { spawnEscapes = 0, escapeStart, surfaceDir = 0, surfaceLeg = 0, failSigs = {} } = s.memory
  if (!s.params.spawnEscape || spawnEscapes >= MAX_ESCAPES || count(s, 'log') > 0 || count(s, 'planks') > 0 || pickaxeCount(s) > 0) return null
  if ((failSigs['go_up:not_reached'] ?? 0) < ESCAPE_FAILS && surfaceLeg < ESCAPE_FAILS) return null
  const dir = ((escapeStart ?? surfaceDir + 2) + spawnEscapes) % DIRS
  return { ...act('explore', { target: source.blocks, mode: 'surface', dir, maxBlocks: ESCAPE_BLOCKS, maxAbove: source.maxAbove }), key: 'spawn_escape' }
}

// spawnWalk: memory.walk = { dir (the heading, fixed by the first leg), blocks (walked so far), fails (consecutive), detour (0, or 1/3 = sidestep to that side of the heading), startedAt }.
// The same trigger as spawnEscape, but once started it continues from the walk state until a log is seen (agent.js clears it) or a cap is hit, after which the old behaviour resumes.
function spawnWalk(s, source) {
  const { walk, surfaceDir = 0, surfaceLeg = 0, failSigs = {} } = s.memory
  if (count(s, 'log') > 0 || count(s, 'planks') > 0 || pickaxeCount(s) > 0) return null
  if (!walk && (failSigs['go_up:not_reached'] ?? 0) < ESCAPE_FAILS && surfaceLeg < ESCAPE_FAILS) return null
  const w = walk ?? { dir: (surfaceDir + 2) % DIRS, blocks: 0, fails: 0, detour: 0 }
  if (w.blocks >= WALK_CAP_BLOCKS || w.fails >= MAX_WALK_FAILS || (w.startedAt !== undefined && s.now !== undefined && s.now - w.startedAt >= WALK_CAP_MS)) return null
  const dir = (w.dir + (w.detour ?? 0)) % DIRS
  const maxBlocks = w.detour ? WALK_SIDE_BLOCKS : WALK_BLOCKS
  return { ...act('explore', { target: source.blocks, mode: 'surface', dir, maxBlocks, maxAbove: source.maxAbove, shore: true }), key: 'spawn_walk' }
}

// Walk state after a leg (pure). ok = a log is in view: the walk is over. not_found = the leg was walked in full.
// Any other failure counts, and the next leg sidesteps to alternating sides of the heading before the heading resumes.
function walkAfter(walk, leg, result, now = Date.now()) {
  if (result.ok) return undefined
  const w = { dir: leg.dir, blocks: 0, fails: 0, detour: 0, ...walk, startedAt: walk?.startedAt ?? now }
  if (result.reason === 'not_found') return { ...w, blocks: w.blocks + leg.maxBlocks, fails: 0, detour: 0 }
  const fails = w.fails + 1
  return { ...w, fails, detour: fails % 2 ? 1 : 3 }
}

const inputsOnHand =(s, item) => Object.entries(RECIPES[item].in).every(([input, n]) => count(s, input) >= n)

// The dig failed for lack of a pickaxe tier: craft the best pickaxe above the one carried that needs nothing gathered.
function pickaxeUpgrade(s) {
  const tier = Math.max(...PICKAXES.map((name, i) => (has(s, name) ? i : -1)))
  for (const name of PICKAXES.slice(tier + 1, IRON_TIER + 1).reverse()) {
    if (!inputsOnHand(s, name)) continue
    const step = obtain(s, name, 1)
    if (step?.skill === 'craft') return { ...step, key: 'upgrade' }
  }
  return null
}

// Digging down keeps failing here: move to a fresh spot (a surface hop, or a short branch leg underground) before retrying.
function descend(s, y, target) {
  const provision = foodGate(s)
  if (provision) return provision
  const { digFails = 0, relocations = 0, hopsSinceDescent = 0 } = s.memory
  if (hopsSinceDescent >= MAX_HOPS) return freshColumn(s, target, relocations)
  if (digFails < MAX_DIG_FAILS) return act('dig_down', y)
  if (s.memory.relocFailed && !atSurface(s)) return { ...act('go_up', s.surfaceY), key: 'reloc_up' } // the hop found no way out: hop again from the surface
  if (atSurface(s)) return { ...act('explore', { target, mode: 'surface', dir: (s.memory.surfaceDir + relocations) % DIRS, maxBlocks: RELOCATE_BLOCKS }), relocate: true }
  return { ...act('explore', { target, mode: 'branch', dir: (s.memory.baseDir + 1 + relocations) % DIRS, maxBlocks: RELOCATE_BLOCKS }), relocate: true }
}

// Hops keep landing in columns that cannot be dug: climb out and start over far from here.
function freshColumn(s, target, relocations) {
  if (!atSurface(s)) return { ...act('go_up', s.surfaceY), key: 'fresh_up' }
  const dir = (s.memory.surfaceDir + relocations) % DIRS
  return { ...act('explore', { target, mode: 'surface', dir, maxBlocks: FRESH_COLUMN_BLOCKS }), relocate: true, key: 'fresh_column' }
}

// No descent on an empty larder while an animal is still in reach; both hunt caps (MAX_HUNT_FAILS, the restock budget) end it.
function foodGate(s) {
  if (!s.params.foodGate || !atSurface(s) || (s.foodCount ?? 0) >= MIN_FOOD_TO_DESCEND || !s.animalNear || (s.isNight && s.params.nightSurf)) return null
  if ((s.memory.optionalFails?.hunt ?? 0) >= MAX_HUNT_FAILS || !restockOpen(s, 'food')) return null
  return { ...act('hunt'), optional: true, restock: 'food' }
}

// Each failed surface search lengthens the next one so the bot spirals outward instead of pacing the same ground.
const surfaceReach = ({ surfaceLeg }) => Math.min(SURFACE_BLOCKS + SURFACE_GROWTH * surfaceLeg, SURFACE_CAP)

const branchStale = (s) => s.params.branchRelocate && (s.memory.branchMisses ?? 0) >= BRANCH_MISSES && (s.memory.branchRelocs ?? 0) < MAX_BRANCH_RELOCS

// Serpentine branch mine: long leg, short step sideways, long leg back, ...
function branchLeg(s) {
  const { leg, baseDir } = s.memory
  if (leg % 2 === 1) return { dir: (baseDir + 1) % DIRS, maxBlocks: s.params.spacing }
  const back = Math.floor(leg / 2) % 2 === 1
  return { dir: back ? (baseDir + 2) % DIRS : baseDir, maxBlocks: s.params.tunnelLength }
}

function objectiveDone(s) {
  return s.objective.count !== 'max' && s.deposited >= s.objective.count
}

const ascentMs = (s) => (s.surfaceY - s.y) * ASCENT_MS_PER_BLOCK + ASCENT_SLACK_MS
const timeOfDayAt = (s, ms) => (s.timeOfDay + ms / 50) % 24000 // 20 ticks per second

// Deep, healthy and fed with a diamond in the pack: climbing now would reach the surface in the dark, so mine on until it would not.
function lingerUnderground(s) {
  if (!s.params.nightAscent || s.timeOfDay === undefined || !has(s, 'iron_pickaxe') || count(s, 'diamond') === 0) return false
  if (s.params.earlyBank && s.deposited === 0) return false // the first diamond is banked now, never held for dawn
  if (s.surfaceY - s.y < ASCENT_DEEP || s.msLeft < ascentMs(s) + ASCENT_MARGIN_MS) return false
  if ((s.memory.ascentDelayMs ?? 0) >= MAX_ASCENT_DELAY_MS) return false
  if (s.hostileNear || s.recentlyAttacked || s.health < WEAK_HEALTH || (s.food <= 6 && !s.hasFood) || s.freeSlots <= 1) return false
  const arrival = timeOfDayAt(s, ascentMs(s))
  return arrival >= DANGER_FROM && arrival < DANGER_UNTIL
}

function shouldReturn(s) {
  return wantsReturn(s) && !lingerUnderground(s)
}

// True when the bot is delaying a return it would otherwise make, i.e. the linger really held it underground.
function lingerHeldReturn(s) {
  return lingerUnderground(s) && wantsReturn(s)
}

function wantsReturn(s) {
  const carried = count(s, 'diamond')
  if (carried === 0) return false
  if (s.deposited === 0 || s.msLeft < RETURN_BEFORE_MS) return true // secure the first diamond; bank before time runs out
  const target = s.objective.count === 'max' ? Infinity : s.objective.count - s.deposited
  return carried >= Math.min(target, s.params.returnAt)
    || s.freeSlots <= 1
    || (s.food <= 6 && !s.hasFood)
    || (pickaxeCount(s) < 2 && s.pickLeft < LOW_PICK)
    || (s.isNight && s.y >= s.surfaceY - 2)
}

function junkAction(s) {
  if (s.freeSlots > 2) return null
  if (PURE_JUNK.some(name => has(s, name))) return act('toss', PURE_JUNK, 0)
  if (STONE_JUNK.some(name => (s.inv[name] ?? 0) > RESERVE.stone)) return act('toss', STONE_JUNK, RESERVE.stone)
  return null
}

// Spare stone pickaxe and sticks for the long descent. Underground there is no wood to fetch, so this
// only crafts from what is carried and is skipped when the materials are missing. Steps are marked optional
// so the agent can count their failures, and a spare that keeps failing is dropped instead of ending the run.
function spareStep(s) {
  const picks = pickaxeCount(s)
  const wantsSpare = picks < 2 || (s.pickLeft < LOW_PICK && picks < 3)
  const sticksWanted = atSurface(s) ? SURFACE_STICKS : wantsSpare ? 2 : 0
  const sticks = s.inv.stick ?? 0
  const woodOnHand = count(s, 'planks') >= 2 || has(s, 'log')
  const tableOk = s.tableNear || has(s, 'crafting_table') || count(s, 'planks') >= 4 || has(s, 'log')
  let step = null
  if (sticks < sticksWanted && woodOnHand) step = obtain(s, 'stick', sticksWanted)
  else if (wantsSpare && sticks >= 2 && count(s, 'stone') >= 3 && tableOk) step = obtain(s, 'stone_pickaxe', count(s, 'stone_pickaxe') + 1)
  if (!step || (s.memory.optionalFails?.[step.args[0]] ?? 0) >= (s.params.sparePick ? SPARE_PICK_FAILS : MAX_SPARE_FAILS)) return null
  return { ...step, optional: true }
}

// params.sparePick: the only pickaxe is nearly worn out, so the spare comes before diamonds and a trip home.
const sparePickStep = (s) => (s.params.sparePick && !s.hostileNear && pickaxeCount(s) === 1 && s.pickLeft < SPARE_PICK_AT ? spareStep(s) : null)

// A sword right after the stone pickaxe, from stone in hand or in view; never worth a dig or a trip for wood.
function swordStep(s) {
  if (SWORDS.some(name => has(s, name)) || (s.inv.stick ?? 0) < 1) return null
  const stoneAtHand = count(s, 'stone') >= 2 || s.visible.stone
  const tableOk = s.tableNear || has(s, 'crafting_table') || count(s, 'planks') >= 4
  if (!stoneAtHand || !tableOk || (s.memory.optionalFails?.stone_sword ?? 0) >= MAX_SPARE_FAILS) return null
  return { ...obtain(s, 'stone_sword', 1), optional: true }
}

// Before the first descent: wood for sticks is fetched here, not underground.
function stickStock(s) {
  return atSurface(s) && (s.inv.stick ?? 0) < SURFACE_STICKS ? obtain(s, 'stick', SURFACE_STICKS) : null
}

const underground = (s) => s.y < s.surfaceY - 2
const waitFails = (s, key) => s.memory.optionalFails?.[key] ?? 0

// Sealed into a cell until `until` ('dawn' or 'rest'); counted as optional under its own key so a cell that never seals is dropped.
function holdUp(s, until) {
  if (!s.canShelter || waitFails(s, until) >= MAX_WAIT_FAILS) return null
  const dir = atSurface(s) ? s.memory.surfaceDir : s.memory.baseDir
  return { ...act('shelter', dir, until), optional: true, key: until }
}

// Hurt, alone and below ground: regenerate in a sealed cell (needs food >= 18, so eating comes first).
function restStep(s) {
  if (s.health >= REST_BELOW || s.hostileNear || !underground(s) || s.food <= EAT_AT) return null
  return holdUp(s, 'rest')
}

// The night belongs underground: from the surface dig a short shaft (by hand if there is no pickaxe), then wait for dawn.
// With the iron pickaxe (nightSurf) the bot already descends, so underground it only digs in; a stuck column at the surface waits for dawn instead of hopping across open ground.
function nightStep(s) {
  const geared = has(s, 'iron_pickaxe')
  if (!s.isNight || has(s, 'diamond') || (geared && !s.params.nightSurf)) return null
  if (!underground(s)) {
    if ((s.memory.digFails ?? 0) >= MAX_DIG_FAILS || (s.memory.nightDigs ?? 0) >= MAX_NIGHT_DIGS) {
      return geared && s.msLeft >= NIGHT_WAIT_MIN_MS ? holdUp(s, 'dawn') : null
    }
    return { ...act('dig_down', s.surfaceY - (pickaxeCount(s) > 0 ? NIGHT_DEPTH : HAND_DEPTH)), key: 'night_dig' }
  }
  return !geared && s.y >= s.surfaceY - NIGHT_BAND ? holdUp(s, 'dawn') : null
}

// Walled in when there are blocks for it, otherwise run. The exit side follows the direction the bot was heading.
function takeCover(s) {
  if (!s.canShelter) return act('flee')
  return act('shelter', atSurface(s) ? s.memory.surfaceDir : s.memory.baseDir)
}

// Failures across all items are capped too, so a run of different failed restocks cannot look like a stuck bot.
const restockOpen = (s, item, maxSteps = MAX_RESTOCK_STEPS) => {
  const totalFails = Object.values(s.memory.restock ?? {}).reduce((sum, c) => sum + (c.fails ?? 0), 0)
  if (totalFails >= MAX_RESTOCK_FAILS) return false
  const { steps = 0, fails = 0 } = s.memory.restock?.[item] ?? {}
  return steps < maxSteps && fails < MAX_RESTOCK_FAILS
}

// With the iron pickaxe and a calm surface, top the reserve up from what is in view, most valuable first:
// wood (it makes the chest, table and sticks), the chest, stone, food. Anything out of reach is skipped, never searched for.
function reserveStep(s) {
  if (!s.params.reserve || !has(s, 'iron_pickaxe') || !atSurface(s) || s.hostileNear || s.isNight || s.msLeft < RETURN_BEFORE_MS) return null
  const wood = count(s, 'planks') + 4 * count(s, 'log')
  const steps = [
    ['planks', wood < RESERVE.planks && s.visible.log, () => mineAct('log')],
    ['chest', !has(s, 'chest') && wood >= RECIPES.chest.in.planks, () => obtain(s, 'chest', 1)],
    ['stone', count(s, 'stone') < RESERVE.stone && s.visible.stone, () => mineAct('stone')],
    ['food', (s.foodCount ?? 0) < RESERVE.food && s.animalNear && waitFails(s, 'hunt') < MAX_HUNT_FAILS, () => ({ ...act('hunt'), optional: true })],
  ]
  const [item, , build] = steps.find(([key, needed]) => needed && restockOpen(s, key)) ?? []
  return item ? { ...build(), restock: item } : null
}

const ironPickCount = (s) => IRON_PICKS.reduce((n, name) => n + (s.inv[name] ?? 0), 0)
const tableReady = (s) => s.tableNear || has(s, 'crafting_table') || count(s, 'planks') >= 4
const smeltReady = (s) => tableReady(s) && has(s, 'fuel') && (s.furnaceNear || has(s, 'furnace') || count(s, 'stone') >= RECIPES.furnace.in.stone)

// Extra pickaxe on hand before the final descent, from what is near: visible iron is mined, smelted when a furnace is workable, then crafted. Never fetches wood or searches for ore.
function spareIronStep(s) {
  const raw = count(s, 'raw_iron')
  const ingots = count(s, 'iron_ingot')
  if (raw + ingots < SPARE_INGOTS && s.visible.raw_iron) return mineAct('raw_iron')
  if (ingots < SPARE_INGOTS && raw > 0 && smeltReady(s)) return obtain(s, 'iron_ingot', SPARE_INGOTS)
  if (ingots < SPARE_INGOTS) return null
  if ((s.inv.stick ?? 0) < RECIPES.iron_pickaxe.in.stick) return count(s, 'planks') >= 2 || has(s, 'log') ? obtain(s, 'stick', RECIPES.iron_pickaxe.in.stick) : null
  return tableReady(s) ? obtain(s, 'iron_pickaxe', count(s, 'iron_pickaxe') + 1) : null
}

// Fuel for the 3 smelts (about 0.4 coal or 2 logs) is on hand, so smelting never sends the bot to fetch wood.
const spareFuelOk = (s) => count(s, 'coal') + count(s, 'charcoal') > 0 || count(s, 'log') >= 2

// params.spareAlways: the spare is deliberate, not opportunistic: gather() goes to the iron level and searches for iron there. Bounded by SPARE_BUDGET_MS since its first step (agent.js sets memory.spareSince).
function spareAlwaysStep(s) {
  const since = s.memory.spareSince
  const expired = since !== undefined && s.now !== undefined && s.now - since >= SPARE_BUDGET_MS
  if (!s.params.spareAlways || expired || s.y < SPARE_MIN_Y || !spareFuelOk(s) || !restockOpen(s, 'spare_always', SPARE_MAX_STEPS)) return null
  const ingots = count(s, 'iron_ingot')
  const step = count(s, 'raw_iron') + ingots < SPARE_INGOTS ? gather(s, 'raw_iron')
    : ingots < SPARE_INGOTS ? obtain(s, 'iron_ingot', SPARE_INGOTS)
    : spareCraftStep(s)
  return step ? { ...step, restock: 'spare_always' } : null
}

// Sticks come from carried wood and the table from a carried log; neither is fetched.
function spareCraftStep(s) {
  if ((s.inv.stick ?? 0) < RECIPES.iron_pickaxe.in.stick) return count(s, 'planks') >= 2 || has(s, 'log') ? obtain(s, 'stick', RECIPES.iron_pickaxe.in.stick) : null
  return tableReady(s) || has(s, 'log') ? obtain(s, 'iron_pickaxe', count(s, 'iron_pickaxe') + 1) : null
}

// params.pickReady. Before the final descent: prepare a spare iron pickaxe. With one low or no iron pickaxe and no spare (s.ironLeft = durability left on the best one):
// craft a replacement if its materials are on hand, else climb to the iron level (y16) to find iron there, instead of mining on until the pick breaks.
// Restock steps and failures use the shared restock budgets, so it can never loop; MAX_PICK_UPS bounds the climbs.
function pickReadyStep(s) {
  const picks = ironPickCount(s)
  if (!s.params.pickReady || s.ironLeft === undefined || picks >= 2 || s.hostileNear || s.msLeft < RETURN_BEFORE_MS || !restockOpen(s, 'pick_ready')) return null
  const low = picks === 0 || s.ironLeft <= LOW_IRON
  const deep = s.y < IRON_LEVEL - 2
  if (!low) {
    const calm = !s.isNight && s.msLeft >= PREP_MIN_MS && s.y > s.params.branchY + 2
    return calm ? (spareAlwaysStep(s) ?? tagged(spareIronStep(s))) : null
  }
  const craftsNow = inputsOnHand(s, 'iron_pickaxe') && tableReady(s)
  if (deep && !craftsNow) return !s.visible.raw_iron && (s.memory.pickUps ?? 0) < MAX_PICK_UPS ? { ...act('go_up', IRON_LEVEL), key: 'pick_up' } : null
  return picks === 0 ? null : tagged(obtain(s, 'iron_pickaxe', count(s, 'iron_pickaxe') + 1))
}
const tagged = (step) => (step ? { ...step, restock: 'pick_ready' } : null)

// Surface work is the tech tree before the iron pickaxe, or a trip home.
const surfaceWork = (s) => !has(s, 'iron_pickaxe') || shouldReturn(s)

// Sheltering did not get rid of the hostile: fight one that is close and keep working otherwise.
const canFight = (s) => (s.memory.fightFails ?? 0) < MAX_FIGHT_FAILS

function standGround(s) {
  if (!s.hostileClose || !canFight(s)) return null
  return s.health >= FIGHT_HEALTH ? act('fight') : act('flee')
}

// A crowd in reach and no blocks to seal in with: a fight is lost once health drops below FIGHT_HEALTH, so run before it starts.
const crowdedOut = (s) => s.params.crowdFlee && s.hostileClose && (s.hostileCount ?? 0) >= 2 && !s.canShelter && (s.memory.crowdFlees ?? 0) < MAX_CROWD_FLEES

// params.earlySeal: why to wall in now, while the hostile is still 3+ blocks away (placing needs ~66 ticks and fails once a mob stands in a wall cell).
function earlySealReason(s) {
  if (!s.params.earlySeal || !s.canShelter || s.cellUnsafe || !(s.hostileDist >= EARLY_MIN_DIST)) return null
  if ((s.now ?? 0) < (s.memory.earlyLockUntil ?? 0)) return null // the last hold ended in hostile_waiting: the hostile stays near, sealing again only repeats it
  const recent = (s.memory.earlySeals ?? []).filter(t => (s.now ?? 0) - t < EARLY_SEAL_WINDOW_MS)
  if (recent.length >= EARLY_SEAL_MAX) return null
  if (s.hostileRanged) return 'ranged'
  if ((s.hostileCount ?? 0) >= 2) return 'crowd'
  return s.health < EARLY_SEAL_HEALTH ? 'health' : null
}

// A hostile in reach gets fought first: sealing in or running with it adjacent only gives it free hits.
function dangerStep(s) {
  if (s.drowning) return act('go_up', s.y + DROWN_RISE)
  if (s.recentlyBurned && underground(s) && (s.memory.burnUps ?? 0) < MAX_BURN_UPS) return { ...act('go_up', s.y + BURN_RISE), key: 'burn_up' }
  if (!s.hostileNear || s.enclosed) return null
  if (crowdedOut(s)) return { ...act('flee'), key: 'crowd_flee' }
  const reason = earlySealReason(s)
  if (reason) return { ...act('shelter', atSurface(s) ? s.memory.surfaceDir : s.memory.baseDir, 'early', reason), key: 'early_seal' }
  if (s.hostileClose && s.health >= FIGHT_HEALTH && canFight(s)) return act('fight')
  const threatened = s.recentlyAttacked || s.health < s.params.fleeHealth
    || (s.isNight && s.y >= s.surfaceY - 2 && !surfaceWork(s))
  if (!threatened) return null
  return s.memory.noShelter > 0 ? standGround(s) : takeCover(s)
}

// Eat when hungry, or when weak on the surface (before a descent) and not full; hunt when there is nothing to eat.
function foodStep(s) {
  const weak = atSurface(s) && s.health < WEAK_HEALTH && s.food < FULL_FOOD
  if (s.food > EAT_AT && !weak) return null
  if (s.hasFood) return act('eat')
  if (!s.animalNear || !atSurface(s) || (s.memory.optionalFails?.hunt ?? 0) >= MAX_HUNT_FAILS) return null
  if (s.isNight && s.params.nightSurf) return null // chasing an animal across open ground at night
  return { ...act('hunt'), optional: true }
}

// Bank trip: deposit at the chest, else climb out and walk home (after a night wait when the dark makes the walk deadly).
function returnTrip(s) {
  if (s.distHome <= 4) return act('deposit', s.home)
  const dawn = s.isNight && underground(s) && !(s.msLeft < NIGHT_WAIT_MIN_MS) ? holdUp(s, 'dawn') : null
  if (dawn) return dawn
  if (s.y < s.surfaceY - 8) return act('go_up', s.surfaceY)
  return act('return_home', s.home)
}

// Home trips timed out twice in a row (agent.js sets the pause): once, a carried chest is placed here and becomes home
// (deposit adopts a chest when none stands at the given spot); otherwise the trip waits and normal work goes on.
const homePaused = (s) => (s.memory.homePause ?? 0) > 0
function adoptHome(s) {
  if (!s.memory.homeAdopt || !has(s, 'chest') || !s.pos) return null
  return { ...act('deposit', s.pos), key: 'adopt_home' }
}

// No iron pickaxe: stock wood, then climb the tool tiers up to the iron pickaxe.
function pickaxeStep(s) {
  // Stock wood while trees are in view: tables and sticks are needed again underground.
  if (s.visible.log && count(s, 'log') + count(s, 'planks') / 4 < s.params.woodStock) return mineAct('log')
  if (!has(s, 'wooden_pickaxe') && !has(s, 'stone_pickaxe')) {
    // Restocking underground: skip the wooden tier when the stone for a stone pickaxe is at hand.
    return obtain(s, count(s, 'stone') >= 3 ? 'stone_pickaxe' : 'wooden_pickaxe', 1)
  }
  if (!has(s, 'stone_pickaxe')) return obtain(s, 'stone_pickaxe', 1)
  return swordStep(s) ?? spareStep(s) ?? stickStock(s) ?? obtain(s, 'iron_pickaxe', 1)
}

function nextAction(s) {
  if (objectiveDone(s)) return null
  const danger = dangerStep(s)
  if (danger) return danger
  const food = foodStep(s)
  if (food) return food
  const upgrade = s.memory.digFails > 0 && s.memory.lastDigReason === 'no_tool' ? pickaxeUpgrade(s) : null
  if (upgrade) return upgrade
  const waiting = restStep(s) ?? nightStep(s)
  if (waiting) return waiting
  const junk = junkAction(s)
  if (junk) return junk
  const pickFirst = s.params.pickFirst && !['wooden', 'stone', 'iron'].some(t => has(s, `${t}_pickaxe`)) ? pickaxeStep(s) : null
  if (pickFirst) return pickFirst
  const sparePick = sparePickStep(s)
  if (sparePick) return sparePick
  const homeTrip = shouldReturn(s) ? (homePaused(s) ? adoptHome(s) : returnTrip(s)) : null
  if (homeTrip) return homeTrip
  if (s.visible.diamond && has(s, 'iron_pickaxe')) return mineAct('diamond')
  const restock = reserveStep(s)
  if (restock) return restock
  const readying = pickReadyStep(s)
  if (readying) return readying
  if (!has(s, 'iron_pickaxe')) return pickaxeStep(s)
  return swordStep(s) ?? spareStep(s) ?? gather(s, 'diamond')
}

// Recovery: failure signature ("skill:reason") -> the one routine worth trying before the run is called stuck.
// s: { inv, memory }. A signature is recovered once per life (memory.recovered) and only after RECOVER_AFTER failures of it.
const RECOVER_AFTER = { 'explore:hazard': 2 }
function recoveryFor(signature, s) {
  if (s.memory.recovered?.[signature] || (s.memory.failSigs?.[signature] ?? 0) < (RECOVER_AFTER[signature] ?? 1)) return null
  if (signature === 'go_up:not_reached' || signature === 'go_up:no_progress') {
    if (pickaxeCount(s) > 0) return 'dig_out'
    return count(s, 'stone') >= 3 ? 'pillar_out' : null
  }
  if (signature === 'craft:no_tool') return (s.inv.stick ?? 0) >= 2 && count(s, 'stone') >= 3 && has(s, 'crafting_table') ? 'table_spot' : null
  return signature === 'explore:hazard' ? 'retreat' : null
}

module.exports = { EARLY_SEAL_WINDOW_MS, walkAfter, recoveryFor, nextAction, MAX_DIG_FAILS, DEFAULT_PARAMS, SOURCES, GROUPS, RESERVE, normalizeParams, FIGHT_HEALTH, MAX_FIGHT_FAILS, lingerUnderground, lingerHeldReturn, ASCENT_MARGIN_MS, MAX_ASCENT_DELAY_MS }
