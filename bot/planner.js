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
  iron_pickaxe: { out: 1, in: { iron_ingot: 3, stick: 2 }, table: true },
  furnace: { out: 1, in: { stone: 8 }, table: true },
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

const DEFAULT_PARAMS = { branchY: -58, spacing: 3, tunnelLength: 32, returnAt: 5, woodStock: 9, fleeHealth: 14 }

const PURE_JUNK = ['dirt', 'gravel', 'andesite', 'diorite', 'granite', 'tuff', 'netherrack']
const STONE_JUNK = ['cobblestone', 'cobbled_deepslate']
const KEEP_STONE = 16
const RETURN_BEFORE_MS = 8 * 60000
const PICKAXES = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
const LOW_PICK = 20
const SURFACE_STICKS = 8 // enough for the spare and iron pickaxes so nothing needs a trip back up
const SURFACE_SLACK = 8
const MAX_SPARE_FAILS = 2
const MAX_HUNT_FAILS = 4
const EAT_AT = 17 // natural regeneration needs food >= 18
const WEAK_HEALTH = 12
const FULL_FOOD = 20
const DROWN_RISE = 4
const FIGHT_HEALTH = 8
const MAX_DIG_FAILS = 2
const RELOCATE_BLOCKS = 8

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
  if (s.y > y + 2) return descend(s, y, source.blocks)
  return act('explore', { target: source.blocks, mode: 'branch', ...branchLeg(s) })
}

// Digging down keeps failing here: move to a fresh spot (a surface hop, or a short branch leg underground) before retrying.
function descend(s, y, target) {
  const { digFails = 0, relocations = 0 } = s.memory
  if (digFails < MAX_DIG_FAILS) return act('dig_down', y)
  if (atSurface(s)) return { ...act('explore', { target, mode: 'surface', dir: (s.memory.surfaceDir + relocations) % DIRS, maxBlocks: RELOCATE_BLOCKS }), relocate: true }
  return { ...act('explore', { target, mode: 'branch', dir: (s.memory.baseDir + 1 + relocations) % DIRS, maxBlocks: RELOCATE_BLOCKS }), relocate: true }
}

// Each failed surface search lengthens the next one so the bot spirals outward instead of pacing the same ground.
const surfaceReach = ({ surfaceLeg }) => Math.min(SURFACE_BLOCKS + SURFACE_GROWTH * surfaceLeg, SURFACE_CAP)

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

function shouldReturn(s) {
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
  if (STONE_JUNK.some(name => (s.inv[name] ?? 0) > KEEP_STONE)) return act('toss', STONE_JUNK, KEEP_STONE)
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

// Before the first descent: wood for sticks is fetched here, not underground.
function stickStock(s) {
  return atSurface(s) && (s.inv.stick ?? 0) < SURFACE_STICKS ? obtain(s, 'stick', SURFACE_STICKS) : null
}

// Walled in when there are blocks for it, otherwise run. The exit side follows the direction the bot was heading.
function takeCover(s) {
  if (!s.canShelter) return act('flee')
  return act('shelter', atSurface(s) ? s.memory.surfaceDir : s.memory.baseDir)
}

// Surface work is the tech tree before the iron pickaxe, or a trip home.
const surfaceWork = (s) => !has(s, 'iron_pickaxe') || shouldReturn(s)

// Sheltering did not get rid of the hostile: fight one that is close and keep working otherwise.
function standGround(s) {
  if (!s.hostileClose) return null
  return s.health >= FIGHT_HEALTH ? act('fight') : act('flee')
}

function dangerStep(s) {
  if (s.drowning) return act('go_up', s.y + DROWN_RISE)
  if (!s.hostileNear) return null
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
  return { ...act('hunt'), optional: true }
}

function nextAction(s) {
  if (objectiveDone(s)) return null
  const danger = dangerStep(s)
  if (danger) return danger
  const food = foodStep(s)
  if (food) return food
  const junk = junkAction(s)
  if (junk) return junk
  if (shouldReturn(s)) {
    if (s.distHome <= 4) return act('deposit', s.home)
    if (s.y < s.surfaceY - 8) return act('go_up', s.surfaceY)
    return act('return_home', s.home)
  }
  if (s.visible.diamond && has(s, 'iron_pickaxe')) return mineAct('diamond')
  if (!has(s, 'iron_pickaxe')) {
    // Stock wood while trees are in view: tables and sticks are needed again underground.
    if (s.visible.log && count(s, 'log') + count(s, 'planks') / 4 < s.params.woodStock) return mineAct('log')
    if (!has(s, 'wooden_pickaxe') && !has(s, 'stone_pickaxe')) {
      // Restocking underground: skip the wooden tier when the stone for a stone pickaxe is at hand.
      return obtain(s, count(s, 'stone') >= 3 ? 'stone_pickaxe' : 'wooden_pickaxe', 1)
    }
    if (!has(s, 'stone_pickaxe')) return obtain(s, 'stone_pickaxe', 1)
    return spareStep(s) ?? stickStock(s) ?? obtain(s, 'iron_pickaxe', 1)
  }
  return spareStep(s) ?? gather(s, 'diamond')
}

module.exports = { nextAction, DEFAULT_PARAMS, SOURCES, GROUPS }
