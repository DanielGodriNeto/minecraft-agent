const { test } = require('node:test')
const assert = require('node:assert')
const { nextAction, DEFAULT_PARAMS, RESERVE, normalizeParams, walkAfter } = require('../bot/planner.js')

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
    case 'chest': return table && planks >= 8
    case 'wooden_pickaxe': return table && planks >= 3 && sticks >= 2
    case 'stone_pickaxe': return table && sum(s.inv, STONES) >= 3 && sticks >= 2
    case 'iron_pickaxe': return table && (s.inv.iron_ingot ?? 0) >= 3 && sticks >= 2
    case 'stone_sword': return table && sum(s.inv, STONES) >= 2 && sticks >= 1
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
  assert.deepStrictEqual([stone.skill, stone.args[1]], ['toss', 32])
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
  const geared = { iron_pickaxe: 1, stone_sword: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1 }
  assert.deepStrictEqual(nextAction(state({ inv: geared, y: 16 })), { skill: 'craft', args: ['stick', 4], optional: true })
  assert.deepStrictEqual(nextAction(state({ inv: { ...geared, stick: 6 }, y: 16 })), { skill: 'craft', args: ['stone_pickaxe', 1], optional: true })
  assert.deepStrictEqual(nextAction(state({ inv: { ...geared, oak_planks: 0, oak_log: 1 }, y: 16 })), { skill: 'craft', args: ['oak_planks', 4], optional: true })
})

test('planner: spares are skipped when the materials are not carried', () => {
  const dig = { skill: 'dig_down', args: [DEFAULT_PARAMS.branchY] }
  assert.deepStrictEqual(nextAction(state({ inv: { iron_pickaxe: 1 }, y: 16 })), dig)
  assert.deepStrictEqual(nextAction(state({ inv: { iron_pickaxe: 1, cobblestone: 5, oak_planks: 1 }, y: 16 })), dig)
  const done = { iron_pickaxe: 1, stone_pickaxe: 1, stone_sword: 1, stick: 4, oak_planks: 8, cobblestone: 5 }
  assert.deepStrictEqual(nextAction(state({ inv: done, y: 16, pickLeft: 100 })), dig)
})

const stoneStage = { stone_pickaxe: 1, stone_sword: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1, stick: 8 }

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
  const two = { iron_pickaxe: 1, stone_pickaxe: 1, stone_sword: 1, oak_planks: 8, cobblestone: 5, crafting_table: 1, stick: 2 }
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
  assert.strictEqual(nextAction(state({ ...hurt, memory: { ...memory, noShelter: 0 }, hostileClose: true, health: 7 })).skill, 'shelter')
})

test('planner: after a failed dig_down the bot relocates before digging again, on the surface and underground', () => {
  const geared = { iron_pickaxe: 1, stone_pickaxe: 1, stick: 8 }
  const memory = (digFails, relocations = 0) => ({ leg: 0, baseDir: 1, surfaceDir: 2, surfaceLeg: 0, digFails, relocations })
  assert.strictEqual(nextAction(state({ inv: geared, memory: memory(0) })).skill, 'dig_down')
  const hop = nextAction(state({ inv: geared, memory: memory(1, 1) }))
  assert.deepStrictEqual([hop.skill, hop.relocate, hop.args[0].mode, hop.args[0].dir, hop.args[0].maxBlocks], ['explore', true, 'surface', 3, 8])
  const branch = nextAction(state({ inv: geared, y: 0, memory: memory(1) }))
  assert.deepStrictEqual([branch.skill, branch.relocate, branch.args[0].mode, branch.args[0].dir, branch.args[0].maxBlocks], ['explore', true, 'branch', 2, 8])
})

test('planner: after a failed relocation hop underground the bot climbs to the surface, then hops from there', () => {
  const geared = { iron_pickaxe: 1, stone_pickaxe: 1, stick: 8 }
  const memory = { leg: 0, baseDir: 1, surfaceDir: 2, surfaceLeg: 0, digFails: 1, relocations: 1, relocFailed: true }
  assert.deepStrictEqual(nextAction(state({ inv: geared, y: 0, memory })), { skill: 'go_up', args: [70], key: 'reloc_up' })
  const hop = nextAction(state({ inv: geared, y: 0, memory: { ...memory, relocFailed: false } }))
  assert.deepStrictEqual([hop.skill, hop.relocate], ['explore', true])
  assert.strictEqual(nextAction(state({ inv: geared, memory })).relocate, true)
})

test('planner: a hostile within fighting range is fought before sheltering or fleeing', () => {
  const close = { hostileNear: true, hostileClose: true, canShelter: true }
  assert.strictEqual(nextAction(state(close)).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...close, recentlyAttacked: true })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...close, health: 8 })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...close, health: 7 })).skill, 'shelter')
  assert.strictEqual(nextAction(state({ hostileNear: true, hostileClose: true, health: 7 })).skill, 'flee')
  assert.strictEqual(nextAction(state({ ...close, hostileClose: false, recentlyAttacked: true })).skill, 'shelter')
})

test('planner: a stone sword follows the stone pickaxe when stone and a stick are at hand', () => {
  const armed = { stone_pickaxe: 1, wooden_pickaxe: 1, stick: 8, crafting_table: 1 }
  assert.deepStrictEqual(nextAction(state({ inv: { ...armed, cobblestone: 2 } })), { skill: 'craft', args: ['stone_sword', 1], optional: true })
  assert.strictEqual(nextAction(state({ inv: { ...armed, cobblestone: 1 }, visible: { stone: true } })).skill, 'mine')
  assert.notStrictEqual(nextAction(state({ inv: { ...armed, cobblestone: 1 } })).args[0], 'stone_sword')
  assert.notStrictEqual(nextAction(state({ inv: { ...armed, cobblestone: 2, stone_sword: 1 } })).args[0], 'stone_sword')
  assert.notStrictEqual(nextAction(state({ inv: { ...armed, cobblestone: 2, iron_sword: 1 } })).args[0], 'stone_sword')
  const failed = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: { stone_sword: 2 } }
  assert.notStrictEqual(nextAction(state({ inv: { ...armed, cobblestone: 2 }, memory: failed })).args[0], 'stone_sword')
})

test('planner: enclosed in a sealed cell, a close hostile is ignored', () => {
  assert.notStrictEqual(nextAction(state({ hostileNear: true, hostileClose: true, enclosed: true })).skill, 'fight')
})

const night = { isNight: true, canShelter: true }
const shaft = (s) => nextAction(state({ ...night, ...s }))

