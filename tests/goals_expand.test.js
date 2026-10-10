const { test } = require('node:test')
const assert = require('node:assert')
const mcData = require('../bot/node_modules/minecraft-data')
const registry = require('../bot/goals/goals.json')
const { expand, ExpandError } = require('../bot/goals/expand.js')

const names = steps => steps.map(s => `${s.action}:${s.item}`)
const indexOf = (steps, action, item) => steps.findIndex(s => s.action === action && s.item === item)
const total = (steps, action, item) => steps.filter(s => s.action === action && s.item === item).reduce((n, s) => n + s.count, 0)
function assertOrder(steps, ...keys) {
  let prev = -1
  for (const key of keys) {
    const [action, item] = key.split(':')
    const i = steps.findIndex((s, idx) => idx > prev && s.action === action && s.item === item)
    assert.ok(i > prev, `${key} should appear after index ${prev} in ${names(steps).join(' > ')}`)
    prev = i
  }
}

test('diamond from empty inventory follows the full tech tree', () => {
  const steps = expand('diamond', 1, {})
  assert.strictEqual(steps[0].action, 'collect_wood')
  assertOrder(steps, 'collect_wood:log', 'craft:planks', 'craft:crafting_table', 'craft:stick', 'craft:wooden_pickaxe',
    'mine:cobblestone', 'craft:stone_pickaxe', 'craft:furnace', 'mine:raw_iron', 'mine:coal', 'smelt:iron_ingot', 'craft:iron_pickaxe', 'mine:diamond')
  assert.strictEqual(steps.at(-1).action, 'mine')
  assert.deepStrictEqual(steps.at(-1).needs, ['iron_pickaxe'])
  assert.strictEqual(steps.at(-1).count, 1)
  assert.strictEqual(total(steps, 'smelt', 'iron_ingot'), 3)
  assert.strictEqual(total(steps, 'mine', 'raw_iron'), 3)
  assert.strictEqual(total(steps, 'mine', 'cobblestone'), 11) // stone pickaxe 3 + furnace 8
  assert.strictEqual(indexOf(steps, 'craft', 'crafting_table'), steps.findIndex(s => s.item === 'crafting_table'))
  assert.strictEqual(steps.filter(s => s.item === 'crafting_table').length, 1, 'one table, not one per recipe')
})

test('every step is well formed', () => {
  for (const s of expand('diamond', 3, {})) {
    assert.ok(['collect_wood', 'craft', 'mine', 'smelt'].includes(s.action))
    assert.strictEqual(typeof s.item, 'string')
    assert.ok(Number.isInteger(s.count) && s.count > 0, JSON.stringify(s))
    assert.ok(Array.isArray(s.needs))
  }
})

test('stone pickaxe in inventory removes the early tool steps', () => {
  const steps = expand('diamond', 1, { stone_pickaxe: 1 })
  assert.strictEqual(indexOf(steps, 'craft', 'wooden_pickaxe'), -1)
  assert.strictEqual(indexOf(steps, 'craft', 'stone_pickaxe'), -1)
  assert.ok(indexOf(steps, 'craft', 'furnace') >= 0)
  assertOrder(steps, 'craft:crafting_table', 'craft:furnace', 'smelt:iron_ingot', 'craft:iron_pickaxe', 'mine:diamond')
  assert.strictEqual(total(steps, 'mine', 'cobblestone'), 8)
})

test('higher tier tool covers lower tier needs', () => {
  const steps = expand('diamond', 1, { iron_pickaxe: 1 })
  assert.deepStrictEqual(names(steps), ['mine:diamond'])
  assert.deepStrictEqual(names(expand('iron_pickaxe', 1, { iron_pickaxe: 1 })), [])
})

test('inventory already covering the goal gives an empty plan; partial counts reduce the work', () => {
  assert.deepStrictEqual(expand('diamond', 2, { diamond: 2 }), [])
  assert.strictEqual(total(expand('diamond', 5, { diamond: 2, iron_pickaxe: 1 }), 'mine', 'diamond'), 3)
  assert.strictEqual(total(expand('iron_pickaxe', 1, { iron_ingot: 3, stone_pickaxe: 1, crafting_table: 1, stick: 2 }), 'mine', 'raw_iron'), 0)
})

test("count 'max' plans the bootstrap for one", () => {
  assert.deepStrictEqual(expand('diamond', 'max', { iron_pickaxe: 1 }), expand('diamond', 1, { iron_pickaxe: 1 }))
})

test('iron_pickaxe', () => {
  const steps = expand('iron_pickaxe', 1, {})
  assertOrder(steps, 'collect_wood:log', 'craft:wooden_pickaxe', 'mine:raw_iron', 'smelt:iron_ingot', 'craft:iron_pickaxe')
  assert.strictEqual(indexOf(steps, 'mine', 'diamond'), -1)
})

