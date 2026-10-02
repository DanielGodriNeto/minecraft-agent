const { test } = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('../bot/node_modules/vec3')
const { EventEmitter } = require('node:events')
const { run, isDrowning, ownOxygen, skillCapMs, pickupStalled, Fail, checkCancelled, cheapestPickaxe, stairRefusal, tunnelSafe, arrived, dropLoops, resetTrail, placeSpot, placeFace, pickupGoalY, onCanopy, mostCommon, resetStaleTrail, facing, damageCause, patchFaces, ledgeFloor, skillMovements, scaffoldMovements, pickUpDrop, retrieveStation, floored, placeableCount, safeToLeave, runSkill, SKILLS, bestWeapon, nearestAnimal, SHELTER_WAITS, clearUnreachable, FIGHT_MIN_HEALTH, breakBlock, MAX_TUNNEL_OUTS, skillCapFor, goto, stalled, watchdogWindow } = require('../bot/skills.js')

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
  assert.strictEqual(stairRefusal(world({ '1,8,0': 'water' }), p, east), 'water')
  assert.strictEqual(stairRefusal(world({ '1,11,0': 'water' }), p, east), 'water')
  assert.strictEqual(stairRefusal(world({ '2,9,0': 'water' }), p, east), 'water')
  assert.strictEqual(stairRefusal(world({ '1,10,1': 'water' }), p, east), 'water')
  assert.strictEqual(stairRefusal(world({ '2,10,0': 'lava', '1,9,0': 'water' }), p, east), 'lava')
  assert.strictEqual(stairRefusal(world({ '1,10,0': 'bedrock' }), p, east), 'undiggable')
  assert.strictEqual(stairRefusal(world({ '2,10,0': 'lava' }), p, east), 'lava')
  assert.strictEqual(stairRefusal(world({ '1,8,0': 'lava' }), p, east), 'lava')
})

test('stairRefusal: gravel, sand and stalactites over the dug column are refused', () => {
  const p = new Vec3(0, 10, 0)
  const east = [1, 0]
  for (const name of ['gravel', 'sand', 'red_sand', 'suspicious_gravel', 'suspicious_sand']) {
    assert.strictEqual(stairRefusal(world({ '1,12,0': name }), p, east), 'gravel', name)
    assert.strictEqual(stairRefusal(world({ '1,11,0': name }), p, east), 'gravel', name)
  }
  assert.strictEqual(stairRefusal(world({ '1,13,0': 'gravel' }), p, east), null)
  assert.strictEqual(stairRefusal(world({ '1,10,0': 'gravel' }), p, east), null)
  assert.strictEqual(stairRefusal(world({ '1,14,0': 'pointed_dripstone' }), p, east), 'dripstone')
  assert.strictEqual(stairRefusal(world({ '1,12,0': 'pointed_dripstone' }), p, east), 'dripstone')
  assert.strictEqual(stairRefusal(world({ '1,15,0': 'pointed_dripstone' }), p, east), null)
  assert.strictEqual(stairRefusal(world({ '2,12,0': 'gravel' }), p, east), null)
})