test('planner: at night on the surface it digs a short shaft, by hand without a pickaxe', () => {
  assert.deepStrictEqual(shaft({ inv: { wooden_pickaxe: 1 } }), { skill: 'dig_down', args: [66], key: 'night_dig' })
  assert.deepStrictEqual(shaft({ inv: {} }), { skill: 'dig_down', args: [67], key: 'night_dig' })
  assert.notStrictEqual(shaft({ isNight: false, inv: {} }).skill, 'dig_down')
})

test('planner: the night shaft is skipped with the iron pickaxe when nightSurf is off, with diamonds, failed digs or too many earlier shafts', () => {
  assert.strictEqual(shaft({ inv: { iron_pickaxe: 1 }, params: { ...DEFAULT_PARAMS, nightSurf: false } }).key, undefined)
  assert.strictEqual(shaft({ inv: { diamond: 1, stone_pickaxe: 1 }, distHome: 200 }).key, undefined)
  const memory = (extra) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, ...extra })
  assert.notStrictEqual(shaft({ inv: {}, memory: memory({ digFails: 2 }) }).key, 'night_dig')
  assert.notStrictEqual(shaft({ inv: {}, memory: memory({ nightDigs: 6 }) }).key, 'night_dig')
})

test('planner: in the night shaft it seals in until dawn, unless it cannot, has failed too often, or is deep', () => {
  assert.deepStrictEqual(shaft({ y: 65 }), { skill: 'shelter', args: [0, 'dawn'], optional: true, key: 'dawn' })
  assert.deepStrictEqual(shaft({ y: 65, memory: { leg: 0, baseDir: 0, surfaceDir: 3, surfaceLeg: 0 } }).args, [3, 'dawn'])
  assert.notStrictEqual(shaft({ y: 65, canShelter: false }).skill, 'shelter')
  assert.notStrictEqual(shaft({ y: 65, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: { dawn: 4 } } }).skill, 'shelter')
  assert.notStrictEqual(shaft({ y: 40 }).skill, 'shelter')
  assert.notStrictEqual(shaft({ y: 65, isNight: false }).skill, 'shelter')
})

test('planner: with diamonds underground at night it waits for dawn before the trip home, unless time is short', () => {
  const loaded = { inv: { iron_pickaxe: 1, diamond: 1 }, y: -58, distHome: 200 }
  assert.deepStrictEqual(shaft(loaded).args, [0, 'dawn'])
  assert.strictEqual(shaft({ ...loaded, msLeft: 10 * 60000 }).skill, 'go_up')
  assert.strictEqual(shaft({ ...loaded, isNight: false }).skill, 'go_up')
  assert.strictEqual(shaft({ ...loaded, canShelter: false }).skill, 'go_up')
  assert.strictEqual(shaft({ ...loaded, distHome: 2, y: 60 }).skill, 'deposit')
})

test('planner: hurt and alone underground it rests sealed in, once fed', () => {
  const hurt = { health: 5, y: 40, canShelter: true, inv: { iron_pickaxe: 1 } }
  assert.deepStrictEqual(nextAction(state(hurt)), { skill: 'shelter', args: [0, 'rest'], optional: true, key: 'rest' })
  assert.notStrictEqual(nextAction(state({ ...hurt, health: 8 })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...hurt, y: 70 })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...hurt, canShelter: false })).skill, 'shelter')
  assert.notStrictEqual(nextAction(state({ ...hurt, food: 16 })).skill, 'shelter')
  assert.strictEqual(nextAction(state({ ...hurt, food: 16, hasFood: true })).skill, 'eat')
  assert.notStrictEqual(nextAction(state({ ...hurt, hostileNear: true })).args?.[1], 'rest')
})

test('planner: a dig_down that failed for lack of a tool crafts the best pickaxe it can before retrying', () => {
  const memory = (extra) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, digFails: 1, lastDigReason: 'no_tool', ...extra })
  const table = { crafting_table: 1, stick: 2 }
  const upgraded = (inv, extra) => nextAction(state({ inv: { iron_pickaxe: 0, ...inv }, y: 16, memory: memory(extra) }))
  assert.deepStrictEqual(upgraded({ ...table, cobblestone: 3 }), { skill: 'craft', args: ['stone_pickaxe', 1], key: 'upgrade' })
  assert.deepStrictEqual(upgraded({ ...table, oak_planks: 3 }), { skill: 'craft', args: ['wooden_pickaxe', 1], key: 'upgrade' })
  assert.deepStrictEqual(upgraded({ ...table, cobblestone: 3, iron_ingot: 3 }).args, ['iron_pickaxe', 1])
  assert.notStrictEqual(upgraded({ ...table, stone_pickaxe: 1, cobblestone: 3 }).key, 'upgrade')
  assert.notStrictEqual(upgraded({ ...table, cobblestone: 3 }, { lastDigReason: 'blocked' }).key, 'upgrade')
  assert.notStrictEqual(upgraded({ ...table, cobblestone: 3 }, { digFails: 0 }).key, 'upgrade')
})

test('planner: after repeated branch hazards it climbs a few blocks before mining on', () => {
  const deep = { inv: { iron_pickaxe: 1 }, y: DEFAULT_PARAMS.branchY }
  const memory = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, hazardUp: true }
  assert.deepStrictEqual(nextAction(state({ ...deep, memory })), { skill: 'go_up', args: [DEFAULT_PARAMS.branchY + 4], key: 'hazard_up' })
  assert.strictEqual(nextAction(state({ ...deep, memory: { ...memory, hazardUp: false } })).skill, 'explore')
})

test('planner: without a pickaxe or wood the bot looks for logs instead of digging down', () => {
  const action = nextAction(state({ inv: { dirt: 20 }, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, digFails: 1, lastDigReason: 'no_tool' } }))
  assert.deepStrictEqual([action.skill, action.args[0].mode], ['explore', 'surface'])
})

// Reserve kit: backup materials held before a descent, restocked from what is close, never at the cost of a stuck loop.
const kit = { iron_pickaxe: 1, stone_sword: 1, stone_pickaxe: 1, oak_planks: 16, cobblestone: 32, chest: 1, stick: 8 }
const reserved = (over = {}) => state({ inv: kit, foodCount: 6, pickLeft: 100, ...over })
const nearby = { visible: { log: true, stone: true }, animalNear: true }
const memoryWith = (restock) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, restock })

test('reserve: a full kit goes straight to the descent', () => {
  assert.strictEqual(nextAction(reserved({ ...nearby })).skill, 'dig_down')
})

