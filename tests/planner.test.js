const { test } = require('node:test')
const assert = require('node:assert')
const { nextAction, DEFAULT_PARAMS } = require('../bot/planner.js')

const WOODS = ['oak', 'spruce', 'birch']
const sum = (inv, names) => names.reduce((n, k) => n + (inv[k] ?? 0), 0)
const PLANKS = WOODS.map(w => `${w}_planks`)
const STONES = ['cobblestone', 'cobbled_deepslate']

function state(over = {}) {
  return {
    inv: {}, health: 20, food: 20, hasFood: false, y: 70, surfaceY: 70, isNight: false, hostileNear: false, canShelter: false, animalNear: false,
    visible: {}, tableNear: false, furnaceNear: false, freeSlots: 30, pickLeft: 0,
    home: { x: 0, y: 70, z: 0 }, distHome: 0, objective: { item: 'diamond', count: 'max' }, deposited: 0,
    params: DEFAULT_PARAMS, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0 },
    ...over,
  }
}

// Independent ground truth: what one craft of each item consumes.
function craftable(s, item) {
  const table = s.tableNear || (s.inv.crafting_table ?? 0) > 0
  const planks = Math.max(...PLANKS.map(k => s.inv[k] ?? 0)) // recipes take a single plank type
  const sticks = s.inv.stick ?? 0
  if (item.endsWith('_planks')) return (s.inv[item.replace('_planks', '_log')] ?? 0) >= 1
  switch (item) {
    case 'stick': return planks >= 2
    case 'crafting_table': return planks >= 4
    case 'wooden_pickaxe': return table && planks >= 3 && sticks >= 2
    case 'stone_pickaxe': return table && sum(s.inv, STONES) >= 3 && sticks >= 2
    case 'iron_pickaxe': return table && (s.inv.iron_ingot ?? 0) >= 3 && sticks >= 2
    case 'furnace': return table && sum(s.inv, STONES) >= 8
    default: return false
  }
}

function randomState(rand) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)]
  const inv = {}
  const items = [...WOODS.map(w => `${w}_log`), ...PLANKS, 'stick', 'crafting_table', 'cobblestone', 'cobbled_deepslate',
    'raw_iron', 'iron_ingot', 'coal', 'furnace', 'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond']
  for (const item of items) if (rand() < 0.3) inv[item] = 1 + Math.floor(rand() * 9)
  const vis = {}
  for (const k of ['log', 'stone', 'raw_iron', 'coal', 'diamond']) vis[k] = rand() < 0.3
  return state({
    inv, visible: vis, y: pick([80, 16, -58]), tableNear: rand() < 0.2, furnaceNear: rand() < 0.2,
    health: pick([4, 20]), hostileNear: rand() < 0.1, isNight: rand() < 0.3, distHome: pick([0, 200]),
  })
}

test('test_planner_order', () => {
  let seed = 42
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31 }
  const seen = new Set()
  for (let i = 0; i < 5000; i++) {
    const s = randomState(rand)
    const a = nextAction(s)
    if (!a) continue
    seen.add(a.skill)
    if (a.skill === 'craft') assert.ok(craftable(s, a.args[0]), `craft ${a.args[0]} with ${JSON.stringify(s.inv)} table=${s.tableNear}`)
    if (a.skill === 'smelt') {
      assert.ok((s.inv.raw_iron ?? 0) >= 1, JSON.stringify(s.inv))
      assert.ok(sum(s.inv, ['coal', ...PLANKS, ...WOODS.map(w => `${w}_log`)]) >= 1, JSON.stringify(s.inv))
      assert.ok(s.furnaceNear || (s.inv.furnace ?? 0) > 0, JSON.stringify(s.inv))
    }
  }
  for (const skill of ['craft', 'smelt', 'mine', 'explore', 'dig_down']) assert.ok(seen.has(skill), `never chose ${skill}`)
})

test('planner: tech tree from nothing', () => {
  assert.deepStrictEqual(nextAction(state({ visible: { log: true } })).skill, 'mine')
  assert.deepStrictEqual(nextAction(state()), { skill: 'explore', args: [{ target: nextAction(state()).args[0].target, mode: 'surface', dir: 0, maxBlocks: 64, maxAbove: 3 }] })
  assert.deepStrictEqual(nextAction(state({ inv: { oak_log: 3 } })), { skill: 'craft', args: ['oak_planks', 4] })
  assert.strictEqual(nextAction(state({ inv: { wooden_pickaxe: 1 }, visible: { stone: true } })).skill, 'mine')
})