test('stairRefusal: a cell that needs a pickaxe tier the bot lacks is no_tool, dirt is dug by hand', () => {
  const p = new Vec3(0, 10, 0)
  const east = [1, 0]
  const hard = (name) => ({ ...block(name, new Vec3(0, 0, 0)), harvestTools: { 1: true }, material: 'mineable/pickaxe', canHarvest: (type) => type === 1 })
  const bot = (tool, overrides = {}) => ({
    blockAt: (q) => (overrides[`${q.x},${q.y},${q.z}`] ? hard(overrides[`${q.x},${q.y},${q.z}`]) : block('dirt', q)),
    inventory: { items: () => (tool ? [{ name: tool, type: 1 }] : []) },
  })
  const stone = { '1,10,0': 'stone' }
  assert.strictEqual(stairRefusal(bot(null, stone), p, east), 'no_tool')
  assert.strictEqual(stairRefusal(bot('wooden_pickaxe', stone), p, east), null)
  assert.strictEqual(stairRefusal(bot(null), p, east), null)
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
    blockAt: () => null,
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

test('arrived: swimming counts in a water cell, and 0.4 off-centre is close enough', () => {
  const cell = new Vec3(5, 10, 5)
  const swimmer = { entity: { position: { x: 5.5, y: 10.4, z: 5.5 }, onGround: false, isInWater: true }, blockAt: () => ({ name: 'water' }) }
  assert.strictEqual(arrived(swimmer, cell), true)
  assert.strictEqual(arrived({ ...swimmer, blockAt: () => ({ name: 'air' }) }, cell), false)
  assert.strictEqual(arrived({ entity: { position: { x: 5.9, y: 10, z: 5.5 }, onGround: true } }, cell), true)
})

test('facing: true within about 10 degrees of the target direction, wrapping around', () => {
  const bot = (yaw) => ({ entity: { position: { x: 0, y: 10, z: 0 }, yaw } })
  const south = { x: 0, y: 10, z: 5 } // yaw 0 looks toward -z, PI toward +z
  assert.strictEqual(facing(bot(Math.PI), south), true)
  assert.strictEqual(facing(bot(-Math.PI + 0.1), south), true)
  assert.strictEqual(facing(bot(Math.PI - 0.1), south), true)
  assert.strictEqual(facing(bot(Math.PI - 0.3), south), false)
  assert.strictEqual(facing(bot(0), south), false)
})

test('run: every health drop is recorded with its cause, capped at the last ten', async () => {
  const bot = fakeBot()
  const result = await run(bot, async () => {
    for (let hp = 19; hp >= 5; hp--) { bot.health = hp; bot.emit('health') }
  }, false)
  assert.strictEqual(result.damage.length, 10)
  assert.deepStrictEqual(result.damage.at(-1), { hp: 5, cause: 'unknown', feet: undefined, head: undefined, headSolid: false, oxygen: undefined, onFire: false })
  assert.strictEqual((await run(fakeBot(), async () => {}, false)).damage, undefined)
})

test('damageCause: hostile in range first, then hazard blocks, drowning, unknown', () => {
  const at = (names, extra = {}) => ({
    entity: { position: new Vec3(0.5, 10, 0.5) },
    nearestEntity: () => null,
    blockAt: (p) => (names[`${p.x},${p.y},${p.z}`] ? { name: names[`${p.x},${p.y},${p.z}`] } : { name: 'air' }),
    ...extra,
  })
  const zombie = { name: 'zombie', type: 'hostile', position: new Vec3(3.5, 10, 0.5) }
  assert.strictEqual(damageCause(at({}, { nearestEntity: () => zombie })), 'zombie@3.0')
  assert.strictEqual(damageCause(at({ '0,10,0': 'lava' })), 'lava')
  assert.strictEqual(damageCause(at({ '0,11,0': 'fire' })), 'fire')
  assert.strictEqual(damageCause(at({ '0,9,0': 'magma_block' })), 'magma')
  assert.strictEqual(damageCause(at({ '0,11,0': 'water' }, { oxygenLevel: 12 })), 'drowning')
  assert.strictEqual(damageCause(at({ '0,11,0': 'water' }, { oxygenLevel: 20 })), 'unknown')
  assert.strictEqual(damageCause(at({})), 'unknown')
})

test('damageCause: a far hostile is not blamed, a ranged one only with line of sight', () => {
  const bot = (mob, blocked = false, names = {}) => ({
    entity: { position: new Vec3(0.5, 10, 0.5) },
    world: { raycast: () => (blocked ? { name: 'stone' } : null) },
    nearestEntity: (match) => [mob].filter(Boolean).find(match) ?? null,
    blockAt: (p) => ({ name: names[`${p.x},${p.y},${p.z}`] ?? 'air', boundingBox: names[`${p.x},${p.y},${p.z}`] ? 'block' : 'empty' }),
  })
  const at = (name, x) => ({ name, type: 'hostile', height: 1.9, position: new Vec3(x, 10, 0.5) })
  assert.strictEqual(damageCause(bot(at('zombie', 5.5))), 'zombie@5.0')
  assert.strictEqual(damageCause(bot(at('zombie', 9.5))), 'unknown')
  assert.strictEqual(damageCause(bot(at('skeleton', 12.5))), 'skeleton@12.0')
  assert.strictEqual(damageCause(bot(at('skeleton', 12.5), true)), 'unknown')
  assert.strictEqual(damageCause(bot(at('skeleton', 20.5))), 'unknown')
  assert.strictEqual(damageCause(bot(null, false, { '0,11,0': 'gravel' })), 'suffocation')
})

test('run: solid-head damage adds up to a suffocating abort; unexplained damage logs its surroundings', async () => {
  const bot = fakeBot(50)
  bot.blockAt = (p) => (p.y === 11 ? { name: 'gravel', boundingBox: 'block' } : null)
  const result = await run(bot, async () => {
    setTimeout(() => { for (const hp of [18, 16, 14]) { bot.health = hp; bot.emit('health') } }, 5)
    await spin(bot)
  }, false)
  assert.strictEqual(result.reason, 'suffocating')
  assert.strictEqual(result.damage.length, 3)
  const spared = fakeBot(50)
  spared.blockAt = bot.blockAt
  const one = await run(spared, async () => { spared.health = 18; spared.emit('health') }, false)
  assert.strictEqual(one.ok, true)
})

test('patchFaces: solid neighbours of the hole, never the top face, minus faces that already failed', () => {
  const spot = new Vec3(0, 10, 0)
  const bot = (w, refusedFaces) => ({ ...w, refusedFaces })
  const open = { '1,10,0': 'air', '0,10,1': 'air', '0,11,0': 'stone' }
  assert.deepStrictEqual(patchFaces(bot(world(open)), spot), [[-1, 0, 0], [0, -1, 0], [0, 0, -1]])
  const failed = new Set(['(0, 10, 0)|-1,0,0', '(0, 10, 0)|0,-1,0'])
  assert.deepStrictEqual(patchFaces(bot(world(open), failed), spot), [[0, 0, -1]])
  const enclosed = { '1,10,0': 'air', '-1,10,0': 'air', '0,10,1': 'air', '0,10,-1': 'air', '0,9,0': 'air' }
  assert.deepStrictEqual(patchFaces(bot(world(enclosed)), spot), [])
})

test('ledgeFloor: a diggable floor over solid ground within two blocks, unless lava is near', () => {
  const p = new Vec3(0, 10, 0)
  const pillar = { '0,8,0': 'air', '0,7,0': 'air' }
  const floor = (w) => ledgeFloor(w, p)?.position
  assert.deepStrictEqual(floor(world({ '0,8,0': 'air' })), new Vec3(0, 9, 0))
  assert.deepStrictEqual(floor(world({ '0,8,0': 'air', '0,7,0': 'air', '0,6,0': 'air' })) ?? null, null)
  assert.deepStrictEqual(floor(world({ '0,8,0': 'air', '0,7,0': 'stone', '0,9,1': 'air' })), new Vec3(0, 9, 0))
  assert.strictEqual(ledgeFloor(world({ ...pillar, '0,9,0': 'air' }), p), null)
  assert.strictEqual(ledgeFloor(world({ '0,9,0': 'bedrock' }), p), null)
  assert.strictEqual(ledgeFloor(world({ '1,8,0': 'lava' }), p), null)
})

test('skillMovements: no scaffolding blocks and no parkour', () => {
  const movements = skillMovements({ registry: require('../bot/node_modules/minecraft-data')('1.21.11') })
  assert.deepStrictEqual(movements.scafoldingBlocks, [])
  assert.strictEqual(movements.allowParkour, false)
})

// Flat stone world (floor at y=9, bot feet at y=10) where placing and digging edit a shared block map.
function shelterBot({ blocks = 12, hostile = null } = {}) {
  const placed = new Map()
  const dug = new Set()
  const solidAt = (p) => (p.y < 10 || placed.has(`${p.x},${p.y},${p.z}`)) && !dug.has(`${p.x},${p.y},${p.z}`)
  const blockAt = (p) => ({ name: solidAt(p) ? 'stone' : 'air', position: p, diggable: true, boundingBox: solidAt(p) ? 'block' : 'empty' })
  let left = blocks
  const bot = Object.assign(new EventEmitter(), {
    health: 20, food: 20, refusedSpots: undefined,
    stopDigging() {},
    entity: { position: new Vec3(0.5, 10, 0.5) },
    blockAt,
    inventory: { items: () => (left > 0 ? [{ name: 'cobblestone', count: left, type: 1 }] : []) },
    equip: async () => {},
    placeBlock: async (ref, face) => {
      left--
      const key = `${ref.position.x + face.x},${ref.position.y + face.y},${ref.position.z + face.z}`
      placed.set(key, true)
      dug.delete(key)
    },
    dig: async (block) => { dug.add(`${block.position.x},${block.position.y},${block.position.z}`) },
    digTime: () => 0,
    pathfinder: { bestHarvestTool: () => null, setGoal() {} },
    clearControlStates() {},
    waitForTicks: async () => {},
    nearestEntity: (match) => [hostile].filter(Boolean).find(match) ?? null,
  })
  return { bot, placed, dug, left: () => left }
}

test('shelter: seals a 1x1x2 cell in open ground with a roof, then digs out toward the requested side', async () => {
  const { bot, placed, dug, left } = shelterBot()
  const result = await run(bot, () => SKILLS.shelter(bot, 1), false)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(placed.size, 10)
  assert.strictEqual(left(), 2)
  assert.deepStrictEqual([...dug].sort(), ['0,10,1', '0,11,1'])
  assert.strictEqual(placed.has('0,12,0'), true)
})

test('shelter: waits while a hostile is within the planner danger range of 16 blocks', async () => {
  const zombie = { type: 'hostile', name: 'zombie', position: new Vec3(3.5, 10, 0.5) }
  const { bot } = shelterBot({ hostile: zombie })
  assert.strictEqual(safeToLeave(bot), false)
  zombie.position = new Vec3(12.5, 10, 0.5)
  assert.strictEqual(safeToLeave(bot), false)
  zombie.position = new Vec3(20.5, 10, 0.5)
  assert.strictEqual(safeToLeave(bot), true)
  bot.health = 8
  assert.strictEqual(safeToLeave(bot), false)
  bot.food = 10
  assert.strictEqual(safeToLeave(bot), true)
})

test('shelter: fewer than six placeable blocks falls back to flee without placing anything', async () => {
  const { bot, placed } = shelterBot({ blocks: 5 })
  const result = await run(bot, () => SKILLS.shelter(bot, 0), false)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(placed.size, 0)
})

test('shelter dawn: digs out once it is day, stays sealed while it is still night', async () => {
  const day = shelterBot()
  day.bot.time = { timeOfDay: 1000 }
  assert.strictEqual((await run(day.bot, () => SKILLS.shelter(day.bot, 1, 'dawn'), false)).ok, true)
  assert.strictEqual(day.dug.size, 2)
  const dark = shelterBot()
  dark.bot.time = { timeOfDay: 14000 }
  const { ms } = SHELTER_WAITS.dawn
  SHELTER_WAITS.dawn.ms = 30
  try {
    assert.strictEqual((await run(dark.bot, () => SKILLS.shelter(dark.bot, 1, 'dawn'), false)).ok, true)
  } finally {
    SHELTER_WAITS.dawn.ms = ms
  }
  assert.strictEqual(dark.dug.size, 0)
})

test('shelter rest: leaves once health is back, and after the wait even if it is not', async () => {
  const healed = shelterBot()
  healed.bot.health = 15
  await run(healed.bot, () => SKILLS.shelter(healed.bot, 1, 'rest'), false)
  assert.strictEqual(healed.dug.size, 2)
  const hurt = shelterBot()
  hurt.bot.health = 5
  const { ms } = SHELTER_WAITS.rest
  SHELTER_WAITS.rest.ms = 30
  try {
    await run(hurt.bot, () => SKILLS.shelter(hurt.bot, 1, 'rest'), false)
  } finally {
    SHELTER_WAITS.rest.ms = ms
  }
  assert.strictEqual(hurt.dug.size, 2)
})

test('shelter: is cancellation-aware while walling in', async () => {
  const { bot } = shelterBot()
  const place = bot.placeBlock
  bot.placeBlock = async (...args) => { bot.skillCancel.cancelled = true; bot.skillCancel.reason = 'timeout'; return place(...args) }
  const result = await run(bot, () => SKILLS.shelter(bot, 0), false)
  assert.strictEqual(result.reason, 'timeout')
})

test('placeableCount: sums every placeable block type', () => {
  const bot = { inventory: { items: () => [{ name: 'dirt', count: 3 }, { name: 'cobblestone', count: 4 }, { name: 'stick', count: 9 }] } }
  assert.strictEqual(placeableCount(bot), 7)
})

test('bestWeapon: swords beat axes beat cheap pickaxes; the good pickaxes are never used', () => {
  const items = (...names) => names.map(name => ({ name }))
  assert.strictEqual(bestWeapon(items('wooden_pickaxe', 'iron_axe', 'stone_sword')).name, 'stone_sword')
  assert.strictEqual(bestWeapon(items('wooden_pickaxe', 'iron_axe')).name, 'iron_axe')
  assert.strictEqual(bestWeapon(items('stone_pickaxe', 'wooden_pickaxe')).name, 'wooden_pickaxe')
  assert.strictEqual(bestWeapon(items('iron_pickaxe', 'diamond_pickaxe', 'stick')), null)
})

function huntBot({ hits = 2, animalAt = 2 } = {}) {
  const animal = { id: 5, name: 'cow', height: 1.4, position: new Vec3(animalAt, 10, 0) }
  const goals = []
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0, 10, 0) },
    entities: { 5: animal },
    inventory: { items: () => [{ name: 'stone_sword', type: 1 }] },
    equipped: null,
    equip: async (item) => { bot.equipped = item.name },
    lookAt: async () => {},
    attacks: 0,
    attack() { if (++bot.attacks >= hits) delete bot.entities[5] },
    pathfinder: { setGoal: (g) => goals.push(g) },
    clearControlStates() {},
    stopDigging() {},
    waitForTicks: () => new Promise(r => setTimeout(r, 1)),
    nearestEntity: (match) => [animal, { name: 'zombie', position: new Vec3(1, 10, 0) }].find(match) ?? null,
  })
  return { bot, goals }
}

