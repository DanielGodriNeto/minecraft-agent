// Live-server skill tests (npm run test:live). Needs the dev server running.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const { connect, CENTER } = require('./harness.js')
const { runSkill } = require('../bot/skills.js')

let h
before(async () => { h = await connect() })
after(() => h?.end())

const east = (dx, dy = 0) => ({ x: CENTER.x + dx, y: CENTER.y + dy, z: CENTER.z })

test('test_mine', async () => {
  await h.reset()
  await h.give('iron_pickaxe')
  await h.setblock(east(10), 'diamond_ore')
  const res = await runSkill(h.bot, 'mine', 'diamond_ore')
  assert.deepStrictEqual([res.ok, res.reason], [true, null], JSON.stringify(res))
  assert.ok(h.count('diamond') >= 1)
})

test('test_no_xray', async () => {
  await h.reset()
  await h.give('iron_pickaxe')
  await h.fill({ ...east(7), z: CENTER.z - 1 }, { ...east(9, 2), z: CENTER.z + 1 }, 'stone')
  await h.setblock(east(8, 1), 'diamond_ore')
  const res = await runSkill(h.bot, 'mine', 'diamond_ore')
  assert.deepStrictEqual([res.ok, res.reason], [false, 'not_visible'])
  assert.strictEqual(h.blockName(east(8, 1)), 'diamond_ore')
})

test('test_dig_down', async () => {
  await h.reset({ x: 200, y: -60, z: 200 }) // outside the tower, so the fill can't suffocate the bot
  await h.fill({ x: 201, y: -60, z: 201 }, { x: 230, y: -45, z: 230 }, 'stone')
  const lava = [[6, 0], [0, 6], [-6, 0], [0, -6]].map(([dx, dz]) => ({ x: CENTER.x + dx, y: -50, z: CENTER.z + dz }))
  for (const p of lava) await h.setblock(p, 'lava')
  await h.teleport({ ...CENTER, y: -44 })
  await h.give('iron_pickaxe')
  const res = await runSkill(h.bot, 'dig_down', -58)
  assert.ok(res.ok, JSON.stringify(res))
  assert.strictEqual(Math.floor(h.bot.entity.position.y), -58)
  assert.strictEqual(h.bot.health, 20)
  for (const p of lava) assert.strictEqual(h.blockName(p), 'lava')
})

test('test_craft_chain', async () => {
  await h.reset()
  await h.give('oak_log', 3)
  for (const [item, n] of [['oak_planks', 12], ['crafting_table', 1], ['stick', 4], ['wooden_pickaxe', 1]]) {
    const res = await runSkill(h.bot, 'craft', item, n)
    assert.ok(res.ok, `${item}: ${JSON.stringify(res)}`)
  }
  assert.strictEqual(h.count('wooden_pickaxe'), 1)
})

test('test_craft_missing', async () => {
  await h.reset()
  const res = await runSkill(h.bot, 'craft', 'wooden_pickaxe')
  assert.deepStrictEqual([res.ok, res.reason], [false, 'missing'])
})

test('test_smelt', async () => {
  await h.reset()
  for (const item of ['raw_iron', 'coal', 'furnace']) await h.give(item)
  const res = await runSkill(h.bot, 'smelt', 'iron_ingot')
  assert.ok(res.ok, JSON.stringify(res))
  assert.strictEqual(h.count('iron_ingot'), 1)
})

test('test_deposit', async () => {
  await h.reset()
  const chest = east(3)
  await h.setblock(chest, 'chest')
  await h.give('diamond', 5)
  await h.give('iron_pickaxe')
  await h.give('bread', 5)
  const res = await runSkill(h.bot, 'deposit', chest)
  assert.ok(res.ok, JSON.stringify(res))
  assert.deepStrictEqual([h.count('diamond'), h.count('iron_pickaxe'), h.count('bread')], [0, 1, 5])
})

test('test_deposit_chest_full', async () => {
  await h.reset()
  const chest = east(3)
  await h.setblock(chest, 'chest')
  for (let slot = 0; slot < 27; slot++) {
    await h.cmd(`/item replace block ${chest.x} ${chest.y} ${chest.z} container.${slot} with minecraft:stone 64`)
  }
  await h.give('diamond', 5)
  const told = h.once(h.owner, 'chat', 10000, (u, m) => u === 'DiamondBot' && /full/i.test(m))
  const res = await runSkill(h.bot, 'deposit', chest)
  assert.deepStrictEqual([res.ok, res.reason], [false, 'full'])
  await told
})

test('test_flee', async () => {
  await h.reset()
  const spot = east(4)
  await h.cmd(`/summon zombie ${spot.x} ${spot.y} ${spot.z} {NoAI:1b,PersistenceRequired:1b}`)
  await h.poll(() => h.bot.nearestEntity(e => e.name === 'zombie'))
  const res = await runSkill(h.bot, 'flee')
  assert.ok(res.ok, JSON.stringify(res))
  const zombie = h.bot.nearestEntity(e => e.name === 'zombie')
  assert.ok(!zombie || zombie.position.distanceTo(h.bot.entity.position) >= 16)
})

test('test_skill_timeout', async () => {
  await h.reset()
  const target = east(8, 3)
  await h.fill({ x: target.x - 3, y: -61, z: target.z - 3 }, { x: target.x + 3, y: -55, z: target.z + 3 }, 'bedrock', 'hollow')
  const t0 = Date.now()
  const res = await runSkill(h.bot, 'approach', target)
  assert.strictEqual(res.ok, false)
  assert.ok(Date.now() - t0 < 35000, `took ${Date.now() - t0} ms`)
})
