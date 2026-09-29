// Phase 2.5 eval harness. Server must NOT be running; this script owns it.
//   node eval.js snapshot                         save the pregenerated world as the pristine copy
//   node eval.js <first> <last> [bots] [minutes]  run slots first..last in batches, e.g. 100 199 10 60
// Results: logs/eval.jsonl (one line per run); summary printed at the end.
const fs = require('node:fs')
const path = require('node:path')
const { createBot } = require('./bot.js')
const { runObjective, jitterParams } = require('./agent.js')
const { summarize, mulberry32 } = require('./metrics.js')
const { startServer, snapshot, restore } = require('./server.js')

const SLOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'slots.json'), 'utf8'))
const RESULTS = path.join(__dirname, '..', 'logs', 'eval.jsonl')
const DIFFICULTY = 'easy'

const once = (emitter, ev) => new Promise(resolve => emitter.once(ev, resolve))

async function poll(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`poll timeout: ${fn}`)
}

// Empty inventory, full health, standing on the slot with a storage chest beside it.
async function placeAtSlot(server, bot, slot) {
  const name = bot.username
  const chest = { x: slot.x + 2, y: slot.y, z: slot.z }
  for (const cmd of [`gamemode survival ${name}`, `clear ${name}`, `effect clear ${name}`,
    `spawnpoint ${name} ${slot.x} ${slot.y} ${slot.z}`, `setblock ${chest.x} ${chest.y} ${chest.z} chest`,
    `tp ${name} ${slot.x + 0.5} ${slot.y} ${slot.z + 0.5}`]) await server.command(cmd)
  await poll(() => bot.entity.position.distanceTo(bot.entity.position.clone().set(slot.x + 0.5, slot.y, slot.z + 0.5)) < 1, 30000)
  await bot.waitForChunksToLoad()
  return chest
}

async function runBatch(slots, minutes) {
  restore()
  const server = await startServer()
  const bots = slots.map((_, i) => createBot({ username: `Bot${i}` }))
  try {
    await Promise.all(bots.map(b => once(b, 'spawn')))
    await server.command('time set 0')
    const homes = []
    for (const [i, slot] of slots.entries()) homes.push(await placeAtSlot(server, bots[i], slot))
    const start = Date.now()
    return await Promise.all(slots.map(async (slot, i) => {
      const bot = bots[i]
      const rand = mulberry32(slot.id)
      bot.runTag = `slot${slot.id}-${start}`
      const result = await runObjective(bot, {
        objective: { item: 'diamond', count: 'max' }, home: homes[i], params: jitterParams(rand),
        deadline: start + minutes * 60000, rand,
      })
      const run = { slot: slot.id, bot: bot.username, run: bot.runTag, ...result, minutes: (Date.now() - start) / 60000, difficulty: DIFFICULTY }
      fs.appendFileSync(RESULTS, JSON.stringify(run) + '\n')
      console.log(JSON.stringify(run))
      return run
    }))
  } finally {
    bots.forEach(b => b.end())
    await server.stop()
  }
}

async function main([first, last, bots = '10', minutes = '60']) {
  if (first === 'snapshot') return snapshot()
  const slots = SLOTS.filter(s => s.id >= Number(first) && s.id <= Number(last))
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true })
  const runs = []
  for (let i = 0; i < slots.length; i += Number(bots)) {
    runs.push(...await runBatch(slots.slice(i, i + Number(bots)), Number(minutes)))
  }
  console.log(JSON.stringify({ difficulty: DIFFICULTY, ...summarize(runs) }, null, 1))
}

main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1) })
