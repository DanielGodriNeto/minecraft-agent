// Live: needs server/snapshots/diamonds-pristine and NO server running (the test owns it).
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/bot.js'))
const { createBot } = req('./bot.js')
const { startServer, restore } = req('./server.js')
const slots = req('./slots.json')

const SLOT = slots.find(s => s.id === 100) // dev set

async function sampleBlocks(server) {
  const bot = createBot({ username: 'Bot0' })
  await new Promise(r => bot.once('spawn', r))
  await server.command(`tp Bot0 ${SLOT.x + 0.5} ${SLOT.y} ${SLOT.z + 0.5}`)
  const at = (dx, dy, dz) => bot.blockAt(bot.entity.position.clone().set(SLOT.x + dx, SLOT.y + dy, SLOT.z + dz))
  const end = Date.now() + 30000
  while ((!at(0, -1, 0) || bot.entity.position.distanceTo(bot.entity.position.clone().set(SLOT.x + 0.5, SLOT.y, SLOT.z + 0.5)) > 1) && Date.now() < end) {
    await bot.waitForTicks(5)
  }
  const names = []
  for (let d = -4; d <= 4; d += 2) for (let dy = -3; dy <= 1; dy++) names.push(at(d, dy, -d)?.name)
  bot.end()
  return names
}

test('test_snapshot_restore', { timeout: 900000 }, async () => {
  restore()
  let server = await startServer()
  const pristine = await sampleBlocks(server)
  assert.ok(pristine.every(Boolean), 'sample chunk not loaded')
  await server.command(`fill ${SLOT.x - 4} ${SLOT.y - 3} ${SLOT.z - 4} ${SLOT.x + 4} ${SLOT.y + 1} ${SLOT.z + 4} glass`, /Successfully filled/)
  assert.ok((await sampleBlocks(server)).every(n => n === 'glass'))
  await server.stop()

  restore()
  server = await startServer()
  try {
    assert.deepStrictEqual(await sampleBlocks(server), pristine)
  } finally {
    await server.stop()
  }
})