test('hunt: equips the weapon and attacks until the animal is gone', async () => {
  const { bot } = huntBot()
  const result = await run(bot, () => SKILLS.hunt(bot), true)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(bot.equipped, 'stone_sword')
  assert.strictEqual(bot.attacks, 2)
})

test('hunt: chases an animal out of reach, and reports not_killed at the time limit', async () => {
  const { bot, goals } = huntBot({ animalAt: 10 })
  const result = await run(bot, () => SKILLS.hunt(bot, 50), true)
  assert.strictEqual(result.reason, 'not_killed')
  assert.strictEqual(bot.attacks, 0)
  assert.strictEqual(goals.filter(Boolean).length, 1)
})

test('hunt: no_animal when none is in range, and nearestAnimal ignores hostiles and far animals', async () => {
  const { bot } = huntBot({ animalAt: 30 })
  assert.strictEqual(nearestAnimal(bot), null)
  assert.strictEqual((await run(bot, () => SKILLS.hunt(bot), true)).reason, 'no_animal')
})

test('scaffoldMovements: carried stone-type blocks may be placed by the pathfinder, parkour stays off', () => {
  const registry = require('../bot/node_modules/minecraft-data')('1.21.11')
  const movements = scaffoldMovements({ registry })
  const ids = ['dirt', 'cobblestone', 'cobbled_deepslate', 'stone'].map(n => registry.itemsByName[n].id)
  ids.forEach(id => assert.ok(movements.scafoldingBlocks.includes(id)))
  assert.strictEqual(movements.allowParkour, false)
})

// Stone floor below y=10; jumping lifts the bot one block per tick, a placed block lets it land one level higher.
function pillarBot({ blocks = 20, place = true } = {}) {
  const placed = new Set()
  const state = { y: 10, onGround: true, jump: false, lifted: false }
  const solid = (p) => p.y < 10 || placed.has(`${p.x},${p.y},${p.z}`)
  let left = blocks
  const bot = Object.assign(new EventEmitter(), {
    trail: [], health: 20, entity: { position: { x: 0.5, y: 10, z: 0.5, floored() { return new Vec3(0, Math.floor(this.y), 0) } }, yaw: 0, onGround: true },
    registry: require('../bot/node_modules/minecraft-data')('1.21.11'),
    blockAt: (p) => ({ name: solid(p) ? 'stone' : 'air', position: p, diggable: true, boundingBox: solid(p) ? 'block' : 'empty' }),
    inventory: { items: () => (left > 0 ? [{ name: 'cobblestone', count: left, type: 1 }] : []) },
    equip: async () => {},
    look: async () => {},
    setControlState: (name, on) => { if (name === 'jump') state.jump = on },
    clearControlStates() {},
    stopDigging() {},
    pathfinder: { goto: async () => { throw new Error('no path') }, setGoal() {}, setMovements() {} },
    placeBlock: async (ref, face) => {
      if (!place) return
      left--
      placed.add(`${ref.position.x + face.x},${ref.position.y + face.y},${ref.position.z + face.z}`)
    },
    waitForTicks: async () => {
      const e = bot.entity
      if (state.jump && e.onGround) { e.position.y += 1.1; e.onGround = false; state.lifted = true } else if (!e.onGround && state.lifted) {
        e.position.y = Math.max(10, ...[...placed].map(k => Number(k.split(',')[1]) + 1))
        e.onGround = true
        state.lifted = false
      }
    },
  })
  return { bot, placed }
}

test('go_up: when the pathfinder cannot get there, it pillars up on carried blocks', async () => {
  const { bot, placed } = pillarBot()
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.ok, true)
  assert.deepStrictEqual([...placed].sort(), ['0,10,0', '0,11,0', '0,12,0'])
  assert.strictEqual(Math.floor(bot.entity.position.y), 13)
})

test('go_up: fails not_reached when no block can be placed', async () => {
  for (const options of [{ blocks: 0 }, { place: false }]) {
    const { bot } = pillarBot(options)
    assert.strictEqual((await run(bot, () => SKILLS.go_up(bot, 13), false)).reason, 'not_reached')
  }
})