test('reserve: each missing item schedules its restock, wood first then chest, stone, food', () => {
  const everything = { ...nearby, foodCount: 0 }
  const missing = { iron_pickaxe: 1, stone_sword: 1, stone_pickaxe: 1, stick: 8 }
  const first = (inv, over = {}) => nextAction(state({ inv, pickLeft: 100, ...everything, ...over }))
  assert.deepStrictEqual([first(missing).skill, first(missing).restock], ['mine', 'planks'])
  const withWood = { ...missing, oak_planks: 16 }
  assert.deepStrictEqual([first(withWood, { tableNear: true }).skill, first(withWood, { tableNear: true }).args[0], first(withWood, { tableNear: true }).restock], ['craft', 'chest', 'chest'])
  const withChest = { ...withWood, chest: 1 }
  assert.deepStrictEqual([first(withChest).skill, first(withChest).restock], ['mine', 'stone'])
  const withStone = { ...withChest, cobblestone: 32 }
  assert.deepStrictEqual([first(withStone).skill, first(withStone).restock], ['hunt', 'food'])
  assert.strictEqual(first({ ...withStone }, { foodCount: 6 }).skill, 'dig_down')
})

test('reserve: logs count as four planks each', () => {
  const inv = { ...kit, oak_planks: 0, oak_log: 4 }
  assert.strictEqual(nextAction(reserved({ inv, ...nearby })).skill, 'dig_down')
})

test('reserve: an item that failed twice, or used its step budget, is skipped and the descent goes on', () => {
  const s = (restock) => reserved({ ...nearby, foodCount: 0, inv: { ...kit, cobblestone: 0, oak_planks: 16 }, memory: memoryWith(restock) })
  assert.strictEqual(nextAction(s({ stone: { steps: 1, fails: 1 } })).restock, 'stone')
  assert.strictEqual(nextAction(s({ stone: { steps: 2, fails: 2 }, food: { steps: 12, fails: 0 } })).skill, 'dig_down')
})

test('reserve: failures across different items cap the whole visit so the stuck tracker never trips', () => {
  const s = (restock) => reserved({ ...nearby, foodCount: 0, inv: { ...kit, cobblestone: 0 }, memory: memoryWith(restock) })
  assert.strictEqual(nextAction(s({ stone: { steps: 1, fails: 1 } })).restock, 'stone')
  assert.strictEqual(nextAction(s({ stone: { steps: 1, fails: 1 }, food: { steps: 1, fails: 1 } })).skill, 'dig_down')
})

test('reserve: nothing obtainable nearby still descends', () => {
  const s = state({ inv: { iron_pickaxe: 1, stone_sword: 1 }, foodCount: 0 })
  assert.strictEqual(nextAction(s).skill, 'dig_down')
})

test('reserve: no restock with a hostile near, at night, underground, or before the iron pickaxe', () => {
  const missing = { inv: { iron_pickaxe: 1 }, foodCount: 0, ...nearby }
  assert.strictEqual(nextAction(state({ ...missing })).restock, 'planks')
  assert.notStrictEqual(nextAction(state({ ...missing, hostileNear: true })).restock, 'planks')
  assert.notStrictEqual(nextAction(state({ ...missing, isNight: true })).restock, 'planks')
  assert.strictEqual(nextAction(state({ ...missing, y: 20 })).restock, undefined)
  assert.strictEqual(nextAction(state({ ...missing, inv: { stone_pickaxe: 1 } })).restock, undefined)
})

test('reserve: tossing never cuts stone below the reserve, and a deposit only carries diamonds', () => {
  const toss = nextAction(state({ inv: { cobblestone: 40 }, freeSlots: 1 }))
  assert.deepStrictEqual([toss.skill, toss.args[1]], ['toss', RESERVE.stone])
  assert.notStrictEqual(nextAction(state({ inv: { cobblestone: RESERVE.stone }, freeSlots: 1 })).skill, 'toss')
  assert.deepStrictEqual(nextAction(state({ inv: { diamond: 1, chest: 1, cobblestone: 64 }, distHome: 1 })), { skill: 'deposit', args: [{ x: 0, y: 70, z: 0 }] })
})

test('DEFAULT_PARAMS carries the shaft arm and jitterParams leaves it alone', () => {
  const { jitterParams } = require('../bot/agent.js')
  assert.strictEqual(typeof DEFAULT_PARAMS.shaft, 'boolean')
  assert.strictEqual(jitterParams(() => 0.99).shaft, DEFAULT_PARAMS.shaft)
})

const ironNight = { isNight: true, canShelter: true, msLeft: 3600000, inv: { iron_pickaxe: 1, stone_pickaxe: 1, stick: 8 } }
const nightSurf = (over, on = true) => nextAction(state({ ...ironNight, ...over, params: { ...DEFAULT_PARAMS, nightSurf: on } }))

test('nightSurf: with the iron pickaxe at night the surface bot digs in instead of crossing open ground', () => {
  assert.strictEqual(nightSurf({}).key, 'night_dig')
  assert.notStrictEqual(nightSurf({}, false).key, 'night_dig')
})

test('nightSurf: a hop needed at the surface at night waits for dawn sealed in; a late deadline or no blocks skips the wait', () => {
  const stuck = { memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, digFails: 1 } }
  assert.deepStrictEqual([nightSurf(stuck).skill, nightSurf(stuck).args[1]], ['shelter', 'dawn'])
  assert.strictEqual(nightSurf({ ...stuck, msLeft: 10 * 60000 }).relocate, true)
  assert.strictEqual(nightSurf({ ...stuck, canShelter: false }).relocate, true)
  assert.strictEqual(nightSurf(stuck, false).relocate, true)
})

test('nightSurf: underground with the iron pickaxe the bot keeps descending, and does not hunt on the surface at night', () => {
  assert.strictEqual(nightSurf({ y: 62 }).skill, 'dig_down')
  const hungry = { food: 10, animalNear: true }
  assert.notStrictEqual(nightSurf(hungry).skill, 'hunt')
  assert.strictEqual(nightSurf(hungry, false).skill, 'hunt')
})

test('DEFAULT_PARAMS carries the night and food arms and jitterParams leaves them alone', () => {
  const { jitterParams } = require('../bot/agent.js')
  for (const key of ['nightSurf', 'foodGate']) {
    assert.strictEqual(typeof DEFAULT_PARAMS[key], 'boolean')
    assert.strictEqual(jitterParams(() => 0.99)[key], DEFAULT_PARAMS[key])
  }
})

const geared = { stone_pickaxe: 1, stick: 8, cobblestone: 32 } // no iron yet: the reserve step is out of play, so only the gate can hunt
const gate = (over, on = true) => nextAction(state({ inv: geared, msLeft: 3600000, params: { ...DEFAULT_PARAMS, foodGate: on }, ...over }))

