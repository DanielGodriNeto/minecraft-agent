const { test } = require('node:test')
const assert = require('node:assert')
const { nextAction, DEFAULT_PARAMS } = require('../bot/planner.js')

const WOODS = ['oak', 'spruce', 'birch']
const sum = (inv, names) => names.reduce((n, k) => n + (inv[k] ?? 0), 0)
const PLANKS = WOODS.map(w => `${w}_planks`)
const STONES = ['cobblestone', 'cobbled_deepslate']

function state(over = {}) {
  return {
    inv: {}, health: 20, food: 20, hasFood: false, y: 70, surfaceY: 70, isNight: false, hostileNear: false,
    visible: {}, tableNear: false, furnaceNear: false, freeSlots: 30, pickLeft: 0,
    home: { x: 0, y: 70, z: 0 }, distHome: 0, objective: { item: 'diamond', count: 'max' }, deposited: 0,
    params: DEFAULT_PARAMS, memory: { leg: 0, baseDir: 0, surfaceDir: 0 },
    ...over,
  }
}

// Independent ground truth: what one craft of each item consumes.
function craftable(s, item) {
  const table = s.tableNear || (s.inv.crafting_table ?? 0) > 0
  const planks = sum(s.inv, PLANKS)
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
  assert.deepStrictEqual(nextAction(state()), { skill: 'explore', args: [{ target: nextAction(state()).args[0].target, mode: 'surface', dir: 0, maxBlocks: 64 }] })
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
