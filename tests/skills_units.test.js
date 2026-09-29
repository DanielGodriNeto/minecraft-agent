const { test } = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('../bot/node_modules/vec3')
const { cheapestPickaxe, stairRefusal } = require('../bot/skills.js')

const item = (name) => ({ name, type: name.length })
const canHarvestWith = (...names) => ({ canHarvest: (type) => names.some(n => n.length === type) })

test('cheapestPickaxe: lowest capable tier wins, not the fastest', () => {
  const items = [item('iron_pickaxe'), item('stone_pickaxe'), item('wooden_pickaxe'), item('stick')]
  assert.strictEqual(cheapestPickaxe(items, canHarvestWith('wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe')).name, 'wooden_pickaxe')
  assert.strictEqual(cheapestPickaxe(items, canHarvestWith('stone_pickaxe', 'iron_pickaxe')).name, 'stone_pickaxe')
})

test('cheapestPickaxe: falls back to iron when it is the only capable tool, null when none', () => {
  const items = [item('stone_pickaxe'), item('iron_pickaxe')]
  assert.strictEqual(cheapestPickaxe(items, canHarvestWith('iron_pickaxe')).name, 'iron_pickaxe')
  assert.strictEqual(cheapestPickaxe(items, canHarvestWith('diamond_pickaxe')), null)
  assert.strictEqual(cheapestPickaxe([], canHarvestWith('iron_pickaxe')), null)
})

const block = (name, pos) => ({
  name, position: pos, diggable: name !== 'bedrock', boundingBox: ['air', 'water', 'lava'].includes(name) ? 'empty' : 'block',
})

// Fake world: everything is stone except the given overrides ("x,y,z" -> name).
function world(overrides = {}) {
  return { blockAt: (p) => block(overrides[`${p.x},${p.y},${p.z}`] ?? 'stone', p) }
}

test('stairRefusal: reports why a step is refused', () => {
  const p = new Vec3(0, 10, 0)
  const east = [1, 0]
  assert.strictEqual(stairRefusal(world(), p, east), null)
  assert.strictEqual(stairRefusal(world({ '1,8,0': 'air' }), p, east), 'no_floor')
  assert.strictEqual(stairRefusal(world({ '1,8,0': 'water' }), p, east), 'no_floor')
  assert.strictEqual(stairRefusal(world({ '1,10,0': 'bedrock' }), p, east), 'undiggable')
  assert.strictEqual(stairRefusal(world({ '2,10,0': 'lava' }), p, east), 'lava')
  assert.strictEqual(stairRefusal(world({ '1,8,0': 'lava' }), p, east), 'lava')
})