test('foodGate: no descent with fewer than four food items while an animal can still be hunted', () => {
  const hunt = gate({ foodCount: 3, animalNear: true })
  assert.deepStrictEqual([hunt.skill, hunt.restock], ['hunt', 'food'])
  assert.strictEqual(gate({ foodCount: 4, animalNear: true }).skill, 'dig_down')
  assert.strictEqual(gate({ foodCount: 3, animalNear: true }, false).skill, 'dig_down')
  assert.strictEqual(gate({ foodCount: 0, animalNear: false }).skill, 'dig_down') // nothing to hunt: go anyway
  assert.strictEqual(gate({ foodCount: 3, animalNear: true, isNight: true }).skill, 'dig_down')
})

test('foodGate: the hunt gives up after MAX_HUNT_FAILS or two restock failures instead of looping', () => {
  const base = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0 }
  const huntFailed = { ...base, optionalFails: { hunt: 4 } }
  assert.strictEqual(gate({ foodCount: 0, animalNear: true, memory: huntFailed }).skill, 'dig_down')
  const restockFailed = { ...base, restock: { food: { steps: 2, fails: 2 } } }
  assert.strictEqual(gate({ foodCount: 0, animalNear: true, memory: restockFailed }).skill, 'dig_down')
})

test('foodGate: hurt and hungry without food does not climb or rest (regeneration needs food >= 18)', () => {
  const hurt = { health: 6, food: 12, hasFood: false, foodCount: 0, canShelter: true }
  assert.notStrictEqual(gate({ ...hurt, y: 40 }).skill, 'go_up')
  assert.notStrictEqual(gate(hurt).args?.[1], 'rest')
})

test('reserve: the switch off skips the restock', () => {
  const p = { ...DEFAULT_PARAMS, reserve: false, foodGate: false }
  const s = { inv: { iron_pickaxe: 1 }, pickLeft: 100, foodCount: 0, ...nearby }
  assert.strictEqual(nextAction(state({ ...s })).restock, 'planks')
  assert.strictEqual(nextAction(state({ ...s, params: p })).restock, undefined)
})

test('planner: FIGHT_HEALTH matches the skill-side FIGHT_MIN_HEALTH', () => {
  assert.strictEqual(require('../bot/planner.js').FIGHT_HEALTH, require('../bot/skills.js').FIGHT_MIN_HEALTH)
})

test('planner: after MAX_FIGHT_FAILS failed fights in a row the mob counts as unreachable and is not fought again', () => {
  const { MAX_FIGHT_FAILS } = require('../bot/planner.js')
  const near = { hostileNear: true, hostileClose: true }
  const memory = (fightFails) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, fightFails })
  assert.strictEqual(nextAction(state({ ...near, memory: memory(MAX_FIGHT_FAILS - 1) })).skill, 'fight')
  assert.notStrictEqual(nextAction(state({ ...near, memory: memory(MAX_FIGHT_FAILS) })).skill, 'fight')
  const threatened = state({ ...near, recentlyAttacked: true, canShelter: true, memory: memory(MAX_FIGHT_FAILS) })
  assert.strictEqual(nextAction(threatened).skill, 'shelter')
  const standing = state({ ...near, recentlyAttacked: true, canShelter: true, memory: { ...memory(MAX_FIGHT_FAILS), noShelter: 3 } })
  assert.notStrictEqual(nextAction(standing).skill, 'fight')
})

test('planner: after a burning abort underground it climbs (bounded per life); at the surface or once spent it does not', () => {
  const memory = (burnUps) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, burnUps })
  const burnt = { recentlyBurned: true, y: 30, inv: { iron_pickaxe: 1 } }
  const up = nextAction(state({ ...burnt, memory: memory(0) }))
  assert.deepStrictEqual([up.skill, up.args[0], up.key], ['go_up', 34, 'burn_up'])
  assert.notStrictEqual(nextAction(state({ ...burnt, memory: memory(2) })).key, 'burn_up')
  assert.notStrictEqual(nextAction(state({ ...burnt, y: 70, memory: memory(0) })).key, 'burn_up')
})

test('crowdFlee: two or more hostiles in reach and too few blocks to seal in -> flee, capped per life; blocks, a lone mob or the switch off keep the old behaviour', () => {
  const crowd = { hostileNear: true, hostileClose: true, hostileCount: 3, canShelter: false, health: 20, isNight: true }
  const fled = nextAction(state(crowd))
  assert.deepStrictEqual([fled.skill, fled.key], ['flee', 'crowd_flee'])
  assert.strictEqual(nextAction(state({ ...crowd, canShelter: true })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...crowd, hostileCount: 1 })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...crowd, params: { ...DEFAULT_PARAMS, crowdFlee: false } })).skill, 'fight')
  assert.strictEqual(nextAction(state({ ...crowd, memory: { ...state().memory, crowdFlees: 3 } })).skill, 'fight')
})

test('nightAscent: a deep bot carrying a diamond keeps mining while its predicted surface arrival falls in the dangerous window', () => {
  const { ASCENT_MARGIN_MS, MAX_ASCENT_DELAY_MS } = require('../bot/planner.js')
  const deep = { y: 20, surfaceY: 70, inv: { iron_pickaxe: 1, diamond: 1 }, msLeft: 40 * 60000, canShelter: false, distHome: 100 }
  const at = (timeOfDay, over = {}) => nextAction(state({ ...deep, timeOfDay, isNight: timeOfDay >= 13000 && timeOfDay < 23000, ...over }))
  assert.notStrictEqual(at(10000).skill, 'go_up') // 2700 ticks up: arrives at 12700, dark
  assert.notStrictEqual(at(20000).skill, 'go_up') // arrives 22700, dark
  assert.strictEqual(at(8000).skill, 'go_up') // arrives 10700, day
  assert.strictEqual(at(21000).skill, 'go_up') // arrives 23700, day
  assert.strictEqual(at(10000, { params: { ...DEFAULT_PARAMS, nightAscent: false } }).skill, 'go_up')
  assert.strictEqual(at(10000, { y: 60 }).skill, 'go_up') // shallow: not deep enough to bother
  assert.strictEqual(at(10000, { msLeft: 135000 + ASCENT_MARGIN_MS - 1 }).skill, 'go_up')
  assert.strictEqual(at(10000, { memory: { ...state().memory, ascentDelayMs: MAX_ASCENT_DELAY_MS } }).skill, 'go_up')
  for (const bad of [{ health: 8 }, { food: 4, hasFood: false }, { hostileNear: true }, { recentlyAttacked: true }, { freeSlots: 1 }]) {
    assert.ok(!['dig_down', 'explore'].includes(at(10000, bad).skill), JSON.stringify(bad))
  }
})