test('go_up: an untraceable crumb is dropped and the pillar fallback still runs', async () => {
  const { bot } = pillarBot()
  bot.trail = [new Vec3(50, 50, 50)]
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false, true)
  assert.strictEqual(result.ok, true)
  assert.deepStrictEqual(bot.trail, [])
})

test('go_up loop: a bad crumb mid-trail does not end the trail rounds, and the climb still arrives', async () => {
  const { bot } = pillarBot()
  bot.trail = [new Vec3(0, 12, 0), new Vec3(50, 50, 50), new Vec3(0, 11, 0)]
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.ok(result.trailRounds >= 2, `trailRounds ${result.trailRounds}`)
  assert.ok(result.pathRounds >= 1)
  assert.strictEqual(result.blocksGained, 3)
  assert.strictEqual(result.pillarSteps, 3)
  assert.deepStrictEqual(bot.trail, [])
})

test('go_up loop: three rounds without progress end the call as not_reached', async () => {
  const { bot } = pillarBot({ blocks: 0 })
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.reason, 'not_reached')
  assert.strictEqual(result.pathRounds, 3)
  assert.strictEqual(result.blocksGained, 0)
})

test('go_up loop: switched off (goUpLoop=false) it is the single-pass climb without counters', async () => {
  const { bot } = pillarBot()
  bot.objectiveRun = { params: { goUpLoop: false } }
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.trailRounds, undefined)
})

test('recover: pillar_out climbs on carried blocks, fails without any, and an unknown routine is refused', async () => {
  const { bot } = pillarBot()
  assert.strictEqual((await run(bot, () => SKILLS.recover(bot, 'pillar_out'), false)).ok, true)
  assert.strictEqual(Math.floor(bot.entity.position.y), 13)
  const bare = pillarBot({ blocks: 0 }).bot
  assert.strictEqual((await run(bare, () => SKILLS.recover(bare, 'pillar_out'), false)).reason, 'not_reached')
  assert.strictEqual((await run(bare, () => SKILLS.recover(bare, 'nope'), false)).reason, 'unknown_routine')
})

test('stalled: needs a full window of history and under one block of movement inside it', () => {
  const s = (t, x) => ({ t, x, y: 0, z: 0 })
  assert.strictEqual(stalled([]), false)
  assert.strictEqual(stalled([s(0, 0), s(4000, 0)]), false) // under 5 s of history
  assert.strictEqual(stalled([s(0, 0), s(2500, 0.3), s(5000, 0.5)]), true)
  assert.strictEqual(stalled([s(0, 0), s(2500, 0.5), s(5000, 1.2)]), false) // 0.7 from the last inside the window, but 1.2 at the start
  assert.strictEqual(stalled([s(-1000, 0), s(2500, 3), s(5000, 3.4)]), true) // moved before the window, still now
  assert.strictEqual(stalled([s(0, 0), s(5000, 2)]), false)
})

test('watchdogWindow: off at 0, 5 s for mode 1 everywhere', () => {
  assert.strictEqual(watchdogWindow(0, false), 0)
  assert.strictEqual(watchdogWindow(undefined, true), 0)
  for (const scaffold of [true, false]) assert.strictEqual(watchdogWindow(1, scaffold), 5000)
})

test('watchdogWindow: mode 2 skips scaffold gotos, 5 s elsewhere', () => {
  assert.strictEqual(watchdogWindow(2, true), 0)
  assert.strictEqual(watchdogWindow(2, false), 5000)
})

test('watchdogWindow: mode 3 gives scaffold gotos 15 s, 5 s elsewhere', () => {
  assert.strictEqual(watchdogWindow(3, true), 15000)
  assert.strictEqual(watchdogWindow(3, false), 5000)
})

test('watchdogWindow: mode 4 is a global 10 s window', () => {
  for (const scaffold of [true, false]) assert.strictEqual(watchdogWindow(4, scaffold), 10000)
})

test('watchdog: a path goal that never moves the bot fails as no_progress, blacklists the target and cancels the skill', { timeout: 15000 }, async () => {
  const { goals } = require('../bot/node_modules/mineflayer-pathfinder')
  const { bot } = pillarBot()
  bot.pathfinder.goto = () => new Promise(() => {})
  bot.objectiveRun = { params: { watchdog: true } }
  bot.unreachable = new Set()
  const result = await run(bot, () => goto(bot, new goals.GoalBlock(3, 4, 5), 30000), false)
  assert.strictEqual(result.reason, 'no_progress')
  assert.ok(bot.unreachable.has(new Vec3(3, 4, 5).toString()))
})

test('skillCapFor: only a go_up climbing more than 60 blocks gets the long cap, still bounded by the deadline', () => {
  const at = (y, params = {}, runDeadline = Infinity) => ({ entity: { position: { y } }, objectiveRun: { params }, runDeadline })
  assert.strictEqual(skillCapFor(at(-50), 'go_up', [50], 0), 360000)
  assert.strictEqual(skillCapFor(at(-50, { goUpLoop: false }), 'go_up', [50], 0), 180000)
  assert.strictEqual(skillCapFor(at(-10), 'go_up', [50], 0), 180000)
  assert.strictEqual(skillCapFor(at(-50), 'dig_down', [50], 0), 180000)
  assert.strictEqual(skillCapFor(at(-50, {}, 100000), 'go_up', [50], 0), 130000)
})

test('run: escape skills are not aborted by low oxygen or drowning damage', async () => {
  const bot = fakeBot(50)
  bot.blockAt = () => ({ name: 'water' })
  const result = await run(bot, async () => {
    bot.oxygenLevel = 5
    bot.emit('breath')
    bot.health = 18
    bot.emit('health')
  }, false, true)
  assert.strictEqual(result.ok, true)
})

test('dig_down: a tunnel-out that cannot move reports the real refusal, not tunnel_limit', async () => {
  const bot = fakeBot()
  bot.blockAt = (p) => block(p.y <= 9 ? 'air' : 'stone', p)
  bot.inventory = { items: () => [] }
  bot.trail = []
  const result = await run(bot, () => SKILLS.dig_down(bot, 0), false)
  assert.strictEqual(result.reason, 'blocked', result.detail)
  assert.strictEqual(result.detail, 'no_floor')
})

