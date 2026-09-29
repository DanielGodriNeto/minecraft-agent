// Live: needs server/snapshots/diamonds-pristine and NO server running (the test owns it).
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/bot.js'))
const { createBot } = req('./bot.js')
const { runObjective, jitterParams } = req('./agent.js')
const { startServer, restore } = req('./server.js')
const slots = req('./slots.json')

const SLOT = slots.find(s => s.id === 101) // dev set
let server
let bot

before(async () => {
  restore()
  server = await startServer()
})
after(async () => {
  bot?.end()
  await server?.stop()
})

async function freshBot(logName) {
  bot?.end()
  bot = createBot({ username: 'Bot0' })
  bot.skillLogPath = path.join(__dirname, '..', 'logs', `${logName}.jsonl`)
  fs.rmSync(bot.skillLogPath, { force: true })
  await new Promise(r => bot.once('spawn', r))
  for (const cmd of ['time set 0', 'gamemode survival Bot0', 'clear Bot0', `spawnpoint Bot0 ${SLOT.x} ${SLOT.y} ${SLOT.z}`,
    `setblock ${SLOT.x + 2} ${SLOT.y} ${SLOT.z} chest`, `tp Bot0 ${SLOT.x + 0.5} ${SLOT.y} ${SLOT.z + 0.5}`]) await server.command(cmd)
  await bot.waitForTicks(40)
  await bot.waitForChunksToLoad()
  return { x: SLOT.x + 2, y: SLOT.y, z: SLOT.z }
}

const skillLog = () => fs.readFileSync(bot.skillLogPath, 'utf8').trim().split('\n').map(l => JSON.parse(l))

test('test_death_recovery', { timeout: 600000 }, async () => {
  const home = await freshBot('test-death-recovery')
  const run = runObjective(bot, { objective: { item: 'diamond', count: 'max' }, home, params: jitterParams(), deadline: Date.now() + 240000 })
  await new Promise(r => bot.once('physicsTick', r))
  while ((bot.objectiveRun?.decisions ?? 0) < 2) await bot.waitForTicks(20)
  const decisionsAtDeath = bot.objectiveRun.decisions
  await server.command('kill Bot0')
  const result = await run
  assert.strictEqual(result.deaths, 1)
  assert.notStrictEqual(result.reason, 'deaths')
  assert.ok(result.decisions > decisionsAtDeath + 2, `only ${result.decisions - decisionsAtDeath} decisions after death`)
})

test('test_restock', { timeout: 600000 }, async () => {
  const home = await freshBot('test-restock')
  for (const cmd of ['give Bot0 iron_pickaxe[damage=249]', 'give Bot0 cobblestone 3', 'give Bot0 stick 4', 'give Bot0 crafting_table 1']) {
    await server.command(cmd)
  }
  await bot.waitForTicks(20)
  const params = { ...jitterParams(), branchY: SLOT.y - 6 } // shallow, so the pickaxe breaks quickly
  await runObjective(bot, { objective: { item: 'diamond', count: 'max' }, home, params, deadline: Date.now() + 300000 })
  const log = skillLog()
  const broke = log.findIndex(e => e.before.inv.iron_pickaxe && !e.after.inv.iron_pickaxe)
  assert.ok(broke >= 0, 'iron pickaxe never broke')
  const restocked = log.slice(broke).find(e => e.skill === 'craft' && e.result.ok && /_pickaxe$/.test(e.args[0]))
  assert.ok(restocked, 'no pickaxe crafted after the break')
  assert.ok(log.slice(log.indexOf(restocked) + 1).length > 0, 'run did not continue after restocking')
})
