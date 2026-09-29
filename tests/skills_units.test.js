const { test } = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('../bot/node_modules/vec3')
const { cheapestPickaxe, stairRefusal, arrived, dropLoops, resetTrail, placeSpot } = require('../bot/skills.js')

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
  name, position: pos, diggable: name !== 'bedrock', boundingBox: ['air', 'water', 'lava', 'pink_petals'].includes(name) ? 'empty' : 'block',
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

test('arrived: needs ground, the right level and to be near the cell centre', () => {
  const bot = (x, y, z, onGround = true) => ({ entity: { position: { x, y, z }, onGround } })
  const cell = new Vec3(5, 10, 5)
  assert.strictEqual(arrived(bot(5.5, 10, 5.6), cell), true)
  assert.strictEqual(arrived(bot(5.5, 10, 5.6, false), cell), false)
  assert.strictEqual(arrived(bot(5.5, 11, 5.5), cell), false)
  assert.strictEqual(arrived(bot(5.0, 10, 5.5), cell), false)
})

test('dropLoops: cuts the segment between two visits of the same cell', () => {
  const cells = (...xs) => xs.map(x => new Vec3(x, 0, 0))
  assert.deepStrictEqual(dropLoops(cells(0, 1, 2, 3, 1, 4)), cells(0, 1, 4))
  assert.deepStrictEqual(dropLoops(cells(0, 1, 2, 1, 2, 3)), cells(0, 1, 2, 3))
  assert.deepStrictEqual(dropLoops(cells(0, 1, 2)), cells(0, 1, 2))
  assert.deepStrictEqual(dropLoops([]), [])
})

test('resetTrail: clears the trail only within 4 blocks of home', () => {
  const home = { x: 10, y: 64, z: 10 }
  const bot = (x, y, z) => ({ entity: { position: { x, y, z } }, trail: [1, 2] })
  const near = bot(12, 64, 11)
  resetTrail(near, home)
  assert.deepStrictEqual(near.trail, [])
  const far = bot(30, 64, 10)
  resetTrail(far, home)
  assert.deepStrictEqual(far.trail, [1, 2])
  assert.doesNotThrow(() => resetTrail({ entity: null, trail: [] }, home))
})

test('placeSpot: skips flower beds and spots the server refused', () => {
  const feet = new Vec3(0, 10, 0)
  const air = (extra = {}) => world({ '1,10,0': 'air', '0,10,1': 'air', ...extra })
  const bot = (w, refusedSpots) => ({ ...w, refusedSpots })
  assert.deepStrictEqual(placeSpot(bot(air()), feet), new Vec3(1, 10, 0))
  assert.deepStrictEqual(placeSpot(bot(air({ '1,10,0': 'pink_petals' })), feet), new Vec3(0, 10, 1))
  assert.deepStrictEqual(placeSpot(bot(air(), new Set(['(1, 10, 0)'])), feet), new Vec3(0, 10, 1))
  assert.strictEqual(placeSpot(bot(world()), feet), undefined)
})