test('branchRelocate: after 12 not_found diamond branch explores one 40-block hop sideways, capped at 2 per life', () => {
  const { remember } = require('../bot/agent.js')
  const { SOURCES } = require('../bot/planner.js')
  const memory = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {}, restock: {} }
  const run = { memory }
  const deep = () => state({ y: -58, inv: { iron_pickaxe: 1 }, memory })
  const hops = []
  for (let i = 0; i < 80; i++) {
    const action = nextAction(deep())
    assert.strictEqual(action.skill, 'explore')
    if (action.key === 'branch_relocate') hops.push(i)
    remember(run, action, { ok: false, reason: 'not_found' })
  }
  assert.deepStrictEqual(hops, [12, 25]) // 12 misses, the hop, 12 more, the hop, then never again
  const hop = nextAction(state({ y: -58, inv: { iron_pickaxe: 1 }, memory: { ...memory, branchMisses: 12, branchRelocs: 0 } }))
  assert.deepStrictEqual([hop.args[0].mode, hop.args[0].dir, hop.args[0].maxBlocks, hop.args[0].target], ['branch', 1, 40, SOURCES.diamond.blocks])
  const off = { ...deep(), params: { ...DEFAULT_PARAMS, branchRelocate: false }, memory: { ...memory, branchMisses: 12, branchRelocs: 0 } }
  assert.notStrictEqual(nextAction(off).key, 'branch_relocate')
  remember(run, { skill: 'explore', args: [{ mode: 'branch', target: SOURCES.diamond.blocks }] }, { ok: true })
  assert.strictEqual(memory.branchMisses, 0) // a find resets the count
})

test('lingerUnderground: needs a carried diamond; lingerHeldReturn only when it blocked a return', () => {
  const { lingerUnderground, lingerHeldReturn, MAX_ASCENT_DELAY_MS } = require('../bot/planner.js')
  const dark = { y: 20, surfaceY: 70, timeOfDay: 10000, msLeft: 40 * 60000, canShelter: false }
  const withDiamond = state({ ...dark, inv: { iron_pickaxe: 1, diamond: 1 } })
  const noDiamond = state({ ...dark, inv: { iron_pickaxe: 1 } })
  assert.strictEqual(lingerUnderground(noDiamond), false)
  assert.strictEqual(lingerHeldReturn(noDiamond), false)
  assert.strictEqual(lingerUnderground(withDiamond), true)
  assert.strictEqual(lingerHeldReturn(withDiamond), true) // first diamond: it would have gone up
  const banked = { ...withDiamond, deposited: 1, pickLeft: 1000 }
  assert.strictEqual(lingerUnderground(banked), true)
  assert.strictEqual(lingerHeldReturn(banked), false) // nothing wanted to return anyway
  const spent = { ...withDiamond, memory: { ...withDiamond.memory, ascentDelayMs: MAX_ASCENT_DELAY_MS } }
  assert.strictEqual(lingerUnderground(spent), false)
})

test('earlyBank: off by default; on, the first diamond is never lingered on, later ones still are', () => {
  const { lingerUnderground } = require('../bot/planner.js')
  if (process.env.EARLYBANK !== '1') assert.strictEqual(DEFAULT_PARAMS.earlyBank, false)
  assert.strictEqual(normalizeParams({ earlyBank: 1 }).earlyBank, true)
  const dark = { y: 20, surfaceY: 70, timeOfDay: 10000, msLeft: 40 * 60000, canShelter: false, inv: { iron_pickaxe: 1, diamond: 1 } }
  const withParams = (earlyBank, over = {}) => state({ ...dark, ...over, params: { ...DEFAULT_PARAMS, earlyBank } })
  assert.strictEqual(lingerUnderground(withParams(false)), true)
  assert.strictEqual(lingerUnderground(withParams(true)), false)
  assert.notStrictEqual(nextAction(withParams(true))?.skill, 'mine')
  assert.strictEqual(lingerUnderground(withParams(true, { deposited: 1, pickLeft: 1000 })), true)
})

test('spawnEscape: off by default; on, a wood-less tool-less bot walks 64 blocks in a new direction each time after 2 failures, capped at 3', () => {
  const { remember } = require('../bot/agent.js')
  if (process.env.SPAWNESCAPE !== '1') assert.strictEqual(DEFAULT_PARAMS.spawnEscape, false)
  assert.strictEqual(normalizeParams({ spawnEscape: 1 }).spawnEscape, true)
  const on = { ...DEFAULT_PARAMS, spawnEscape: true }
  const memory = { leg: 0, baseDir: 0, surfaceDir: 1, surfaceLeg: 0, failSigs: {}, optionalFails: {}, restock: {} }
  const run = { memory }
  const bad = (over = {}) => state({ y: 60, params: on, memory, ...over })
  assert.notStrictEqual(nextAction(bad()).key, 'spawn_escape') // no failures yet
  const goUp = { skill: 'go_up', args: [70] }
  remember(run, goUp, { ok: false, reason: 'not_reached' })
  assert.notStrictEqual(nextAction(bad()).key, 'spawn_escape')
  remember(run, goUp, { ok: false, reason: 'not_reached' })
  assert.notStrictEqual(nextAction(bad({ params: DEFAULT_PARAMS })).key, 'spawn_escape') // off
  assert.notStrictEqual(nextAction(bad({ inv: { oak_log: 1 } })).key, 'spawn_escape') // has wood
  assert.notStrictEqual(nextAction(bad({ inv: { wooden_pickaxe: 1 } })).key, 'spawn_escape') // has a tool
  const dirs = []
  for (let i = 0; i < 5; i++) {
    const action = nextAction(bad())
    if (action.key !== 'spawn_escape') break
    assert.strictEqual(action.args[0].maxBlocks, 64)
    dirs.push(action.args[0].dir)
    remember(run, action, { ok: false, reason: 'not_found' })
  }
  assert.deepStrictEqual(dirs, [3, 0, 1]) // opposite surfaceDir first, then rotating, never repeating
  assert.notStrictEqual(nextAction(bad()).key, 'spawn_escape')
  const fresh = { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 2, failSigs: {}, optionalFails: {}, restock: {} } // failed searches alone also trigger it
  const found = nextAction(state({ y: 60, params: on, memory: fresh }))
  assert.strictEqual(found.key, 'spawn_escape')
  remember({ memory: fresh }, found, { ok: true })
  assert.strictEqual(fresh.surfaceLeg, 0) // success clears the trigger counters
})