test('stone_pickaxe', () => {
  const steps = expand('stone_pickaxe', 1, {})
  assertOrder(steps, 'collect_wood:log', 'craft:wooden_pickaxe', 'mine:cobblestone', 'craft:stone_pickaxe')
  assert.strictEqual(indexOf(steps, 'smelt', 'iron_ingot'), -1)
})

test('furnace needs 8 cobblestone and a crafting table', () => {
  const steps = expand('furnace', 1, {})
  assert.strictEqual(total(steps, 'mine', 'cobblestone'), 8)
  assertOrder(steps, 'craft:crafting_table', 'craft:wooden_pickaxe', 'mine:cobblestone', 'craft:furnace')
  assert.deepStrictEqual(steps.at(-1).needs, ['crafting_table'])
})

test('bucket: 3 iron ingots', () => {
  const steps = expand('bucket', 1, { stone_pickaxe: 1, crafting_table: 1, furnace: 1, coal: 1 })
  assert.deepStrictEqual(names(steps), ['mine:raw_iron', 'smelt:iron_ingot', 'craft:bucket'])
  assert.strictEqual(steps[0].count, 3)
  assert.deepStrictEqual(steps[1].needs, ['furnace', 'coal'])
})

test('shield: planks + one iron ingot', () => {
  const steps = expand('shield', 1, {})
  assert.strictEqual(total(steps, 'smelt', 'iron_ingot'), 1)
  assertOrder(steps, 'collect_wood:log', 'mine:raw_iron', 'smelt:iron_ingot', 'craft:shield')
  assert.strictEqual(steps.at(-1).action, 'craft')
})

test('iron_chestplate: 8 iron ingots', () => {
  const steps = expand('iron_chestplate', 1, {})
  assert.strictEqual(total(steps, 'smelt', 'iron_ingot'), 8)
  assert.strictEqual(total(steps, 'mine', 'raw_iron'), 8)
  assert.strictEqual(total(steps, 'mine', 'coal') >= 1, true)
  assert.strictEqual(steps.at(-1).item, 'iron_chestplate')
})

test('surplus crafted items are reused (6 sticks need 2 crafts, not 3)', () => {
  const steps = expand('diamond', 1, {})
  assert.strictEqual(steps.filter(s => s.item === 'stick').length, 2)
})

test('inventory is not mutated', () => {
  const inv = { stone_pickaxe: 1 }
  expand('diamond', 1, inv)
  assert.deepStrictEqual(inv, { stone_pickaxe: 1 })
})

test('any wood species counts as logs and planks', () => {
  const steps = expand('crafting_table', 1, { birch_log: 1 })
  assert.deepStrictEqual(names(steps), ['craft:planks', 'craft:crafting_table'])
  assert.deepStrictEqual(names(expand('crafting_table', 1, { spruce_planks: 4 })), ['craft:crafting_table'])
})

test('errors: unknown goal, missing recipe, cycle', () => {
  assert.throws(() => expand('banana_split', 1, {}), e => e instanceof ExpandError && e.code === 'unknown_goal' && /banana_split/.test(e.message))
  const broken = { ...registry, goals: { ...registry.goals, ghost: { aliases: [], source: { craft: 'auto' } } } }
  assert.throws(() => expand('ghost', 1, {}, broken), e => e.code === 'missing' && /ghost/.test(e.message))
  const loop = { ...registry, goals: { ...registry.goals,
    a: { aliases: [], source: { smelt: 'b' } }, b: { aliases: [], source: { smelt: 'a' } } } }
  assert.throws(() => expand('a', 1, {}, loop), e => e.code === 'cycle' && /a.*b.*a/.test(e.message))
  assert.throws(() => expand('diamond', 0, {}), /count/)
})

test('registry consistency with minecraft-data', () => {
  const md = mcData(registry.mcVersion)
  const order = registry.tiers
  for (const [item, g] of Object.entries(registry.goals)) {
    assert.ok(g.aliases.length > 0 || g.source.smelt, item)
    if (g.source.craft) assert.ok(md.itemsByName[item] && md.recipes[md.itemsByName[item].id], `${item} has a recipe`)
    if (!g.source.mine) continue
    const block = md.blocksByName[g.source.mine]
    assert.ok(block, g.source.mine)
    const tiers = Object.keys(block.harvestTools ?? {}).map(id => order.indexOf(md.items[id].name.split('_')[0])).filter(t => t >= 0)
    assert.strictEqual(g.source.tool_min.split('_')[0], order[Math.min(...tiers)], `${item} tool_min matches harvestTools`)
  }
})