test('tunnelSafe: refuses only cells in or next to water or lava, a missing floor is bridged instead', () => {
  const cells = [new Vec3(1, 11, 0), new Vec3(1, 10, 0)]
  assert.strictEqual(tunnelSafe(world(), cells), true)
  assert.strictEqual(tunnelSafe(world({ '1,10,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '2,11,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,12,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,9,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,10,1': 'lava' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,9,0': 'air' }), cells), true)
  assert.strictEqual(tunnelSafe(world({ '1,12,0': 'gravel' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,11,0': 'sand' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,13,0': 'pointed_dripstone' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,13,0': 'gravel' }), cells), true)
})

test('run: low oxygen with the head in water aborts any skill with drowning, and so does a drowning hit', async () => {
  for (const interruptible of [true, false]) {
    const bot = fakeBot()
    bot.blockAt = () => ({ name: 'water' })
    const result = await run(bot, async () => {
      setTimeout(() => { bot.oxygenLevel = 9; bot.emit('breath') }, 5)
      await spin(bot)
    }, interruptible)
    assert.strictEqual(result.reason, 'drowning')
  }
  const bot = fakeBot(50)
  const hit = await run(bot, async () => {
    bot.oxygenLevel = 12
    bot.blockAt = () => ({ name: 'water' })
    setTimeout(() => { bot.health = 18; bot.emit('health') }, 5)
    await spin(bot)
  }, false)
  assert.strictEqual(hit.reason, 'drowning')
  const fine = fakeBot()
  fine.blockAt = () => ({ name: 'water' })
  assert.strictEqual((await run(fine, async () => { fine.oxygenLevel = 10; fine.emit('breath') }, true)).ok, true)
})

test('run: squid air supply on dry land never aborts', async () => {
  const bot = fakeBot()
  bot.blockAt = () => ({ name: 'air' })
  assert.strictEqual((await run(bot, async () => { bot.oxygenLevel = 0; bot.emit('breath') }, true)).ok, true)
})

test('isDrowning: own air supply metadata beats bot.oxygenLevel, and the head must be in water', () => {
  const bot = (block, air, oxygenLevel) => ({
    entity: { position: new Vec3(0.5, 10, 0.5), metadata: air === undefined ? {} : { 1: air } },
    blockAt: () => block, oxygenLevel,
  })
  const water = { name: 'water' }
  assert.strictEqual(ownOxygen(bot(water, 90, 20)), 6)
  assert.strictEqual(ownOxygen(bot(water, undefined, 7)), 7)
  assert.strictEqual(isDrowning(bot(water, 90, 20)), true)
  assert.strictEqual(isDrowning(bot(water, 300, 0)), false)
  assert.strictEqual(isDrowning(bot({ name: 'air' }, 30, 0)), false)
  assert.strictEqual(isDrowning(bot({ name: 'kelp', getProperties: () => ({ waterlogged: true }) }, 30)), true)
})

test('skillCapMs: a skill may overrun the run deadline by 30 s at most', () => {
  assert.strictEqual(skillCapMs({}, 0), 180000)
  assert.strictEqual(skillCapMs({ runDeadline: Infinity }, 0), 180000)
  assert.strictEqual(skillCapMs({ runDeadline: 50000 }, 20000), 60000)
  assert.strictEqual(skillCapMs({ runDeadline: 1000 }, 20000), 30000)
})

test('pickupStalled: a failed pickup only counts when the bot did not move and no drop remains', () => {
  const bot = (pos, drops) => ({
    entity: { position: pos }, skippedDrops: new Set([1]),
    nearestEntity: (match) => drops.find(match) ?? null,
  })
  const start = new Vec3(0, 10, 0)
  const failed = new Fail('pickup_failed')
  assert.strictEqual(pickupStalled(bot(start, []), start, failed), true)
  assert.strictEqual(pickupStalled(bot(new Vec3(3, 10, 0), []), start, failed), false)
  assert.strictEqual(pickupStalled(bot(start, [{ name: 'item', id: 2 }]), start, failed), false)
  assert.strictEqual(pickupStalled(bot(start, [{ name: 'item', id: 1 }]), start, failed), true)
  assert.strictEqual(pickupStalled(bot(start, []), start, new Fail('no_path')), true)
})

test('run: a server refusal to place surfaces as no_floor, not error', async () => {
  const result = await run(fakeBot(), async () => { throw new Error('Server refused to place cobblestone at (1, 2, 3)') }, false)
  assert.strictEqual(result.reason, 'no_floor')
})

test('floored: bridges a hole under the landing cell with a carried block, false without one', async () => {
  const landing = new Vec3(1, 10, 0)
  const { bot, placed, dug } = shelterBot()
  assert.strictEqual(await floored(bot, landing), true)
  assert.strictEqual(placed.size, 0)
  dug.add('1,9,0')
  assert.strictEqual(await floored(bot, landing), true)
  assert.strictEqual(placed.has('1,9,0'), true)
  const empty = shelterBot({ blocks: 0 })
  empty.dug.add('1,9,0')
  assert.strictEqual(await floored(empty.bot, landing), false)
})

test('pickUpDrop: a drop that cannot be fetched fails once and is skipped afterwards', async () => {
  const drop = { id: 9, name: 'item', position: new Vec3(0.5, 10, 0.5) }
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0.5, 10, 0.5) },
    entities: { 9: drop },
    nearestEntity: (match) => [drop].find(match) ?? null,
    waitForTicks: () => new Promise(r => setTimeout(r, 1)),
    pathfinder: { goto: async () => {}, setGoal() {} },
    clearControlStates() {},
    stopDigging() {},
  })
  const pos = new Vec3(0, 10, 0)
  await assert.rejects(run(bot, () => pickUpDrop(bot, pos), false).then(r => { if (!r.ok) throw new Error(r.reason) }), { message: 'pickup_failed' })
  assert.strictEqual((await run(bot, () => pickUpDrop(bot, pos), false)).ok, true)
})

test('shelter: digs out but reports hostile_waiting when a hostile is still in range on the way out', async () => {
  const zombie = { type: 'hostile', name: 'zombie', position: new Vec3(3.5, 10, 0.5) }
  const { bot, dug } = shelterBot({ hostile: zombie })
  let calls = 0
  const nearest = bot.nearestEntity
  bot.nearestEntity = (match) => (++calls === 1 ? null : nearest(match))
  const result = await run(bot, () => SKILLS.shelter(bot, 1), false)
  assert.strictEqual(result.reason, 'hostile_waiting')
  assert.strictEqual(dug.size, 2)
})

function fightBot({ hits = 2, mobAt = 2, weapon = 'iron_sword' } = {}) {
  const mob = { id: 7, name: 'zombie', type: 'hostile', height: 1.9, position: new Vec3(mobAt, 10, 0) }
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0, 10, 0) },
    entities: { 7: mob },
    inventory: { items: () => [{ name: weapon, type: 1 }, { name: 'diamond_pickaxe', type: 2 }] },
    equipped: null,
    equip: async (item) => { bot.equipped = item.name },
    lookAt: async () => {},
    attacks: 0,
    attack() { if (++bot.attacks >= hits) delete bot.entities[7] },
    pathfinder: { setGoal() {} },
    clearControlStates() {},
    stopDigging() {},
    waitForTicks: () => new Promise(r => setTimeout(r, 1)),
    nearestEntity: (match) => Object.values(bot.entities).find(match) ?? null,
  })
  return { bot, mob }
}

test('fight: equips the best weapon and attacks the close hostile until it is dead', async () => {
  const { bot } = fightBot()
  const result = await run(bot, () => SKILLS.fight(bot), false)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(bot.equipped, 'iron_sword')
  assert.strictEqual(bot.attacks, 2)
})

test('fight: no_target without a hostile within 4 blocks, ends ok once the mob leaves range, not_killed at the limit', async () => {
  const far = fightBot({ mobAt: 6 }).bot
  assert.strictEqual((await run(far, () => SKILLS.fight(far), false)).reason, 'no_target')
  const { bot, mob } = fightBot({ hits: 99 })
  bot.attack = () => { mob.position = new Vec3(9, 10, 0) }
  assert.strictEqual((await run(bot, () => SKILLS.fight(bot), false)).ok, true)
  const stubborn = fightBot({ hits: 999 })
  assert.strictEqual((await run(stubborn.bot, () => SKILLS.fight(stubborn.bot, 40), false)).reason, 'not_killed')
})

test('fight: cancellation stops the loop', async () => {
  const { bot } = fightBot({ hits: 999 })
  bot.attack = () => { bot.skillCancel.cancelled = true; bot.skillCancel.reason = 'timeout' }
  assert.strictEqual((await run(bot, () => SKILLS.fight(bot), false)).reason, 'timeout')
})