test('spawnWalk: off by default; on, one heading is kept in 56-block legs, sidestepping a blocked leg, until a log is seen or a cap is hit', () => {
  const { remember } = require('../bot/agent.js')
  if (process.env.SPAWNWALK !== '1') assert.strictEqual(DEFAULT_PARAMS.spawnWalk, false)
  assert.strictEqual(normalizeParams({ spawnWalk: 1 }).spawnWalk, true)
  const on = { ...DEFAULT_PARAMS, spawnWalk: true }
  const memory = { leg: 0, baseDir: 0, surfaceDir: 1, surfaceLeg: 0, failSigs: {}, optionalFails: {}, restock: {} }
  const run = { memory }
  const bad = (over = {}) => state({ y: 60, params: on, memory, now: 0, ...over })
  const goUp = { skill: 'go_up', args: [70] }
  remember(run, goUp, { ok: false, reason: 'not_reached' })
  assert.notStrictEqual(nextAction(bad()).key, 'spawn_walk') // one failure is not enough
  remember(run, goUp, { ok: false, reason: 'not_reached' })
  assert.notStrictEqual(nextAction(bad({ params: DEFAULT_PARAMS })).key, 'spawn_walk') // off
  assert.notStrictEqual(nextAction(bad({ inv: { oak_log: 1 } })).key, 'spawn_walk')
  assert.notStrictEqual(nextAction(bad({ inv: { wooden_pickaxe: 1 } })).key, 'spawn_walk')
  const dirs = []
  const leg = (result) => {
    const action = nextAction(bad())
    assert.strictEqual(action.key, 'spawn_walk')
    assert.strictEqual(action.args[0].shore, true) // skills.js bends hops along a shore
    dirs.push([action.args[0].dir, action.args[0].maxBlocks])
    remember(run, action, result)
  }
  leg({ ok: false, reason: 'not_found' })
  leg({ ok: false, reason: 'not_found' })
  leg({ ok: false, reason: 'no_path' }) // blocked: sidestep one side, then resume
  leg({ ok: false, reason: 'not_found' })
  leg({ ok: false, reason: 'no_path' })
  leg({ ok: false, reason: 'no_path' }) // the sidestep failed too: the other side
  leg({ ok: false, reason: 'not_found' })
  leg({ ok: false, reason: 'not_found' })
  assert.deepStrictEqual(dirs, [[3, 56], [3, 56], [3, 56], [0, 16], [3, 56], [0, 16], [2, 16], [3, 56]]) // sidesteps alternate sides, the heading (3) always resumes
  assert.strictEqual(run.memory.walk.blocks, 56 * 3 + 16 * 2)
  remember(run, nextAction(bad()), { ok: true })
  assert.strictEqual(run.memory.walk, undefined) // a log was seen: cleared
  assert.strictEqual(run.memory.surfaceLeg, 0)
})

test('walkAfter / spawnWalk caps: 600 blocks, 10 minutes, or 6 failed legs in a row fall back to the old behaviour', () => {
  const on = { ...DEFAULT_PARAMS, spawnWalk: true }
  const mem = (walk) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, failSigs: {}, optionalFails: {}, restock: {}, walk })
  const at = (walk, now = 0) => nextAction(state({ y: 70, params: on, memory: mem(walk), now })).key
  const w = { dir: 2, blocks: 0, fails: 0, detour: 0, startedAt: 0 }
  assert.strictEqual(at(w), 'spawn_walk')
  assert.notStrictEqual(at({ ...w, blocks: 600 }), 'spawn_walk')
  assert.notStrictEqual(at({ ...w, fails: 6 }), 'spawn_walk')
  assert.notStrictEqual(at(w, 10 * 60000), 'spawn_walk')
  assert.deepStrictEqual(walkAfter(undefined, { dir: 2, maxBlocks: 56 }, { ok: false, reason: 'not_found' }, 5), { dir: 2, blocks: 56, fails: 0, detour: 0, startedAt: 5 })
  assert.strictEqual(walkAfter(w, { dir: 2, maxBlocks: 56 }, { ok: true }), undefined)
  assert.strictEqual(walkAfter(w, { dir: 2, maxBlocks: 56 }, { ok: false, reason: 'timeout' }).detour, 1)
})

test('pickReady: off by default (unless PICKREADY=1) and coerced to a boolean from an ARM value', () => {
  if (process.env.PICKREADY !== '1') assert.strictEqual(DEFAULT_PARAMS.pickReady, false)
  assert.strictEqual(normalizeParams({ pickReady: 1 }).pickReady, true)
})

// pickReady: a spare iron pickaxe is prepared from what is near, and a low or lost one restocks instead of mining on.
const ready = { ...DEFAULT_PARAMS, pickReady: true }
const pr = (over = {}) => state({ params: ready, inv: { iron_pickaxe: 1, stone_pickaxe: 1 }, ironLeft: 250, msLeft: 3600000, foodCount: 6, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0 }, ...over })
const mem = (extra = {}) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, ...extra })

test('pickReady: before the descent visible iron is mined, smelted, then crafted into a spare pickaxe', () => {
  assert.strictEqual(nextAction(pr({ visible: { raw_iron: true }, params: DEFAULT_PARAMS })).skill, 'dig_down') // off
  const mine = nextAction(pr({ visible: { raw_iron: true } }))
  assert.deepStrictEqual([mine.skill, mine.restock], ['mine', 'pick_ready'])
  assert.strictEqual(nextAction(pr()).skill, 'dig_down') // nothing near: no search for iron
  const smelt = nextAction(pr({ inv: { iron_pickaxe: 1, stone_pickaxe: 1, raw_iron: 3, coal: 2 }, tableNear: true, furnaceNear: true }))
  assert.deepStrictEqual([smelt.skill, smelt.args[0]], ['smelt', 'iron_ingot'])
  const sticks = nextAction(pr({ inv: { iron_pickaxe: 1, stone_pickaxe: 1, iron_ingot: 3, oak_planks: 2 }, tableNear: true }))
  assert.deepStrictEqual([sticks.skill, sticks.args[0]], ['craft', 'stick'])
  const craft = nextAction(pr({ inv: { iron_pickaxe: 1, stone_pickaxe: 1, iron_ingot: 3, stick: 8 }, tableNear: true }))
  assert.deepStrictEqual([craft.skill, craft.args[0]], ['craft', 'iron_pickaxe'])
  const noTable = nextAction(pr({ inv: { iron_pickaxe: 1, stone_pickaxe: 1, iron_ingot: 3, stick: 8 } }))
  assert.strictEqual(noTable.skill, 'dig_down') // materials kept, no wood fetched for a table
})

test('pickReady: no preparing with a spare, at night, near the deadline, at diamond depth, after the restock budget', () => {
  const visible = { raw_iron: true }
  assert.strictEqual(nextAction(pr({ visible, inv: { iron_pickaxe: 2 } })).skill, 'dig_down')
  assert.notStrictEqual(nextAction(pr({ visible, isNight: true }))?.restock, 'pick_ready')
  assert.notStrictEqual(nextAction(pr({ visible, msLeft: 15 * 60000 }))?.restock, 'pick_ready')
  assert.notStrictEqual(nextAction(pr({ visible, y: DEFAULT_PARAMS.branchY, surfaceY: 70 }))?.restock, 'pick_ready')
  assert.notStrictEqual(nextAction(pr({ visible, memory: mem({ restock: { pick_ready: { steps: 12, fails: 0 } } }) }))?.restock, 'pick_ready')
})

