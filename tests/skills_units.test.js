const { test } = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('../bot/node_modules/vec3')
const { EventEmitter } = require('node:events')
const { run, checkCancelled, cheapestPickaxe, stairRefusal, arrived, dropLoops, resetTrail, placeSpot, placeFace, pickupGoalY, onCanopy, mostCommon, resetStaleTrail } = require('../bot/skills.js')

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

function fakeBot(hostileAt = 10) {
  const bot = new EventEmitter()
  return Object.assign(bot, {
    health: 20,
    entity: { position: new Vec3(0, 10, 0) },
    pathfinder: { setGoal() {} },
    clearControlStates() {},
    stopDigging() {},
    nearestEntity: (match) => [{ type: 'hostile', position: new Vec3(hostileAt, 10, 0) }].find(match) ?? null,
  })
}

const spin = async (bot) => { for (;;) { checkCancelled(bot); await new Promise(r => setTimeout(r, 1)) } }

test('run: a hit from a hostile 10 blocks away cancels the skill loop and reports attacked', async () => {
  const bot = fakeBot()
  let stopped = false
  const result = await run(bot, async () => {
    setTimeout(() => { bot.health = 10; bot.emit('health') }, 5)
    try { await spin(bot) } finally { stopped = true }
  }, true)
  assert.strictEqual(result.reason, 'attacked')
  assert.strictEqual(stopped, true)
  assert.strictEqual(bot.skillCancel, null)
})

test('run: damage is ignored for non-interruptible skills and when no hostile is in range', async () => {
  const hit = async (bot) => { bot.health = 10; bot.emit('health') }
  assert.strictEqual((await run(fakeBot(), async () => {}, true)).ok, true)
  for (const [bot, interruptible] of [[fakeBot(), false], [fakeBot(50), true]]) {
    const result = await run(bot, async () => { await hit(bot) }, interruptible)
    assert.strictEqual(result.ok, true)
  }
})

test('checkCancelled: throws the stored reason only while the token is cancelled', () => {
  assert.doesNotThrow(() => checkCancelled({}))
  assert.doesNotThrow(() => checkCancelled({ skillCancel: { cancelled: false } }))
  assert.throws(() => checkCancelled({ skillCancel: { cancelled: true, reason: 'timeout' } }), { reason: 'timeout' })
})

test('placeSpot: a spot without a floor is fine when it has any solid neighbour to place against', () => {
  const feet = new Vec3(0, 10, 0)
  const bot = world({ '1,10,0': 'air', '1,9,0': 'air' })
  assert.deepStrictEqual(placeSpot(bot, feet), new Vec3(1, 10, 0))
  assert.deepStrictEqual(placeFace(bot, new Vec3(1, 10, 0)), [1, 0, 0])
  assert.deepStrictEqual(placeFace(world({ '1,10,0': 'air' }), new Vec3(1, 10, 0)), [0, -1, 0])
  assert.strictEqual(placeFace(world({ '1,10,0': 'air', '1,9,0': 'air', '2,10,0': 'air', '1,10,1': 'air', '1,10,-1': 'air', '1,11,0': 'air', '0,10,0': 'air' }), new Vec3(1, 10, 0)), undefined)
})

test('pickupGoalY: clamps to the bot ground level and skips drops out of reach above', () => {
  assert.strictEqual(pickupGoalY(64, 65.2), 64)
  assert.strictEqual(pickupGoalY(64, 64.4), 64)
  assert.strictEqual(pickupGoalY(64, 62.3), 62)
  assert.strictEqual(pickupGoalY(64, 65.6), null)
  assert.strictEqual(pickupGoalY(64, 68), null)
})

test('onCanopy: leaves and logs under the bot may be dug through unless lava is close', () => {
  const p = new Vec3(0, 10, 0)
  assert.strictEqual(onCanopy(world({ '0,9,0': 'oak_leaves' }), p), true)
  assert.strictEqual(onCanopy(world({ '0,9,0': 'birch_log' }), p), true)
  assert.strictEqual(onCanopy(world(), p), false)
  assert.strictEqual(onCanopy(world({ '0,9,0': 'oak_leaves', '0,8,0': 'lava' }), p), false)
  assert.strictEqual(onCanopy(world({ '0,9,0': 'oak_leaves', '0,7,0': 'lava' }), p), false)
})

test('mostCommon: the most frequent value, first seen wins a tie', () => {
  assert.strictEqual(mostCommon(['lava', 'no_floor', 'no_floor', 'undiggable']), 'no_floor')
  assert.strictEqual(mostCommon(['lava', 'undiggable']), 'lava')
  assert.strictEqual(mostCommon([]), undefined)
})

test('resetStaleTrail: drops a trail whose last crumb is more than 8 blocks away', () => {
  const bot = (x) => ({ entity: { position: new Vec3(x, 10, 0) }, trail: [new Vec3(0, 10, 0)] })
  const near = bot(5)
  resetStaleTrail(near)
  assert.strictEqual(near.trail.length, 1)
  const far = bot(9)
  resetStaleTrail(far)
  assert.deepStrictEqual(far.trail, [])
  assert.doesNotThrow(() => resetStaleTrail({ entity: { position: new Vec3(0, 0, 0) } }))
})
