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

const DEFAULT_PARAMS = { branchY: -58, spacing: 3, tunnelLength: 32, returnAt: 5, woodStock: 6, fleeHealth: 14 }

const count = (s, item) => (GROUPS[item] ?? [item]).reduce((n, name) => n + (s.inv[name] ?? 0), 0)
const has = (s, item) => count(s, item) > 0
const act = (skill, ...args) => ({ skill, args })
const mineAct = (key) => act('mine', SOURCES[key].blocks, SOURCES[key].maxAbove ?? null)

// Planks come from whichever log type is in the inventory.
function concrete(s, item) {
  if (item !== 'planks') return item
  const log = GROUPS.log.find(l => has(s, l))
  return log.replace('_log', '_planks')
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
    return act('explore', { target: source.blocks, mode: 'surface', dir: s.memory.surfaceDir, maxBlocks: 64, maxAbove: source.maxAbove })
  }
  if (source.find === 'dig') return act('dig_down', s.y - 3)
  const y = source.y ?? s.params.branchY
  if (s.y > y + 2) return act('dig_down', y)
  return act('explore', { target: source.blocks, mode: 'branch', ...branchLeg(s) })
}

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
  const target = s.objective.count === 'max' ? Infinity : s.objective.count - s.deposited
  return carried >= Math.min(target, s.params.returnAt)
    || s.freeSlots <= 1
    || (s.food <= 6 && !s.hasFood)
    || (has(s, 'iron_pickaxe') && s.pickLeft < 20)
    || (s.isNight && s.y >= s.surfaceY - 2)
}

function nextAction(s) {
  if (objectiveDone(s)) return null
  if (s.hostileNear && s.health < s.params.fleeHealth) return act('flee')
  if (s.food <= 14 && s.hasFood) return act('eat')
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
    return obtain(s, 'iron_pickaxe', 1)
  }
  return gather(s, 'diamond')
}

module.exports = { nextAction, DEFAULT_PARAMS, SOURCES, GROUPS }