test('pickReady: a low iron pickaxe with no spare climbs to the iron level, crafts at once when it can, and is bounded', () => {
  const deep = { y: -40, surfaceY: 70, ironLeft: 20 }
  const up = nextAction(pr(deep))
  assert.deepStrictEqual([up.skill, up.args, up.key], ['go_up', [16], 'pick_up'])
  assert.notStrictEqual(nextAction(pr({ ...deep, ironLeft: 100 })).key, 'pick_up')
  assert.strictEqual(nextAction(pr({ ...deep, ironLeft: 50 })).key, 'pick_up') // 80% used = 20% of 250 left
  assert.notStrictEqual(nextAction(pr({ ...deep, ironLeft: 51 })).key, 'pick_up')
  assert.notStrictEqual(nextAction(pr({ ...deep, memory: mem({ pickUps: 2 }) })).key, 'pick_up')
  assert.notStrictEqual(nextAction(pr({ ...deep, inv: { iron_pickaxe: 2 } })).key, 'pick_up') // a spare is held
  const craft = nextAction(pr({ ...deep, inv: { iron_pickaxe: 1, iron_ingot: 3, stick: 2 }, tableNear: true }))
  assert.deepStrictEqual([craft.skill, craft.args[0]], ['craft', 'iron_pickaxe'])
  const atIron = nextAction(pr({ y: 14, surfaceY: 70, ironLeft: 20, visible: { raw_iron: true } }))
  assert.deepStrictEqual([atIron.skill, atIron.restock], ['mine', 'pick_ready'])
  const { remember } = require('../bot/agent.js')
  const run = { memory: mem({ failSigs: {}, optionalFails: {}, restock: {} }) }
  remember(run, up, { ok: true })
  assert.strictEqual(run.memory.pickUps, 1)
})

test('pickReady: no iron pickaxe deep underground climbs to the iron level; at the surface the normal tech tree runs', () => {
  assert.notStrictEqual(nextAction(pr({ inv: { stone_pickaxe: 1 }, ironLeft: undefined, y: -40 })).key, 'pick_up') // durability unknown keeps the old path
  const broken = nextAction(pr({ inv: { stone_pickaxe: 1 }, ironLeft: 0, y: -40 }))
  assert.deepStrictEqual([broken.skill, broken.key], ['go_up', 'pick_up'])
  assert.notStrictEqual(nextAction(pr({ inv: { stone_pickaxe: 1 }, ironLeft: 0 })).key, 'pick_up') // at the surface
})

test('spareAlways: off by default (unless SPAREALWAYS=1), coerced to a boolean, and inert without pickReady', () => {
  if (process.env.SPAREALWAYS !== '1') assert.strictEqual(DEFAULT_PARAMS.spareAlways, false)
  assert.strictEqual(normalizeParams({ spareAlways: 1 }).spareAlways, true)
  const always = { ...DEFAULT_PARAMS, pickReady: false, spareAlways: true }
  assert.strictEqual(nextAction(pr({ params: always, y: 30 })).skill, 'dig_down') // no pickReady: the old path
})

test('spareAlways: goes to the iron level and mines, smelts, crafts sticks and the spare; bounded by time, depth, fuel and its own budget', () => {
  const on = { ...ready, spareAlways: true, reserve: false }
  const wood = { iron_pickaxe: 1, stone_pickaxe: 1, oak_log: 4 }
  const a = (over = {}) => nextAction(pr({ params: on, inv: wood, now: 0, ...over }))
  const down = a({ y: 70 })
  assert.deepStrictEqual([down.skill, down.restock], ['dig_down', 'spare_always']) // nothing in view: descends to the iron level, not further
  assert.strictEqual(down.args[0], 16)
  assert.strictEqual(a({ y: 16, visible: { raw_iron: true } }).skill, 'mine')
  assert.deepStrictEqual([a({ y: 16 }).skill, a({ y: 16 }).restock], ['explore', 'spare_always']) // at y16, searches
  const smelt = a({ y: 16, inv: { ...wood, raw_iron: 3 }, furnaceNear: true, tableNear: true })
  assert.deepStrictEqual([smelt.skill, smelt.args[0]], ['smelt', 'iron_ingot'])
  const sticks = a({ y: 16, inv: { ...wood, iron_ingot: 3, oak_planks: 2 } })
  assert.deepStrictEqual([sticks.skill, sticks.args[0]], ['craft', 'stick'])
  const craft = a({ y: 16, inv: { ...wood, iron_ingot: 3, stick: 4 }, tableNear: true })
  assert.deepStrictEqual([craft.skill, craft.args[0]], ['craft', 'iron_pickaxe'])
  // bounds: each falls back to the opportunistic path (dig_down here, nothing visible)
  const bounded = (over) => assert.notStrictEqual(a({ y: 16, ...over })?.restock, 'spare_always')
  bounded({ memory: mem({ spareSince: 0 }), now: 8 * 60000 }) // time budget spent
  bounded({ y: -5 }) // final descent under way
  bounded({ msLeft: 19 * 60000 }) // too close to the deadline
  bounded({ isNight: true })
  bounded({ inv: { iron_pickaxe: 1, stone_pickaxe: 1, oak_log: 1 } }) // fuel for 3 smelts missing: no wood fetch
  bounded({ memory: mem({ restock: { spare_always: { steps: 40, fails: 0 } } }) })
  bounded({ inv: { iron_pickaxe: 2, oak_log: 4 } }) // spare held
  assert.strictEqual(a({ y: 16, memory: mem({ spareSince: 0 }), now: 7 * 60000 }).restock, 'spare_always') // still inside the budget
  assert.deepStrictEqual(a({ y: 16, inv: { ...wood, oak_log: 1, coal: 1 }, visible: { raw_iron: true } }).skill, 'mine') // coal counts as fuel
})

test('spareAlways: the first step starts the clock; the spare pickaxe is never tossed as junk', () => {
  const { remember } = require('../bot/agent.js')
  const run = { memory: mem({ failSigs: {}, optionalFails: {}, restock: {} }) }
  remember(run, { skill: 'dig_down', args: [16], restock: 'spare_always' }, { ok: true })
  const since = run.memory.spareSince
  assert.strictEqual(typeof since, 'number')
  remember(run, { skill: 'mine', args: [], restock: 'spare_always' }, { ok: true })
  assert.strictEqual(run.memory.spareSince, since)
  const full = nextAction(state({ freeSlots: 0, inv: { iron_pickaxe: 2, stone_pickaxe: 1, dirt: 20 } }))
  assert.deepStrictEqual([full.skill, full.args[0]], ['toss', ['dirt', 'gravel', 'andesite', 'diorite', 'granite', 'tuff', 'netherrack']])
})

