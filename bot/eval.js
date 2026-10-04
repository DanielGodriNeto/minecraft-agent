// Phase 2.5 eval harness. Server must NOT be running; this script owns it.
//   node eval.js snapshot                         save the pregenerated world as the pristine copy
//   node eval.js <first> <last> [bots] [minutes] [instances|auto]
//                                                 run slots first..last in batches, e.g. 100 199 10 60;
//                                                 instances > 1 runs that many Paper servers in parallel; auto (default) or a number as
//                                                 a cap picks 4/3/2/1 from free RAM >= 16/11/7 GB; FORCE_INSTANCES=n overrides; >= 3 uses MC_HEAP_GB=3
//                                                 (server/run-<n>/, port 25565+n, ~14 GB world copy each)
// A/B: ARM=shaft=0,reserve=0 overrides run params; ARMS="shaft=1;shaft=0" runs every batch once per arm, rotated across instances.
// Results: logs/eval.jsonl (one line per run); summary printed at the end.
const fs = require('node:fs')
const path = require('node:path')
const { createBot } = require('./bot.js')
const agent = require('./agent.js')
const { stopObjective, jitterParams } = agent
const { summarize, isInvalid, mulberry32 } = require('./metrics.js')
const os = require('node:os')
const { execSync } = require('node:child_process')
const { botsPerProc, startMeter, runInProcs } = require('./worker.js')
const { startServer, rssGb, snapshot, restore, checkDiskFor, instanceSpec, maxInstances } = require('./server.js')

const SLOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'slots.json'), 'utf8'))
const RESULTS = path.join(__dirname, '..', 'logs', 'eval.jsonl')
const PROPS = path.join(__dirname, '..', 'server', 'diamonds.properties')
const MAX_INSTANCES = 4
const MAX_BOTS = 16 // Bot0..Bot15 are the whitelisted names
const SPAWN_MS = 60000
const SPAWN_REPLY = /Set spawn point|Unknown or incomplete|Incorrect argument|No player was found|No entity was found/
const NOT_GROUND = /^(air|cave_air|void_air|snow|vine|.*_leaves|.*_log)$/

const readDifficulty = (props = fs.readFileSync(PROPS, 'utf8')) => /^difficulty=(\w+)/m.exec(props)?.[1]

// The console answers a spawnpoint command with one line; anything but success means the bot would respawn elsewhere.
function assertSpawnSet(reply) {
  if (!/Set spawn point/.test(reply)) throw new Error(`spawnpoint failed: ${reply}`)
}

// Leaves, vines or litter in the stand cell or the two above it invalidate the spawn point, and the run respawns far away.
const clearStandCommand = ({ x, y, z }) => `fill ${x} ${y} ${z} ${x} ${y + 2} ${z} air`

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

async function retry(fn, attempts, delayMs) {
  for (let i = 1; ; i++) {
    try { return await fn() } catch (e) {
      if (i >= attempts) throw e
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

// mineflayer gives up after a fixed 10 s; with several servers and 12 bots each, chunks can take a minute.
const waitForChunks = (bot) => retry(() => bot.waitForChunksToLoad(), 6, 0)

async function teleport(server, bot, x, y, z) {
  await server.command(`tp ${bot.username} ${x} ${y} ${z}`)
  await poll(() => Math.hypot(bot.entity.position.x - x, bot.entity.position.z - z) < 1, 30000)
  await waitForChunks(bot)
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
    `effect give ${name} instant_health 1 10 true`, `effect give ${name} saturation 1 10 true`]) await server.command(cmd)
  await server.command(clearStandCommand(stand))
  assertSpawnSet(await server.command(`spawnpoint ${name} ${stand.x} ${stand.y} ${stand.z}`, SPAWN_REPLY))
  await server.command(`setblock ${chest.x} ${chest.y} ${chest.z} chest`, /Changed the block/)
  await poll(() => bot.health === 20 && bot.food === 20, 10000)
  return chest
}

// A run that ends abnormally still reports what the objective had achieved so far.
function partial(bot, reason, detail) {
  const run = bot.objectiveRun
  return { reason, detail, deposited: run?.deposited ?? 0, deaths: run?.deaths ?? 0, decisions: run?.decisions ?? 0 }
}

// Round-robin: batch i goes to worker i % workers. Batches all last the same time, so shares stay balanced.
function distribute(batches, workers) {
  const shares = Array.from({ length: workers }, () => [])
  batches.forEach((batch, i) => shares[i % workers].push(batch))
  return shares
}

// "shaft=0,reserve=0" -> { shaft: 0, reserve: 0 }: numbers and booleans are parsed, the rest stays a string.
function parseArm(text = '') {
  const parse = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)
  const pairs = text.split(',').map(p => p.trim().split('=')).filter(([k, v]) => k && v !== undefined)
  return Object.fromEntries(pairs.map(([k, v]) => [k, parse(v)]))
}