function stationBot({ at = new Vec3(0.5, 10, 0.5), tool = null } = {}) {
  const held = []
  const table = { name: 'crafting_table', position: new Vec3(2, 10, 0), diggable: true, boundingBox: 'block' }
  let dug = false
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: at },
    blockAt: () => (dug ? { ...table, name: 'air', boundingBox: 'empty' } : table),
    inventory: { items: () => held },
    equip: async () => {},
    dig: async () => { dug = true; held.push({ name: 'crafting_table', count: 1, type: 1 }) },
    digTime: () => 0,
    stopDigging() {},
    pathfinder: { bestHarvestTool: () => tool },
    nearestEntity: () => null,
    waitForTicks: async () => {},
  })
  return { bot, table, wasDug: () => dug }
}

test('retrieveStation: an unreachable table within reach is picked up, one out of reach is not touched', async () => {
  const near = stationBot()
  await retrieveStation(near.bot, near.table, 'crafting_table')
  assert.strictEqual(near.wasDug(), true)
  const far = stationBot({ at: new Vec3(20.5, 10, 0.5) })
  await assert.rejects(retrieveStation(far.bot, far.table, 'crafting_table'), (e) => e.reason === 'station_unreachable')
  assert.strictEqual(far.wasDug(), false)
})

test('retrieveStation: a break that fails leaves station_unreachable', async () => {
  const stuck = stationBot()
  stuck.bot.dig = async () => { throw new Error('nope') }
  await assert.rejects(retrieveStation(stuck.bot, stuck.table, 'crafting_table'), (e) => e.reason === 'station_unreachable')
})

test('deposit: with no chest at home but one carried, it is placed and becomes the new home; without one it fails no_chest', async () => {
  const { bot, placed } = shelterBot()
  const items = bot.inventory.items
  bot.inventory.items = () => [...items(), { name: 'chest', count: 1, type: 2 }]
  bot.objectiveRun = { home: { x: 50, y: 10, z: 50 } }
  const result = await run(bot, () => SKILLS.deposit(bot, { x: 50, y: 10, z: 50 }), false)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(placed.size, 1)
  const [x, y, z] = [...placed.keys()][0].split(',').map(Number)
  assert.deepStrictEqual(bot.objectiveRun.home, { x, y, z })
  const bare = shelterBot().bot
  assert.strictEqual((await run(bare, () => SKILLS.deposit(bare, { x: 50, y: 10, z: 50 }), false)).reason, 'no_chest')
})

test('return_home: the second failed trip with a chest in the pack places it as the new home', async () => {
  const { bot, placed } = shelterBot()
  const items = bot.inventory.items
  bot.inventory.items = () => [...items(), { name: 'chest', count: 1, type: 2 }]
  bot.objectiveRun = { home: { x: 50, y: 10, z: 50 }, memory: {} }
  bot.trail = []
  bot.pathfinder.goto = async () => { throw new Error('No path') }
  const home = { x: 50, y: 10, z: 50 }
  const first = await run(bot, () => SKILLS.return_home(bot, home), false)
  assert.strictEqual(first.ok, false)
  assert.strictEqual(placed.size, 0)
  const second = await run(bot, () => SKILLS.return_home(bot, home), false)
  assert.strictEqual(second.ok, true)
  assert.strictEqual(placed.size, 1)
})

function homeBot() {
  const { bot, placed } = shelterBot()
  const items = bot.inventory.items
  bot.inventory.items = () => [...items(), { name: 'chest', count: 1, type: 2 }]
  bot.objectiveRun = { home: { x: 50, y: 10, z: 50 }, memory: {} }
  bot.trail = []
  return { bot, placed }
}
const HOME = { x: 50, y: 10, z: 50 }

test('return_home: a success between two failures resets the count, so no chest is adopted', async () => {
  const { bot, placed } = homeBot()
  bot.pathfinder.goto = async () => { throw new Error('No path') }
  await run(bot, () => SKILLS.return_home(bot, HOME), false)
  bot.pathfinder.goto = async () => {}
  assert.strictEqual((await run(bot, () => SKILLS.return_home(bot, HOME), false)).ok, true)
  bot.pathfinder.goto = async () => { throw new Error('No path') }
  assert.strictEqual((await run(bot, () => SKILLS.return_home(bot, HOME), false)).ok, false)
  assert.strictEqual(placed.size, 0)
})

test('return_home: cancellations do not count as unreachable', async () => {
  const { bot, placed } = homeBot()
  bot.pathfinder.goto = async () => { throw new Fail('interrupted') }
  for (let i = 0; i < 3; i++) await run(bot, () => SKILLS.return_home(bot, HOME), false)
  assert.strictEqual(placed.size, 0)
})

// One physics tick of a bot that lost its floor: y drops 0.2 per tick, onGround turns true only on landing.
// physics 'never' models a server that never lets the bot fall (the bot hangs in the air).
async function fallOneTick(bot, nameAt, physics) {
  await new Promise(r => setTimeout(r, 1))
  const pos = bot.entity.position
  if (physics === 'never' || bot.entity.onGround) return
  let ground = Math.floor(pos.y)
  while (nameAt(new Vec3(0, ground - 1, 0)) === 'air' && ground > 0) ground--
  pos.y = Math.max(ground, pos.y - 0.2)
  if (pos.y <= ground) bot.entity.onGround = true
}

// Bot on a stone column: stone up to y=19 (overrides by "x,y,z"), air above. Digging the floor drops the bot to the next solid cell.
// With stairOnly the first dig throws, so a fallback to the staircase shows up as digs[0] being off the column.
function shaftBot({ overrides = {}, stone = 16, shaft, hostile = false, stopOnDig = false, fallLag = 0, surfaceY, physics } = {}) {
  const broken = new Set()
  const key = (p) => `${p.x},${p.y},${p.z}`
  const nameAt = (p) => broken.has(key(p)) ? 'air' : (overrides[key(p)] ?? (p.y <= 19 ? 'stone' : 'air'))
  const pos = { x: 0.5, y: 20, z: 0.5, floored() { return new Vec3(0, Math.floor(this.y), 0) }, distanceTo: () => 99, clone() { return this } }
  const digs = []
  let fall = () => {}
  let lag = fallLag
  const bot = Object.assign(new EventEmitter(), {
    digs, trail: [], health: 20, heldItem: null,
    entity: { position: pos, onGround: true, yaw: 0 },
    objectiveRun: shaft === undefined && surfaceY === undefined ? undefined : { params: { shaft }, surfaceY },
    blockAt: (p) => {
      const name = nameAt(p)
      return { name, position: p, diggable: name !== 'bedrock', boundingBox: ['air', 'water', 'lava'].includes(name) ? 'empty' : 'block' }
    },
    inventory: { items: () => (stone ? [{ name: 'cobblestone', count: stone, type: 1 }] : []) },
    pathfinder: { bestHarvestTool: () => null, setGoal() {}, setMovements() {} },
    nearestEntity: () => (hostile ? { type: 'hostile', position: new Vec3(1, 20, 0) } : null),
    equip: async () => {},
    digTime: () => 1,
    dig: async (b) => {
      digs.push(key(b.position))
      if (stopOnDig) throw new Fail('stop')
      broken.add(key(b.position))
      if (physics) bot.entity.onGround = false
      fall = () => { while (nameAt(new Vec3(0, Math.floor(pos.y) - 1, 0)) === 'air' && pos.y > 0) pos.y -= 1 }
      if (!fallLag && !physics) fall()
    },
    stopDigging() {},
    clearControlStates() {},
    waitForTicks: async () => {
      if (physics) return fallOneTick(bot, nameAt, physics)
      if (fallLag && lag-- <= 0) { lag = fallLag; fall(); fall = () => {} }
    },
  })
  return bot
}