test('planner: geared bot goes down and branch-mines', () => {
  const geared = { iron_pickaxe: 1 }
  assert.deepStrictEqual(nextAction(state({ inv: geared })), { skill: 'dig_down', args: [DEFAULT_PARAMS.branchY] })
  assert.strictEqual(nextAction(state({ inv: geared, y: DEFAULT_PARAMS.branchY })).skill, 'explore')
  const mine = nextAction(state({ inv: geared, y: DEFAULT_PARAMS.branchY, visible: { diamond: true } }))
  assert.strictEqual(mine.skill, 'mine')
  assert.ok(mine.args[0].includes('deepslate_diamond_ore'))
})

test('planner: returns and deposits', () => {
  const loaded = { iron_pickaxe: 1, diamond: DEFAULT_PARAMS.returnAt }
  assert.strictEqual(nextAction(state({ inv: loaded, y: -58, distHome: 200 })).skill, 'go_up')
  assert.strictEqual(nextAction(state({ inv: loaded, distHome: 200 })).skill, 'return_home')
  assert.strictEqual(nextAction(state({ inv: loaded, distHome: 2 })).skill, 'deposit')
})

test('planner: safety and objective', () => {
  assert.strictEqual(nextAction(state({ hostileNear: true, health: 6 })).skill, 'flee')
  assert.strictEqual(nextAction(state({ food: 10, hasFood: true })).skill, 'eat')
  assert.strictEqual(nextAction(state({ objective: { item: 'diamond', count: 2 }, deposited: 2 })), null)
  assert.strictEqual(nextAction(state({ objective: { item: 'diamond', count: 2 }, inv: { diamond: 2, iron_pickaxe: 1 }, distHome: 2 })).skill, 'deposit')
})

test('planner: restocks a broken pickaxe from what it carries', () => {
  const s = state({ y: -58, inv: { cobblestone: 3, stick: 4, crafting_table: 1 } })
  assert.deepStrictEqual(nextAction(s), { skill: 'craft', args: ['stone_pickaxe', 1] })
})

test('planner: secures the first diamond and banks before time runs out', () => {
  const geared = { iron_pickaxe: 1, diamond: 1 }
  assert.strictEqual(nextAction(state({ inv: geared, distHome: 200, pickLeft: 100 })).skill, 'return_home')
  const banked = state({ inv: geared, deposited: 1, distHome: 200, y: -58, pickLeft: 100 })
  assert.notStrictEqual(nextAction({ ...banked, y: 70, msLeft: 20 * 60000 }).skill, 'return_home')
  assert.strictEqual(nextAction({ ...banked, y: 70, msLeft: 7 * 60000 }).skill, 'return_home')
  assert.strictEqual(nextAction(state({ inv: { iron_pickaxe: 1 }, deposited: 1, msLeft: 60000, pickLeft: 100 })).skill, 'dig_down')
})

test('planner: flees a hostile that already hurt it, even at full health', () => {
  assert.strictEqual(nextAction(state({ hostileNear: true, recentlyAttacked: true })).skill, 'flee')
  assert.notStrictEqual(nextAction(state({ hostileNear: true })).skill, 'flee')
  assert.notStrictEqual(nextAction(state({ recentlyAttacked: true })).skill, 'flee')
})

test('planner: tosses junk only when the inventory is nearly full', () => {
  assert.strictEqual(nextAction(state({ inv: { dirt: 30 }, freeSlots: 5 })).skill, 'explore')
  assert.deepStrictEqual(nextAction(state({ inv: { dirt: 30 }, freeSlots: 2 })).args[1], 0)
  const stone = nextAction(state({ inv: { cobblestone: 40 }, freeSlots: 1 }))
  assert.deepStrictEqual([stone.skill, stone.args[1]], ['toss', 16])
  assert.notStrictEqual(nextAction(state({ inv: { cobblestone: 16, cobbled_deepslate: 16 }, freeSlots: 1 })).skill, 'toss')
})

test('planner: plank recipes use one plank type', () => {
  const mixed = { oak_planks: 2, birch_planks: 2 }
  assert.deepStrictEqual(nextAction(state({ inv: { ...mixed, oak_log: 1 }, visible: { log: false } })), { skill: 'craft', args: ['oak_planks', 4] })
  assert.deepStrictEqual(nextAction(state({ inv: { oak_planks: 1, birch_planks: 2, birch_log: 1, oak_log: 3 } })).args, ['birch_planks', 4])
})