// Every batch once per arm. Batch b, arm a goes to worker (b + a) % workers, so each arm visits every server.
function assignArms(batches, arms, workers) {
  const shares = Array.from({ length: workers }, () => [])
  batches.forEach((batch, b) => arms.forEach((arm, a) => shares[(b + a) % workers].push({ batch, arm })))
  return shares
}

const commitHash = () => {
  try { return execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return undefined }
}
const SWITCHES = ['SHAFT', 'NIGHTSURF', 'FOODGATE', 'FIGHTGUARD', 'RESERVE', 'CROWDFLEE', 'NIGHTASCENT', 'BRANCHRELOCATE', 'GOUPLOOP', 'LOCALSURFACE', 'PICKFIRST', 'STATIONABOVE', 'DROWNCAP', 'HAZARDGRACE', 'WATCHDOG', 'RECOVERY', 'TRACELOG', 'MINEY', 'EARLYBANK']
const switchesInEffect = () => Object.fromEntries(SWITCHES.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function parseInstances(arg, totalMemGb = os.totalmem() / 2 ** 30) {
  const n = Number(arg)
  if (!Number.isInteger(n) || n < 1) throw new Error(`instances must be a positive integer, got ${arg}`)
  const cap = maxInstances(totalMemGb)
  if (n > cap) throw new Error(`at most ${cap} instances fit ${totalMemGb.toFixed(0)} GB RAM (max 4, 24 GB total heap)`)
  return n
}

// Instances the free RAM allows (4 at >= 16 GB, 3 at >= 11, 2 at >= 7, else 1); a number is a cap, 'auto' or nothing is no cap.
function pickInstances(freeGb, requested = 'auto') {
  const cap = requested === 'auto' ? MAX_INSTANCES : Number(requested)
  if (!Number.isInteger(cap) || cap < 1) throw new Error(`instances must be 'auto' or a positive integer, got ${requested}`)
  const fit = freeGb >= 16 ? 4 : freeGb >= 11 ? 3 : freeGb >= 7 ? 2 : 1
  return Math.min(fit, cap, MAX_INSTANCES)
}

// Three or more instances run at 3 GB heap (validated); MC_HEAP_GB still wins. undefined = startServer's default.
const heapGbFor = (total, env = process.env) => (env.MC_HEAP_GB || total < 3 ? undefined : 3)

const GUARD_FREE_GB = 2.5
const GUARD_COOLDOWN_MS = 60000

// Memory guard: when free RAM is low, sacrifice exactly one instance (largest RSS, ties the newest), then wait out the cooldown.
// instances: [{ id, rssGB, startedAt }]. The last instance is never stopped.
function memoryGuardAction(freeGB, instances, lastKillAt, now) {
  if (freeGB >= GUARD_FREE_GB || instances.length < 2 || now - lastKillAt < GUARD_COOLDOWN_MS) return { kill: null }
  const victim = instances.reduce((a, b) => (b.rssGB > a.rssGB || (b.rssGB === a.rssGB && b.startedAt > a.startedAt) ? b : a))
  return { kill: victim.id }
}

const liveInstances = new Map() // id -> { id, startedAt, pid, abort }
const abortedInstances = new Set() // instance indexes whose runs are discarded (never written to eval.jsonl)
const lostSlots = []

function startMemoryGuard({ intervalMs = 10000, free = freeGb, now = Date.now, rss = rssGb } = {}) {
  let lastKillAt = -Infinity
  const timer = setInterval(() => {
    const freeNow = free()
    const instances = [...liveInstances.values()].map(i => ({ id: i.id, startedAt: i.startedAt, rssGB: rss(i.pid) }))
    const { kill } = memoryGuardAction(freeNow, instances, lastKillAt, now())
    if (kill === null) return
    lastKillAt = now()
    const lost = liveInstances.get(kill).abort()
    console.log(`[memory_guard] free ${freeNow.toFixed(1)} GB: stopped instance ${kill}, lost slots ${lost.join(',')} (re-run them)`)
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

const freeGb = () => os.freemem() / 2 ** 30

// Skill logs stay skills-Bot<i>.jsonl for one instance (undefined = keep createBot's default); parallel instances would
// interleave, so they get skills-i<n>-Bot<i>.jsonl. bot.username is not set until login, so the name is passed in.
const skillLogPath = ({ index, total }, name) => total > 1 ? path.join(__dirname, '..', 'logs', `skills-i${index + 1}-${name}.jsonl`) : undefined

// One bot of a batch; bot.username is not set until login, so the name is passed in.
function newBot(i, port, instance) {
  const bot = createBot({ username: `Bot${i}`, port })
  if (!process.env.SKILL_LOG) bot.skillLogPath = skillLogPath(instance, `Bot${i}`) ?? bot.skillLogPath
  return bot
}

// meter (optional): startMeter result; adds this bot's tickRate and loopDelayMs to the row.
async function runOne(bot, slot, home, start, minutes, difficulty, log, instance, arm = '', meter) {
  const rand = mulberry32(slot.id)
  const armText = [process.env.ARM, arm].filter(Boolean).join(',')
  bot.runTag = `slot${slot.id}-${start}`
  const disconnected = new Promise(resolve => {
    const done = () => resolve(partial(bot, 'disconnected'))
    bot.once('end', done)
    bot.once('kicked', done)
  })
  let result
  try {
    if (home instanceof Error) {
      result = partial(bot, 'harness', home.message) // placement failed: the bot never ran
    } else {
      const running = agent.runObjective(bot, {
        objective: { item: 'diamond', count: 'max' }, home, params: { ...jitterParams(rand), ...parseArm(armText) },
        deadline: start + minutes * 60000, rand,
      })
      running.catch(() => {}) // a run abandoned on disconnect may still reject later
      result = await Promise.race([running, disconnected])
      if (result.reason === 'disconnected') stopObjective(bot)
    }
  } catch (e) {
    result = partial(bot, 'error', e.message) // the bot's own code threw: a failed run, not a harness fault
  }
  const run = { slot: slot.id, bot: bot.username, run: bot.runTag, ...result, ...(isInvalid(result) && { invalid: true }), minutes: (Date.now() - start) / 60000, difficulty, commit: commitHash(), env: switchesInEffect(), ...(armText && { arm: armText }), ...(instance.total > 1 && { instance: instance.index + 1 }), ...meter?.read(bot) }
  return emitRow(run, instance)
}

function emitRow(run, instance) {
  if (abortedInstances.has(instance.index)) return run // stopped by the memory guard: the run is incomplete, its slot is re-run later
  fs.appendFileSync(RESULTS, JSON.stringify(run) + '\n')
  console.log(`${instance.total > 1 ? `[i${instance.index + 1}] ` : ''}${JSON.stringify(run)}`)
  return run
}

// A bot whose worker process died: an invalid harness fault, like a failed placement.
function harnessRow(i, slot, detail, start, difficulty, instance, arm) {
  const armText = [process.env.ARM, arm].filter(Boolean).join(',')
  return emitRow({ slot: slot.id, bot: `Bot${i}`, reason: 'harness', detail, deposited: 0, deaths: 0, decisions: 0, invalid: true, minutes: (Date.now() - start) / 60000, difficulty, commit: commitHash(), env: switchesInEffect(), ...(armText && { arm: armText }), ...(instance.total > 1 && { instance: instance.index + 1 }) }, instance)
}

// 1m TPS from the console's `tps` reply, colour codes and the '*' cap marker stripped; null when unreadable.
const tpsFromLine = (line) => {
  const value = /TPS from last[^:]*:\s*(\d+(?:\.\d+)?)/.exec(line?.replace(/\u001b\[[\d;]*m|\u00a7.|\*/g, '') ?? '')?.[1]
  return value === undefined ? null : Number(value)
}
const sampleTps = async (server) => {
  try { return tpsFromLine(await server.command('tps', /TPS from last/, 5000)) } catch { return null }
}

// opts.log: file receiving one line per run (null = none); opts.onStart(server): called once the runs begin,
// returns a stop function that is called when they end.
// opts.instance: { index, total } picks the server dir and port (default: the single server/ on 25565).
async function runBatch(slots, minutes, difficulty, { log = RESULTS, onStart, instance = { index: 0, total: 1 }, arm } = {}) {
  const { dir, port } = instanceSpec(instance.index, instance.total)
  restore(dir)
  const server = await startServer('diamonds', { dir, port, heapGb: heapGbFor(instance.total) })
  await server.command('save-off', /Automatic saving is now disabled|already/i) // the world is restored from the snapshot every batch
  const per = botsPerProc()
  const runner = per > 0
    ? procRunner(server, slots, per, { port, instance, difficulty, minutes, arm })
    : localRunner(server, slots, port, minutes, difficulty, log, instance, arm)
  let stopWatching, midTimer, midTps = null
  let aborted = false
  liveInstances.set(instance.index + 1, {
    id: instance.index + 1, startedAt: Date.now(), pid: server.pid,
    abort() {
      aborted = true
      abortedInstances.add(instance.index)
      const lost = slots.map(s => s.id)
      lostSlots.push(...lost.map(slot => ({ slot, ...(arm && { arm }) })))
      runner.close() // workers first, so no row is written for a half-finished run
      server.kill()
      return lost
    },
  })
  const tps = []
  try {
    await runner.ready()
    const start = Date.now()
    stopWatching = onStart?.(server)
    tps.push(await sampleTps(server))
    midTimer = setTimeout(() => sampleTps(server).then(t => { midTps = t }), minutes * 30000)
    const rows = await runner.run(start)
    return aborted ? [] : rows
  } finally {
    liveInstances.delete(instance.index + 1)
    stopWatching?.()
    clearTimeout(midTimer)
    tps.push(midTps, await sampleTps(server))
    console.log(`${instance.total > 1 ? `[i${instance.index + 1}] ` : ''}${JSON.stringify({ batch: slots.map(s => s.id), arm, tps })}`)
    runner.close()
    await server.stop()
  }
}

// BOTS_PER_PROC=0: every bot in this process (legacy).
function localRunner(server, slots, port, minutes, difficulty, log, instance, arm) {
  const bots = slots.map((_, i) => newBot(i, port, instance))
  let meter
  return {
    async ready() {
      await Promise.all(bots.map(b => withDeadline(once(b, 'spawn'), SPAWN_MS, `${b.username} spawn`)))
      await server.command('time set 0')
      this.homes = []
      for (const [i, slot] of slots.entries()) this.homes.push(await retry(() => placeAtSlot(server, bots[i], slot), 2, 5000).catch(e => e))
    },
    run(start) {
      meter = startMeter(bots)
      return Promise.all(slots.map((slot, i) => runOne(bots[i], slot, this.homes[i], start, minutes, difficulty, log, instance, arm, meter)))
    },
    close() {
      meter?.stop()
      bots.forEach(b => b.end())
    },
  }
}

// BOTS_PER_PROC>0: worker processes own the bots and place them through the parent's console.
function procRunner(server, slots, per, init) {
  return runInProcs({
    server, slots, per, init,
    onHarness: (i, slot, detail, start) => harnessRow(i, slot, detail, start, init.difficulty, init.instance, init.arm),
  })
}

async function runShare(share, index, total, minutes, difficulty) {
  const runs = []
  for (const [k, { batch, arm }] of share.entries()) {
    if (abortedInstances.has(index)) { // the guard stopped this instance: its remaining batches are lost, not run
      lostSlots.push(...share.slice(k).flatMap(s => s.batch.map(x => ({ slot: x.id, ...(s.arm && { arm: s.arm }) }))))
      break
    }
    if (runs.length) console.log(`[i${index + 1}] free RAM ${freeGb().toFixed(1)} GB, fits ${pickInstances(freeGb())} instance(s), running ${total}`)
    runs.push(...await runBatch(batch, minutes, difficulty, { instance: { index, total }, arm }))
  }
  return runs
}

async function main([first, last, bots = '10', minutes = '60', instances = 'auto']) {
  if (first === 'snapshot') return snapshot()
  if (Number(bots) > MAX_BOTS) throw new Error(`at most ${MAX_BOTS} bots (only Bot0..Bot${MAX_BOTS - 1} are whitelisted)`)
  const difficulty = readDifficulty()
  const slots = SLOTS.filter(s => s.id >= Number(first) && s.id <= Number(last))
  const arms = process.env.ARMS ? process.env.ARMS.split(';').map(a => a.trim()) : ['']
  const batches = chunk(slots, Number(bots))
  const wanted = process.env.FORCE_INSTANCES ? parseInstances(process.env.FORCE_INSTANCES) : pickInstances(freeGb(), instances)
  const workers = Math.min(wanted, batches.length * arms.length)
  console.log(`instances: ${workers} (free RAM ${freeGb().toFixed(1)} GB, requested ${process.env.FORCE_INSTANCES ? `FORCE_INSTANCES=${process.env.FORCE_INSTANCES}` : instances})`)
  const shares = assignArms(batches, arms, workers)
  checkDiskFor(shares.map((_, i) => instanceSpec(i, shares.length)))
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true })
  const stopGuard = startMemoryGuard()
  const runs = (await Promise.all(shares.map((share, i) => runShare(share, i, shares.length, Number(minutes), difficulty)))).flat()
  stopGuard()
  console.log(JSON.stringify({ difficulty, ...summarize(runs) }, null, 1))
  if (lostSlots.length) console.log(`memory_guard lost ${lostSlots.length} runs, re-run: ${JSON.stringify(lostSlots)}`)
}

module.exports = { harnessRow, newBot, once, withDeadline, tpsFromLine, parseArm, assignArms, retry, skillLogPath, distribute, chunk, parseInstances, pickInstances, heapGbFor, memoryGuardAction, placeAtSlot, runOne, clearStandCommand, groundY, readDifficulty, assertSpawnSet, runBatch, SLOTS, MAX_BOTS }
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1) })
