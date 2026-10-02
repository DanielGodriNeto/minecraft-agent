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
const DEFAULT_PARAMS = { branchY: -58, spacing: 3, tunnelLength: 32, returnAt: 5, woodStock: 9, fleeHealth: 14, shaft: on('SHAFT'), nightSurf: on('NIGHTSURF'), foodGate: on('FOODGATE'), fightGuard: on('FIGHTGUARD'), reserve: on('RESERVE'), crowdFlee: on('CROWDFLEE'), nightAscent: on('NIGHTASCENT'), branchRelocate: on('BRANCHRELOCATE'), goUpLoop: on('GOUPLOOP'), localSurface: process.env.LOCALSURFACE === '1', pickFirst: process.env.PICKFIRST === '1', hazardGrace: process.env.HAZARDGRACE === '1', watchdog: process.env.WATCHDOG === '1', recovery: process.env.RECOVERY === '1', traceLog: process.env.TRACELOG === '1' }
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
//   LOCALSURFACE localSurface (OFF by default; =1 enables, experiment 5 found no gain) open sky (or two failed climbs) below home's height makes that height the surface, so the bot stops climbing toward a hill it cannot reach
//   HAZARDGRACE hazardGrace (OFF by default; =1 enables) an explore hazard does not count toward stuck while a hazard_up climb is pending
//   WATCHDOG   watchdog (OFF by default; =1 enables) a path goal that moves the bot <1 block in 5 s is cancelled, its target blacklisted, and the skill fails as no_progress
//   TRACELOG   traceLog (OFF by default; =1 enables) diagnostic only: one JSONL line per planner decision in logs/trace-<run>.jsonl, no behaviour change
//   RECOVERY   recovery (OFF by default; =1 enables) before the stuck tracker ends a run, one named recovery routine per failure signature and life (recoveryFor)
const SWITCHES = ['shaft', 'nightSurf', 'foodGate', 'fightGuard', 'reserve', 'crowdFlee', 'nightAscent', 'branchRelocate', 'goUpLoop', 'localSurface', 'pickFirst', 'hazardGrace', 'watchdog', 'recovery', 'traceLog']
// ARM values parse to numbers ("shaft=0"); code checks `=== false` in places, so switches are coerced to booleans once, here.
const normalizeParams = (params) => ({ ...params, ...Object.fromEntries(SWITCHES.filter(k => k in params).map(k => [k, Boolean(params[k])])) })

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
const MAX_HUNT_FAILS = 4
const EAT_AT = 17 // natural regeneration needs food >= 18
const WEAK_HEALTH = 12
const FULL_FOOD = 20
const DROWN_RISE = 4
const FIGHT_HEALTH = 8 // keep equal to FIGHT_MIN_HEALTH in skills.js (fight gives up below it); tests/planner.test.js asserts it
const MAX_FIGHT_FAILS = 4 // consecutive failed fights per trip; then the mob counts as unreachable (behind a wall) and is ignored
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

const inputsOnHand = (s, item) => Object.entries(RECIPES[item].in).every(([input, n]) => count(s, input) >= n)

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
  if (!step || (s.memory.optionalFails?.[step.args[0]] ?? 0) >= MAX_SPARE_FAILS) return null
  return { ...step, optional: true }
}

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
const restockOpen = (s, item) => {
  const totalFails = Object.values(s.memory.restock ?? {}).reduce((sum, c) => sum + (c.fails ?? 0), 0)
  if (totalFails >= MAX_RESTOCK_FAILS) return false
  const { steps = 0, fails = 0 } = s.memory.restock?.[item] ?? {}
  return steps < MAX_RESTOCK_STEPS && fails < MAX_RESTOCK_FAILS
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

// A hostile in reach gets fought first: sealing in or running with it adjacent only gives it free hits.
function dangerStep(s) {
  if (s.drowning) return act('go_up', s.y + DROWN_RISE)
  if (s.recentlyBurned && underground(s) && (s.memory.burnUps ?? 0) < MAX_BURN_UPS) return { ...act('go_up', s.y + BURN_RISE), key: 'burn_up' }
  if (!s.hostileNear || s.enclosed) return null
  if (crowdedOut(s)) return { ...act('flee'), key: 'crowd_flee' }
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
  const homeTrip = shouldReturn(s) ? (homePaused(s) ? adoptHome(s) : returnTrip(s)) : null
  if (homeTrip) return homeTrip
  if (s.visible.diamond && has(s, 'iron_pickaxe')) return mineAct('diamond')
  const restock = reserveStep(s)
  if (restock) return restock
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

module.exports = { recoveryFor, nextAction, MAX_DIG_FAILS, DEFAULT_PARAMS, SOURCES, GROUPS, RESERVE, normalizeParams, FIGHT_HEALTH, MAX_FIGHT_FAILS, lingerUnderground, lingerHeldReturn, ASCENT_MARGIN_MS, MAX_ASCENT_DELAY_MS }