test('planner: surface search grows with each failed leg and is capped', () => {
  const reach = (surfaceLeg) => nextAction(state({ memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg } })).args[0].maxBlocks
  assert.deepStrictEqual([0, 1, 2, 4, 9].map(reach), [64, 96, 128, 192, 192])
})

test('planner: iron-geared bot crafts spare sticks and a stone pickaxe before descending', () => {
  const geared = { iron_pickaxe: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1 }
  assert.deepStrictEqual(nextAction(state({ inv: geared, y: 16 })), { skill: 'craft', args: ['stick', 4], optional: true })
  assert.deepStrictEqual(nextAction(state({ inv: { ...geared, stick: 6 }, y: 16 })), { skill: 'craft', args: ['stone_pickaxe', 1], optional: true })
  assert.deepStrictEqual(nextAction(state({ inv: { ...geared, oak_planks: 0, oak_log: 1 }, y: 16 })), { skill: 'craft', args: ['oak_planks', 4], optional: true })
})

test('planner: spares are skipped when the materials are not carried', () => {
  const dig = { skill: 'dig_down', args: [DEFAULT_PARAMS.branchY] }
  assert.deepStrictEqual(nextAction(state({ inv: { iron_pickaxe: 1 }, y: 16 })), dig)
  assert.deepStrictEqual(nextAction(state({ inv: { iron_pickaxe: 1, cobblestone: 5, oak_planks: 1 }, y: 16 })), dig)
  const done = { iron_pickaxe: 1, stone_pickaxe: 1, stick: 4, oak_planks: 8, cobblestone: 5 }
  assert.deepStrictEqual(nextAction(state({ inv: done, y: 16, pickLeft: 100 })), dig)
})

const stoneStage = { stone_pickaxe: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1, stick: 8 }

test('planner: a lone stone pickaxe gets a spare before the iron stage, once sticks are stocked', () => {
  assert.deepStrictEqual(nextAction(state({ inv: stoneStage, pickLeft: 100 })), { skill: 'craft', args: ['stone_pickaxe', 1], optional: true })
  const withSpare = nextAction(state({ inv: { ...stoneStage, stone_pickaxe: 2 }, pickLeft: 100 }))
  assert.notStrictEqual(withSpare.optional, true)
})

test('planner: stone is counted as the biggest single stone type', () => {
  const split = { ...stoneStage, cobblestone: 2, cobbled_deepslate: 2 }
  assert.notDeepStrictEqual(nextAction(state({ inv: split, pickLeft: 100 })), { skill: 'craft', args: ['stone_pickaxe', 1], optional: true })
})

test('planner: a worn in-use pickaxe asks for one more spare, but only up to three pickaxes', () => {
  const two = { iron_pickaxe: 1, stone_pickaxe: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1, stick: 2 }
  assert.deepStrictEqual(nextAction(state({ inv: two, y: 16, pickLeft: 10 })), { skill: 'craft', args: ['stone_pickaxe', 1], optional: true })
  assert.strictEqual(nextAction(state({ inv: two, y: 16, pickLeft: 100 })).skill, 'dig_down')
  assert.strictEqual(nextAction(state({ inv: { ...two, wooden_pickaxe: 1 }, y: 16, pickLeft: 10 })).skill, 'dig_down')
})

test('planner: at the surface it stocks eight sticks before the first descent', () => {
  const inv = { stone_pickaxe: 1, wooden_pickaxe: 1, oak_planks: 4, stick: 4 }
  assert.deepStrictEqual(nextAction(state({ inv, pickLeft: 100 })), { skill: 'craft', args: ['stick', 4], optional: true })
  const noWood = nextAction(state({ inv: { stone_pickaxe: 1, wooden_pickaxe: 1, stick: 4 }, pickLeft: 100 }))
  assert.strictEqual(noWood.skill, 'explore')
  assert.strictEqual(noWood.args[0].mode, 'surface')
  const stocked = nextAction(state({ inv: { stone_pickaxe: 1, wooden_pickaxe: 1, stick: 8 }, pickLeft: 100 }))
  assert.strictEqual(stocked.skill, 'dig_down')
})

test('planner: a spare craft that failed twice is not tried again', () => {
  const memory = (n) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: { stone_pickaxe: n } })
  const args = { inv: stoneStage, pickLeft: 100 }
  assert.strictEqual(nextAction(state({ ...args, memory: memory(1) })).optional, true)
  assert.notStrictEqual(nextAction(state({ ...args, memory: memory(2) })).optional, true)
})

