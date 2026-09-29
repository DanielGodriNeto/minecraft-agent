const { test } = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('../bot/node_modules/vec3')
const { EventEmitter } = require('node:events')
const { run, checkCancelled, cheapestPickaxe, stairRefusal, tunnelSafe, arrived, dropLoops, resetTrail, placeSpot, placeFace, pickupGoalY, onCanopy, mostCommon, resetStaleTrail, facing, damageCause, patchFaces, ledgeFloor, skillMovements, scaffoldMovements, placeableCount, safeToLeave, SKILLS, bestWeapon, nearestAnimal } = require('../bot/skills.js')

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
  assert.deepStrictEqual(result.damage.at(-1), { hp: 5, cause: 'undefined@10.0' })
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
      placed.set(`${ref.position.x + face.x},${ref.position.y + face.y},${ref.position.z + face.z}`, true)
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

test('shelter: waits while a hostile is within 8 blocks, and gives up at the wait cap', async () => {
  const zombie = { type: 'hostile', name: 'zombie', position: new Vec3(3.5, 10, 0.5) }
  const { bot } = shelterBot({ hostile: zombie })
  assert.strictEqual(safeToLeave(bot), false)
  zombie.position = new Vec3(12.5, 10, 0.5)
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

test('tunnelSafe: refuses cells in or next to water or lava, and cells without a floor', () => {
  const cells = [new Vec3(1, 11, 0), new Vec3(1, 10, 0)]
  assert.strictEqual(tunnelSafe(world(), cells), true)
  assert.strictEqual(tunnelSafe(world({ '1,10,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '2,11,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,12,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,9,0': 'water' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,10,1': 'lava' }), cells), false)
  assert.strictEqual(tunnelSafe(world({ '1,9,0': 'air' }), cells), false)
})
