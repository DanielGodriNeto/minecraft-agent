// Live shaft-descent tests (needs the dev server). Reports seconds per block for shaft vs stairs.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const { connect, CENTER } = require('./harness.js')
const { runSkill } = require('../bot/skills.js')

let h
before(async () => { h = await connect() })
after(() => h?.end())

const TOP = -20 // column top; the bot starts standing on it
const START_Y = TOP + 1
const TARGET = START_Y - 30
const at = (dx, y, dz = 0) => ({ x: CENTER.x + dx, y, z: CENTER.z + dz })

// 30x30 stone block from the flat floor up to TOP (two fills, each under the 32768 limit).
async function buildColumn() {
  await h.reset({ x: 200, y: -60, z: 200 })
  await h.fill({ x: 201, y: -60, z: 201 }, { x: 215, y: TOP, z: 230 }, 'stone')
  await h.fill({ x: 216, y: -60, z: 201 }, { x: 230, y: TOP, z: 230 }, 'stone')
}

async function clearColumn() {
  await h.cmd(`/fill 201 -60 201 215 ${TOP} 230 air`)
  await h.cmd(`/fill 216 -60 201 230 ${TOP} 230 air`)
}

const lavaCells = () => [[3, -30, 0], [-3, -38, 0], [0, -44, 3], [0, -50, -3]].map(([dx, y, dz]) => at(dx, y, dz))

async function descend(shaft) {
  await buildColumn()
  const lava = lavaCells()
  for (const p of lava) await h.setblock(p, 'lava')
  await h.teleport({ ...CENTER, y: START_Y })
  await h.give('iron_pickaxe')
  await h.give('cobblestone', 32)
  h.bot.objectiveRun = { params: { shaft }, stopped: false }
  let minHealth = h.bot.health
  const onHealth = () => { minHealth = Math.min(minHealth, h.bot.health) }
  h.bot.on('health', onHealth)
  const t0 = Date.now()
  const res = await runSkill(h.bot, 'dig_down', TARGET)
  const secs = (Date.now() - t0) / 1000
  h.bot.off('health', onHealth)
  h.bot.objectiveRun = null
  return { res, secs, minHealth, lava }
}

test('shaft descent, go_up and stairs comparison', async () => {
  const shaft = await descend(true)
  const y = Math.floor(h.bot.entity.position.y)
  console.log(`SHAFT res=${JSON.stringify(shaft.res)} y=${y} ${shaft.secs}s ${(shaft.secs / (START_Y - y)).toFixed(2)} s/block`)
  assert.ok(shaft.res.ok, JSON.stringify(shaft.res))
  assert.ok(y <= TARGET, `y=${y}`)
  assert.ok(shaft.res.shaftSteps > 0, JSON.stringify(shaft.res))
  assert.strictEqual(shaft.minHealth, 20)
  for (const p of shaft.lava) assert.strictEqual(h.blockName(p), 'lava')

  const t0 = Date.now()
  const up = await runSkill(h.bot, 'go_up', START_Y)
  const upSecs = (Date.now() - t0) / 1000
  const upY = Math.floor(h.bot.entity.position.y)
  console.log(`GO_UP res=${JSON.stringify(up)} y=${upY} ${upSecs}s ${(upSecs / (upY - y || 1)).toFixed(2)} s/block`)
  assert.ok(Math.abs(upY - START_Y) <= 1, `back at ${upY}, start ${START_Y}`)
  for (const p of shaft.lava) assert.strictEqual(h.blockName(p), 'lava')

  const stairs = await descend(false)
  const sy = Math.floor(h.bot.entity.position.y)
  console.log(`STAIRS res=${JSON.stringify(stairs.res)} y=${sy} ${stairs.secs}s ${(stairs.secs / (START_Y - sy)).toFixed(2)} s/block`)
  assert.ok(stairs.res.ok, JSON.stringify(stairs.res))
  assert.strictEqual(stairs.minHealth, 20)
  for (const p of stairs.lava) assert.strictEqual(h.blockName(p), 'lava')
})

for (const hazard of ['lava', 'water']) {
  test(`shaft refuses ${hazard} under the path`, async () => {
    await buildColumn()
    const cell = at(0, START_Y - 3)
    await h.setblock(cell, hazard)
    await h.teleport({ ...CENTER, y: START_Y })
    await h.give('iron_pickaxe')
    await h.give('cobblestone', 32)
    h.bot.objectiveRun = { params: { shaft: true }, stopped: false }
    let minHealth = h.bot.health
    const onHealth = () => { minHealth = Math.min(minHealth, h.bot.health) }
    h.bot.on('health', onHealth)
    const res = await runSkill(h.bot, 'dig_down', START_Y - 6)
    h.bot.off('health', onHealth)
    h.bot.objectiveRun = null
    console.log(`REFUSE ${hazard} res=${JSON.stringify(res)} y=${h.bot.entity.position.y}`)
    assert.strictEqual(minHealth, 20)
    assert.strictEqual(h.blockName(cell), hazard)
    assert.ok(res.stairSteps > 0, `sidestep expected: ${JSON.stringify(res)}`) // shaft resumes only after leaving the hazard column
  })
}

test('cleanup', async () => { await clearColumn() })