test('planner: danger walls the bot in when it carries blocks, otherwise flees', () => {
  const hurt = { hostileNear: true, recentlyAttacked: true }
  assert.deepStrictEqual(nextAction(state({ ...hurt, canShelter: true, memory: { leg: 0, baseDir: 2, surfaceDir: 3, surfaceLeg: 0 } })), { skill: 'shelter', args: [3] })
  assert.deepStrictEqual(nextAction(state({ ...hurt, canShelter: true, y: -58, memory: { leg: 0, baseDir: 2, surfaceDir: 3, surfaceLeg: 0 } })), { skill: 'shelter', args: [2] })
  assert.strictEqual(nextAction(state(hurt)).skill, 'flee')
  assert.strictEqual(nextAction(state({ hostileNear: true, health: 6, canShelter: true })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ hostileNear: true, health: 6, canShelter: true, hasFood: true, food: 4 })).skill, 'eat')
})

test('planner: at night on the surface with a hostile around and nothing to do there, it shelters', () => {
  const night = { hostileNear: true, isNight: true, canShelter: true, inv: { iron_pickaxe: 1 } }
  assert.strictEqual(nextAction(state(night)).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...night, y: 16 })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...night, isNight: false })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...night, hostileNear: false })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...night, inv: {} })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...night, inv: { iron_pickaxe: 1, diamond: 1 }, distHome: 100 })).skill, 'shelter')
})

test('planner: eats from food 17 down, and hunts an animal when hungry with nothing to eat', () => {
  assert.strictEqual(nextAction(state({ food: 17, hasFood: true })).skill, 'eat')
  assert.notStrictEqual(nextAction(state({ food: 18, hasFood: true })).skill, 'eat')
  assert.deepStrictEqual(nextAction(state({ food: 17, animalNear: true })), { skill: 'hunt', args: [], optional: true })
  assert.notStrictEqual(nextAction(state({ food: 18, animalNear: true })).skill, 'hunt')
  assert.notStrictEqual(nextAction(state({ food: 10 })).skill, 'hunt')
  assert.notStrictEqual(nextAction(state({ food: 10, animalNear: true, y: 40 })).skill, 'hunt')
  assert.strictEqual(nextAction(state({ food: 10, animalNear: true, hasFood: true })).skill, 'eat')
})

test('planner: a hunt that failed four times is not tried again', () => {
  const memory = (n) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: { hunt: n } })
  assert.strictEqual(nextAction(state({ food: 10, animalNear: true, memory: memory(3) })).skill, 'hunt')
  assert.notStrictEqual(nextAction(state({ food: 10, animalNear: true, memory: memory(4) })).skill, 'hunt')
})

test('planner: weak on the surface it tops up food before a descent, but only while not full', () => {
  const geared = { iron_pickaxe: 1 }
  assert.strictEqual(nextAction(state({ inv: geared, health: 10, food: 19, hasFood: true })).skill, 'eat')
  assert.strictEqual(nextAction(state({ inv: geared, health: 10, food: 19, animalNear: true })).skill, 'hunt')
  assert.strictEqual(nextAction(state({ inv: geared, health: 10, food: 20, hasFood: true })).skill, 'dig_down')
  assert.strictEqual(nextAction(state({ inv: geared, health: 10, food: 19 })).skill, 'dig_down')
  assert.strictEqual(nextAction(state({ inv: geared, health: 16, food: 19, hasFood: true })).skill, 'dig_down')
})

test('planner: after a drowning abort it climbs a few blocks toward the surface of the water', () => {
  assert.deepStrictEqual(nextAction(state({ drowning: true, y: 30 })), { skill: 'go_up', args: [34] })
  assert.notStrictEqual(nextAction(state({ y: 70 })).skill, 'go_up')
})

test('planner: after repeated shelters it fights a close hostile, flees when weak, and otherwise keeps working', () => {
  const memory = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, noShelter: 3 }
  const hurt = { hostileNear: true, recentlyAttacked: true, canShelter: true, memory }
  assert.strictEqual(nextAction(state({ ...hurt, hostileClose: true })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...hurt, hostileClose: true, health: 7 })).skill, 'flee')
  assert.ok(!['shelter', 'flee', 'fight'].includes(nextAction(state(hurt)).skill))
  assert.strictEqual(nextAction(state({ ...hurt, memory: { ...memory, noShelter: 0 }, hostileClose: true })).skill, 'shelter')
})