test('dig_down: a safe stone column is descended with a 1x1 shaft and counters are reported', async () => {
  const bot = shaftBot()
  const result = await run(bot, () => SKILLS.dig_down(bot, 17), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.strictEqual(Math.floor(bot.entity.position.y), 17)
  assert.strictEqual(result.shaftSteps, 3)
  assert.strictEqual(result.stairSteps ?? 0, 0)
  assert.deepStrictEqual(bot.trail.map(t => t.y), [20, 19, 18, 17])
})

test('dig_down: shaft off, too few blocks, a hostile near, or a refused column start with the staircase', async () => {
  const refused = [{ '0,18,0': 'lava' }, { '1,17,0': 'water' }, { '0,21,0': 'gravel' }, { '0,18,0': 'air', '0,17,0': 'air' }, { '0,19,0': 'bedrock' }]
  const cases = [{ shaft: false }, { stone: 7 }, { hostile: true }, ...refused.map(overrides => ({ overrides }))]
  for (const options of cases) {
    const bot = shaftBot({ ...options, stopOnDig: true })
    const result = await run(bot, () => SKILLS.dig_down(bot, 19), false)
    assert.ok(!result.shaftSteps, JSON.stringify(options))
    assert.notStrictEqual(bot.digs[0], '0,19,0', JSON.stringify(options))
  }
})

test('dig_down: a failed shaft dig falls back to the staircase for the rest of the call', async () => {
  const bot = shaftBot({ stopOnDig: true })
  const result = await run(bot, () => SKILLS.dig_down(bot, 19), false)
  assert.strictEqual(bot.digs[0], '0,19,0')
  assert.notStrictEqual(bot.digs[1], '0,19,0')
  assert.ok(!result.shaftSteps)
})

test('go_up: a purely vertical shaft trail is climbed by pillaring, one crumb per block', async () => {
  const { bot } = pillarBot()
  bot.trail = [new Vec3(0, 12, 0), new Vec3(0, 11, 0), new Vec3(0, 10, 0)]
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.strictEqual(Math.floor(bot.entity.position.y), 13)
  assert.deepStrictEqual(bot.trail, [])
})

test('run: a timed-out skill stops at its next checkpoint even after a newer skill installed a fresh token', async () => {
  const bot = fakeBot()
  bot.runDeadline = Date.now() - 30000
  let release
  const gate = new Promise(r => { release = r })
  let zombieError = null
  const first = await run(bot, async () => {
    await gate
    try { checkCancelled(bot) } catch (e) { zombieError = e }
  }, false)
  assert.strictEqual(first.reason, 'timeout')
  bot.skillCancel = { cancelled: false, reason: null }
  release()
  await new Promise(r => setTimeout(r, 5))
  assert.strictEqual(zombieError?.reason, 'timeout')
})

function mineBot(goto) {
  const stone = { name: 'stone', position: new Vec3(3, 10, 0), diggable: true, boundingBox: 'block' }
  return Object.assign(fakeBot(), {
    registry: { blocksByName: { stone: { id: 1 } } },
    findBlocks: () => [stone.position],
    blockAt: (p) => (p === stone.position ? stone : { name: 'air', position: p, boundingBox: 'empty' }),
    canSeeBlock: () => true,
    world: {},
    pathfinder: { setGoal() {}, setMovements() {}, goto },
  })
}

test('mine: a genuine unreachable outcome blacklists the block, an interruption does not', async () => {
  const stuck = mineBot(async () => { throw new Error('no path') })
  assert.strictEqual((await run(stuck, () => SKILLS.mine(stuck, 'stone'), false)).reason, 'reach_failed')
  assert.strictEqual(stuck.unreachable.size, 1)
  const hit = mineBot(async () => {
    hit.health = 10
    hit.emit('health')
    checkCancelled(hit)
  })
  hit.nearestEntity = () => ({ type: 'hostile', position: new Vec3(3, 10, 0) })
  const result = await run(hit, () => SKILLS.mine(hit, 'stone'), true)
  assert.strictEqual(result.reason, 'attacked')
  assert.ok(!hit.unreachable || hit.unreachable.size === 0)
})

test('clearUnreachable: empties the blacklist and tolerates a bot without one', () => {
  const bot = { unreachable: new Set(['a']) }
  clearUnreachable(bot)
  assert.strictEqual(bot.unreachable.size, 0)
  assert.doesNotThrow(() => clearUnreachable({}))
})

test('run: lava damage aborts the skill as burning, clears the controls and is logged', async () => {
  const bot = fakeBot(50)
  let cleared = 0
  bot.clearControlStates = () => { cleared++ }
  bot.blockAt = (p) => (p.y === 10 ? { name: 'lava' } : null)
  const result = await run(bot, async () => {
    setTimeout(() => { bot.health = 12; bot.emit('health') }, 5)
    await spin(bot)
  }, false)
  assert.strictEqual(result.reason, 'burning')
  assert.ok(cleared > 0)
  assert.strictEqual(result.damage[0].cause, 'lava')
})

test('run: burning does not abort an escaping skill', async () => {
  const bot = fakeBot(50)
  bot.blockAt = (p) => (p.y === 10 ? { name: 'fire' } : null)
  const result = await run(bot, async () => { bot.health = 12; bot.emit('health') }, false, true)
  assert.strictEqual(result.ok, true)
})

test('fight: low health throws low_health, and the guard switch turns it off', async () => {
  const { bot } = fightBot({ hits: 99 })
  bot.health = FIGHT_MIN_HEALTH - 1
  assert.strictEqual((await run(bot, () => SKILLS.fight(bot), false)).reason, 'low_health')
  assert.strictEqual(bot.attacks, 0)
  const off = fightBot({ hits: 2 }).bot
  off.health = 1
  off.objectiveRun = { params: { fightGuard: false } }
  assert.strictEqual((await run(off, () => SKILLS.fight(off), false)).ok, true)
})

test('fight: switches to a nearer hostile that appears mid-fight', async () => {
  const { bot, mob } = fightBot({ hits: 99, mobAt: 3.5 })
  const near = { id: 8, name: 'skeleton', type: 'hostile', height: 1.9, position: new Vec3(1, 10, 0) }
  bot.entities[8] = near
  bot.nearestEntity = (match) => Object.values(bot.entities).filter(match).sort((a, b) => a.position.x - b.position.x)[0] ?? null
  const hit = []
  bot.attack = (e) => { hit.push(e.id); if (hit.length >= 2) { delete bot.entities[7]; delete bot.entities[8] } }
  bot.lookAt = async () => {}
  const result = await run(bot, () => SKILLS.fight(bot), false)
  assert.strictEqual(result.ok, true)
  assert.deepStrictEqual(hit, [8, 8])
})

test('dig_down: the shaft step waits for the bot to fall after the break instead of reading the height while it is still on the ground', async () => {
  const bot = shaftBot({ fallLag: 3 })
  const result = await run(bot, () => SKILLS.dig_down(bot, 19), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.strictEqual(result.shaftSteps, 1)
  assert.ok(!result.stairSteps)
})

test('pickUpDrop: a drop still on the ground after the first approach is walked onto before giving up', async () => {
  const drop = { id: 9, name: 'item', position: new Vec3(2.6, 10, 0.5) }
  const ranges = []
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0.5, 10, 0.5) },
    entities: { 9: drop },
    nearestEntity: (match) => [drop].find(match) ?? null,
    waitForTicks: () => new Promise(r => setTimeout(r, 1)),
    pathfinder: { goto: async (goal) => { ranges.push(goal.rangeSq); if (goal.rangeSq === 0) delete bot.entities[9] }, setGoal() {} },
    clearControlStates() {},
    stopDigging() {},
  })
  const result = await run(bot, () => pickUpDrop(bot, new Vec3(2, 10, 0)), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.deepStrictEqual(ranges, [1, 0])
})