test('veinScan: off by default (unless VEINSCAN=1) and coerced to a boolean from an ARM value', () => {
  if (process.env.VEINSCAN !== '1') assert.strictEqual(DEFAULT_PARAMS.veinScan, false)
  assert.strictEqual(normalizeParams({ veinScan: 1 }).veinScan, true)
  assert.strictEqual(normalizeParams({ veinScan: 0 }).veinScan, false)
})

test('drownCap: off by default (unless DROWNCAP=1) and coerced to a boolean from an ARM value', () => {
  if (process.env.DROWNCAP !== '1') assert.strictEqual(DEFAULT_PARAMS.drownCap, false)
  assert.strictEqual(normalizeParams({ drownCap: 1 }).drownCap, true)
  assert.strictEqual(normalizeParams({ drownCap: 0 }).drownCap, false)
})

test('stationAbove: off by default (unless STATIONABOVE=1) and coerced to a boolean from an ARM value', () => {
  if (process.env.STATIONABOVE !== '1') assert.strictEqual(DEFAULT_PARAMS.stationAbove, false)
  assert.strictEqual(normalizeParams({ stationAbove: 1 }).stationAbove, true)
  assert.strictEqual(normalizeParams({ stationAbove: 0 }).stationAbove, false)
})

test('pickFirst: off by default (unless PICKFIRST=1); on, a pickaxe-less bot with inputs crafts before the home trip', () => {
  if (process.env.PICKFIRST !== '1') assert.strictEqual(DEFAULT_PARAMS.pickFirst, false)
  const bare = { inv: { diamond: 1, oak_planks: 3, stick: 2 }, tableNear: true, y: -58, distHome: 200 }
  assert.strictEqual(nextAction(state({ ...bare, params: { ...DEFAULT_PARAMS, pickFirst: false } })).skill, 'go_up')
  const act = nextAction(state({ ...bare, params: { ...DEFAULT_PARAMS, pickFirst: true } }))
  assert.deepStrictEqual([act.skill, act.args[0]], ['craft', 'wooden_pickaxe'])
  const armed = nextAction(state({ ...bare, inv: { ...bare.inv, iron_pickaxe: 1 }, params: { ...DEFAULT_PARAMS, pickFirst: true } }))
  assert.strictEqual(armed.skill, 'go_up') // with a pickaxe the home trip still goes first
})

// ---- earlySeal ----
const EARLY = { ...DEFAULT_PARAMS, earlySeal: true }
const cover = { hostileNear: true, hostileDist: 8, hostileCount: 1, canShelter: true, y: -58, surfaceY: 70, now: 1e6 }
const early = (over = {}, params = EARLY) => nextAction(state({ ...cover, ...over, params }))

test('earlySeal: off by default, normalized, and with it off the action choice is unchanged on a table of states', () => {
  if (process.env.EARLYSEAL !== '1') assert.strictEqual(DEFAULT_PARAMS.earlySeal, false)
  assert.strictEqual(normalizeParams({ earlySeal: 1 }).earlySeal, true)
  const OFF = { ...DEFAULT_PARAMS, earlySeal: false }
  const without = { ...DEFAULT_PARAMS }
  delete without.earlySeal
  for (const health of [20, 12, 6]) for (const hostileDist of [1.5, 3.5, 8]) for (const hostileCount of [1, 3]) for (const hostileRanged of [false, true]) {
    const over = { hostileClose: hostileDist <= 4, hostileDist, hostileCount, hostileRanged, health }
    assert.deepStrictEqual(early(over, OFF), early(over, without), JSON.stringify(over))
    assert.notStrictEqual(early(over, OFF)?.key, 'early_seal')
  }
})

test('earlySeal on: seals for each trigger (health, crowd, ranged) and tags the reason', () => {
  assert.deepStrictEqual(early({ health: 12 }), { skill: 'shelter', args: [0, 'early', 'health'], key: 'early_seal' })
  assert.deepStrictEqual(early({ hostileCount: 2 }), { skill: 'shelter', args: [0, 'early', 'crowd'], key: 'early_seal' })
  assert.deepStrictEqual(early({ hostileRanged: true }), { skill: 'shelter', args: [0, 'early', 'ranged'], key: 'early_seal' })
  assert.strictEqual(early({ health: 12, hostileClose: true, hostileDist: 3.5 }).key, 'early_seal') // preempts the fight branch
  assert.deepStrictEqual(early({ health: 12, y: 80, surfaceY: 80, memory: { leg: 0, baseDir: 2, surfaceDir: 3, surfaceLeg: 0 } }).args, [3, 'early', 'health'])
})

test('earlySeal on: a lone weak mob at high health is fought, not sealed from', () => {
  assert.strictEqual(early({ health: 20, hostileClose: true, hostileDist: 3.5 })?.skill, 'fight')
  assert.notStrictEqual(early({ health: 20 })?.key, 'early_seal')
  assert.notStrictEqual(early({ health: 14 })?.key, 'early_seal')
})

test('earlySeal on: never starts with a hostile within 3 blocks, without blocks, in a wet or lava cell, or while enclosed', () => {
  const near = { hostileClose: true, hostileDist: 2.9, hostileCount: 3, hostileRanged: true, health: 10 }
  assert.strictEqual(early(near)?.skill, 'fight')
  assert.strictEqual(early({ ...near, health: 6 }).key, undefined) // existing behaviour: takeCover
  assert.strictEqual(early({ ...near, hostileDist: 3 })?.key, 'early_seal')
  assert.notStrictEqual(early({ health: 10, canShelter: false })?.key, 'early_seal')
  assert.notStrictEqual(early({ health: 10, cellUnsafe: true })?.key, 'early_seal')
  assert.notStrictEqual(early({ health: 10, enclosed: true })?.key, 'early_seal')
  assert.notStrictEqual(early({ health: 10, hostileDist: undefined })?.key, 'early_seal')
})

test('earlySeal on: at most 6 early seals in 10 minutes', () => {
  const stamps = (n, ago) => ({ leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, earlySeals: Array(n).fill(1e6 - ago) })
  assert.strictEqual(early({ health: 10, memory: stamps(5, 1000) }).key, 'early_seal')
  assert.notStrictEqual(early({ health: 10, memory: stamps(6, 1000) })?.key, 'early_seal')
  assert.strictEqual(early({ health: 10, memory: stamps(6, 600001) }).key, 'early_seal')
})

test('earlySeal on: ignores the noShelter pause that follows ordinary shelters', () => {
  assert.strictEqual(early({ health: 10, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, noShelter: 3 } }).key, 'early_seal')
})
