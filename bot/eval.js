// Phase 2.5 eval harness. Server must NOT be running; this script owns it.
//   node eval.js snapshot                         save the pregenerated world as the pristine copy
//   node eval.js <first> <last> [bots] [minutes]  run slots first..last in batches, e.g. 100 199 10 60
// Results: logs/eval.jsonl (one line per run); summary printed at the end.
const fs = require('node:fs')
const path = require('node:path')
const { createBot } = require('./bot.js')
const { runObjective, stopObjective, jitterParams } = require('./agent.js')
const { summarize, mulberry32 } = require('./metrics.js')
const { startServer, snapshot, restore } = require('./server.js')

const SLOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'slots.json'), 'utf8'))
const RESULTS = path.join(__dirname, '..', 'logs', 'eval.jsonl')
const PROPS = path.join(__dirname, '..', 'server', 'diamonds.properties')
const MAX_BOTS = 16 // Bot0..Bot15 are the whitelisted names
const SPAWN_MS = 60000
const NOT_GROUND = /^(air|cave_air|void_air|snow|vine|.*_leaves|.*_log)$/

const readDifficulty = (props = fs.readFileSync(PROPS, 'utf8')) => /^difficulty=(\w+)/m.exec(props)?.[1]

const once = (emitter, ev) => new Promise(resolve => emitter.once(ev, resolve))

function withDeadline(promise, ms, what) {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function poll(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`poll timeout: ${fn}`)
}

// Highest solid ground at or below fromY: skips air, foliage, snow layers and anything non-full or liquid.
function groundY(blockAt, x, z, fromY) {
  for (let y = fromY; y >= -64; y--) {
    const block = blockAt(x, y, z)
    if (!block) throw new Error(`chunk not loaded at ${x},${y},${z}`)
    if (block.boundingBox === 'block' && !NOT_GROUND.test(block.name)) return y
  }
  throw new Error(`no ground at ${x},${z}`)
}

async function teleport(server, bot, x, y, z) {
  await server.command(`tp ${bot.username} ${x} ${y} ${z}`)
  await poll(() => Math.hypot(bot.entity.position.x - x, bot.entity.position.z - z) < 1, 30000)
  await bot.waitForChunksToLoad()
}

// Empty inventory, full health, standing on true ground with a storage chest beside it.
// slot.y can be a tree canopy, so the ground is found by scanning the loaded column.
async function placeAtSlot(server, bot, slot) {
  const name = bot.username
  const blockAt = (x, y, z) => bot.blockAt(bot.entity.position.clone().set(x, y, z))
  await teleport(server, bot, slot.x + 0.5, slot.y, slot.z + 0.5)
  const stand = { x: slot.x, y: groundY(blockAt, slot.x, slot.z, slot.y + 2) + 1, z: slot.z }
  const chest = { x: slot.x + 2, y: groundY(blockAt, slot.x + 2, slot.z, stand.y + 2) + 1, z: slot.z }
  await teleport(server, bot, stand.x + 0.5, stand.y, stand.z + 0.5)
  await poll(() => bot.entity.onGround, 10000)
  // Healing goes last: a fall from the canopy would otherwise undo it.
  for (const cmd of [`gamemode survival ${name}`, `clear ${name}`, `effect clear ${name}`,
    `effect give ${name} instant_health 1 10 true`, `effect give ${name} saturation 1 10 true`,
    `spawnpoint ${name} ${stand.x} ${stand.y} ${stand.z}`]) await server.command(cmd)
  await server.command(`setblock ${chest.x} ${chest.y} ${chest.z} chest`, /Changed the block/)
  await poll(() => bot.health === 20 && bot.food === 20, 10000)
  return chest
}

// A run that ends abnormally still reports what the objective had achieved so far.
function partial(bot, reason, detail) {
  const run = bot.objectiveRun
  return { reason, detail, deposited: run?.deposited ?? 0, deaths: run?.deaths ?? 0, decisions: run?.decisions ?? 0 }
}

async function runOne(bot, slot, home, start, minutes, difficulty) {
  const rand = mulberry32(slot.id)
  bot.runTag = `slot${slot.id}-${start}`
  const disconnected = new Promise(resolve => {
    const done = () => resolve(partial(bot, 'disconnected'))
    bot.once('end', done)
    bot.once('kicked', done)
  })
  let result
  try {
    if (home instanceof Error) throw home
    const running = runObjective(bot, {
      objective: { item: 'diamond', count: 'max' }, home, params: jitterParams(rand),
      deadline: start + minutes * 60000, rand,
    })
    running.catch(() => {}) // a run abandoned on disconnect may still reject later
    result = await Promise.race([running, disconnected])
    if (result.reason === 'disconnected') stopObjective(bot)
  } catch (e) {
    result = partial(bot, 'error', e.message)
  }
  const run = { slot: slot.id, bot: bot.username, run: bot.runTag, ...result, minutes: (Date.now() - start) / 60000, difficulty }
  fs.appendFileSync(RESULTS, JSON.stringify(run) + '\n')
  console.log(JSON.stringify(run))
  return run
}

async function runBatch(slots, minutes, difficulty) {
  restore()
  const server = await startServer()
  const bots = slots.map((_, i) => createBot({ username: `Bot${i}` }))
  try {
    await Promise.all(bots.map(b => withDeadline(once(b, 'spawn'), SPAWN_MS, `${b.username} spawn`)))
    await server.command('time set 0')
    const homes = []
    for (const [i, slot] of slots.entries()) homes.push(await placeAtSlot(server, bots[i], slot).catch(e => e))
    const start = Date.now()
    return await Promise.all(slots.map((slot, i) => runOne(bots[i], slot, homes[i], start, minutes, difficulty)))
  } finally {
    bots.forEach(b => b.end())
    await server.stop()
  }
}

async function main([first, last, bots = '10', minutes = '60']) {
  if (first === 'snapshot') return snapshot()
  if (Number(bots) > MAX_BOTS) throw new Error(`at most ${MAX_BOTS} bots (only Bot0..Bot${MAX_BOTS - 1} are whitelisted)`)
  const difficulty = readDifficulty()
  const slots = SLOTS.filter(s => s.id >= Number(first) && s.id <= Number(last))
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true })
  const runs = []
  for (let i = 0; i < slots.length; i += Number(bots)) {
    runs.push(...await runBatch(slots.slice(i, i + Number(bots)), Number(minutes), difficulty))
  }
  console.log(JSON.stringify({ difficulty, ...summarize(runs) }, null, 1))
}

module.exports = { placeAtSlot, groundY, readDifficulty }
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1) })