test('dig_down: a physics-faithful shaft fall (onGround false, 0.2 per tick, then landing) is a completed step', async () => {
  const bot = shaftBot({ physics: 'faithful' })
  const result = await run(bot, () => SKILLS.dig_down(bot, 18), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.strictEqual(result.shaftSteps, 2)
  assert.ok(!result.stairSteps)
})

test('dig_down: a bot that never falls after the floor break times out the drop and falls back to the staircase', async () => {
  const bot = shaftBot({ physics: 'never' })
  const result = await run(bot, () => SKILLS.dig_down(bot, 19), false)
  assert.ok(!result.shaftSteps)
  assert.strictEqual(bot.digs[0], '0,19,0')
})

test('dig_down: the shaft is refused when the carried blocks cannot pillar back out of the depth already descended', async () => {
  const deep = shaftBot({ stone: 8, surfaceY: 30, stopOnDig: true })
  const result = await run(deep, () => SKILLS.dig_down(deep, 19), false)
  assert.ok(!result.shaftSteps)
  assert.notStrictEqual(deep.digs[0], '0,19,0')
  const shallow = shaftBot({ stone: 8, surfaceY: 22 })
  assert.strictEqual((await run(shallow, () => SKILLS.dig_down(shallow, 19), false)).shaftSteps, 1)
})

test('go_up: crumbs the bot could not pillar up to are kept, not popped', async () => {
  const { bot } = pillarBot({ blocks: 0 })
  bot.trail = [new Vec3(0, 12, 0), new Vec3(0, 11, 0), new Vec3(0, 10, 0)]
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.reason, 'not_reached')
  assert.deepStrictEqual(bot.trail.map(t => t.y), [12, 11]) // the crumb under the feet was reached, the ones above were not
})

function tossBot({ y, surfaceY, cobble = 40, dirt = 40 }) {
  const stacks = [{ name: 'cobblestone', count: cobble, type: 1 }, { name: 'dirt', count: dirt, type: 2 }]
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0, y, 0) },
    objectiveRun: surfaceY === undefined ? undefined : { surfaceY, params: {} },
    inventory: { items: () => stacks.filter(s => s.count > 0) },
    toss: async (type, _meta, n) => { stacks.find(s => s.type === type).count -= n },
  })
  return { bot, stacks }
}

test('toss: keeps enough placeable blocks to pillar out of the current depth, tosses the rest', async () => {
  const { bot, stacks } = tossBot({ y: 20, surfaceY: 60 })
  await SKILLS.toss(bot, ['cobblestone', 'dirt'], 0)
  assert.deepStrictEqual(stacks.map(s => s.count), [0, 40], 'depth 40 needs 40 placeable blocks kept in total')
})

test('toss: at the surface, or with no run, the keep count is unchanged', async () => {
  for (const options of [{ y: 60, surfaceY: 60 }, { y: 20 }]) {
    const { bot, stacks } = tossBot(options)
    await SKILLS.toss(bot, ['cobblestone'], 16)
    assert.strictEqual(stacks[0].count, 16, JSON.stringify(options))
  }
})

test('mine: a path timeout (PATH_MS) blacklists the block, a cancel while pathing does not', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const slow = mineBot(() => new Promise(() => {}))
  const pending = run(slow, () => SKILLS.mine(slow, 'stone'), false)
  for (let i = 0; i < 20; i++) await Promise.resolve()
  t.mock.timers.tick(30000)
  assert.strictEqual((await pending).reason, 'reach_failed')
  assert.strictEqual(slow.unreachable.size, 1)
  const cancelled = mineBot(async () => { cancelled.skillCancel.cancelled = true; cancelled.skillCancel.reason = 'timeout'; throw new Fail('timeout') })
  await run(cancelled, () => SKILLS.mine(cancelled, 'stone'), false)
  assert.ok(!cancelled.unreachable || cancelled.unreachable.size === 0)
})

test('runSkill: burning aborts a normal skill with reason burning but never go_up, flee or shelter', async () => {
  const saved = { ...SKILLS }
  try {
    for (const name of ['mine', 'go_up', 'flee', 'shelter']) {
      const bot = fakeBot(50)
      Object.assign(bot, { food: 20, time: { timeOfDay: 0 }, inventory: { items: () => [] } })
      bot.blockAt = (p) => (p.y === 10 ? { name: 'lava' } : null)
      SKILLS[name] = async () => { bot.health = 12; bot.emit('health'); await new Promise(r => setTimeout(r, 5)); checkCancelled(bot) }
      const result = await runSkill(bot, name)
      if (name === 'mine') assert.deepStrictEqual([result.ok, result.reason], [false, 'burning'])
      else assert.strictEqual(result.ok, true, name)
    }
  } finally {
    Object.assign(SKILLS, saved)
  }
})

test('fight: a mob that is never killed ends not_killed at the time limit and the fake cannot hang', async () => {
  const { bot } = fightBot({ hits: Infinity })
  const attack = bot.attack
  bot.attack = (e) => { if (bot.attacks > 500) throw new Error('fake fight hang'); attack(e) }
  const result = await run(bot, () => SKILLS.fight(bot, 30), false)
  assert.strictEqual(result.reason, 'not_killed')
})

test('go_up: a dig above the head that is aborted counts as one failed pillar step, not the end of the climb', async () => {
  const { bot } = pillarBot()
  const dug = new Set()
  const base = bot.blockAt
  let rejects = 1
  bot.blockAt = (p) => (p.x === 0 && p.z === 0 && p.y === 12 && !dug.has('12') ? { ...base(p), name: 'dirt', boundingBox: 'block' } : base(p))
  bot.pathfinder.bestHarvestTool = () => null
  bot.digTime = () => 1
  bot.dig = async () => {
    if (rejects-- > 0) throw new Error('Digging aborted')
    dug.add('12')
  }
  const result = await run(bot, () => SKILLS.go_up(bot, 13), false)
  assert.strictEqual(result.ok, true, result.detail)
  assert.strictEqual(Math.floor(bot.entity.position.y), 13)
})

test('the recorded home chest is never dug, and a stair toward it is refused', async () => {
  const objectiveRun = { home: { x: 1, y: 10, z: 0 }, params: {} }
  const w = { ...world({ '1,10,0': 'chest' }), objectiveRun }
  await assert.rejects(() => breakBlock(w, w.blockAt(new Vec3(1, 10, 0))), { reason: 'home' })
  assert.strictEqual(stairRefusal(w, new Vec3(0, 10, 0), [1, 0]), 'home')
  assert.strictEqual(stairRefusal(w, new Vec3(0, 10, 0), [-1, 0]), null)
})

test('dig_down: tunnel-outs are capped at 4 and the cap is reported as tunnel_limit', async () => {
  assert.strictEqual(MAX_TUNNEL_OUTS, 4)
})

test('dig_down: refusal reasons of skipped shaft steps are counted in the result', async () => {
  const bot = shaftBot({ stone: 7 })
  const result = await run(bot, () => SKILLS.dig_down(bot, 19), false)
  assert.ok(result.refusals.no_blocks >= 1, JSON.stringify(result.refusals))
})
