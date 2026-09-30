const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/eval.js'))
const { groundY, readDifficulty, assertSpawnSet, clearStandCommand, distribute, chunk, parseInstances, retry, skillLogPath, parseArm, assignArms, tpsFromLine } = req('./eval.js')
const { instanceSpec, maxInstances, assertDiskSpace, withPort } = req('./server.js')

const solid = (name) => ({ name, boundingBox: 'block' })
const empty = (name) => ({ name, boundingBox: 'empty' })

// column: y -> block; everything above the highest entry is air.
const column = (blocks) => (x, y) => blocks[y] ?? (y > 64 ? empty('air') : null)

test('groundY: finds the ground under a tree canopy', () => {
  const blockAt = column({ 70: empty('air'), 69: solid('oak_leaves'), 68: solid('oak_leaves'), 67: solid('oak_log'), 66: empty('vine'),
    65: empty('snow'), 64: solid('grass_block') })
  assert.strictEqual(groundY(blockAt, 0, 0, 70), 64)
})

test('groundY: skips liquid, non-full blocks and snow layers', () => {
  const blockAt = column({ 66: empty('water'), 65: { name: 'snow', boundingBox: 'block' }, 64: empty('short_grass'), 63: solid('dirt') })
  assert.strictEqual(groundY(blockAt, 0, 0, 66), 63)
})

test('groundY: throws on an unloaded chunk and on a column with no ground', () => {
  assert.throws(() => groundY(() => null, 0, 0, 70), /not loaded/)
  assert.throws(() => groundY(() => empty('air'), 0, 0, 70), /no ground/)
})

test('readDifficulty: reads the properties file', () => {
  assert.strictEqual(readDifficulty('a=b\ndifficulty=hard\nx=y'), 'hard')
  assert.strictEqual(readDifficulty('a=b'), undefined)
})

test('assertSpawnSet: only the success reply passes', () => {
  assert.doesNotThrow(() => assertSpawnSet('[12:00:00 INFO]: Set spawn point to 1, 64, 2 [0.0] in minecraft:overworld for Bot0'))
  assert.throws(() => assertSpawnSet('[12:00:00 INFO]: No player was found'), /spawnpoint failed/)
})

test('clearStandCommand: clears the stand cell and the two above it', () => {
  assert.strictEqual(clearStandCommand({ x: 10, y: 64, z: -3 }), 'fill 10 64 -3 10 66 -3 air')
})

test('chunk + distribute: batches go round-robin to the workers, none lost', () => {
  const batches = chunk([1, 2, 3, 4, 5, 6, 7], 2)
  assert.deepStrictEqual(batches, [[1, 2], [3, 4], [5, 6], [7]])
  assert.deepStrictEqual(distribute(batches, 2), [[[1, 2], [5, 6]], [[3, 4], [7]]])
  assert.deepStrictEqual(distribute(batches, 1), [batches])
  assert.deepStrictEqual(distribute([], 2), [[], []])
})

test('instanceSpec: one instance keeps server/ on 25565, several get run-<n> and their own port', () => {
  const one = instanceSpec(0, 1)
  assert.strictEqual(one.port, 25565)
  assert.strictEqual(path.basename(one.dir), 'server')
  const [a, b] = [instanceSpec(0, 3), instanceSpec(1, 3)]
  assert.deepStrictEqual([a.port, b.port], [25566, 25567])
  assert.strictEqual(path.basename(a.dir), 'run-1')
  assert.strictEqual(path.basename(b.dir), 'run-2')
})

test('maxInstances / parseInstances: capped by RAM and the 24 GB heap budget', () => {
  assert.strictEqual(maxInstances(32), 4)
  assert.strictEqual(maxInstances(64), 4)
  assert.strictEqual(maxInstances(16), 1)
  assert.strictEqual(maxInstances(4), 1)
  assert.strictEqual(parseInstances('3', 32), 3)
  assert.throws(() => parseInstances('5', 32), /at most 4/)
  assert.throws(() => parseInstances('0', 32), /positive integer/)
  assert.throws(() => parseInstances('x', 32), /positive integer/)
})

test('assertDiskSpace: passes with margin, fails with a clear message otherwise', () => {
  const GB = 2 ** 30
  assert.doesNotThrow(() => assertDiskSpace(30 * GB, 14 * GB, 'x'))
  assert.throws(() => assertDiskSpace(20 * GB, 14 * GB, 'restoring w'), /not enough disk for restoring w: need 24\.0 GB.*free 20\.0 GB/)
})

test('withPort: overrides server and query ports only', () => {
  assert.strictEqual(withPort('a=1\nserver-port=25565\nquery.port=25565\nrcon.port=25575\n', 25567),
    'a=1\nserver-port=25567\nquery.port=25567\nrcon.port=25575\n')
})

test('retry: returns the first success, retries failures, throws the last error after the attempts', async () => {
  let calls = 0
  assert.strictEqual(await retry(async () => { if (++calls < 3) throw new Error('x'); return 'ok' }, 3, 0), 'ok')
  assert.strictEqual(calls, 3)
  calls = 0
  await assert.rejects(retry(async () => { calls++; throw new Error(`fail ${calls}`) }, 2, 0), /fail 2/)
})

test('skillLogPath: parallel instances get skills-i<n>-Bot<k>.jsonl, a single one keeps the default', () => {
  assert.strictEqual(path.basename(skillLogPath({ index: 0, total: 2 }, 'Bot3')), 'skills-i1-Bot3.jsonl')
  assert.strictEqual(path.basename(skillLogPath({ index: 1, total: 2 }, 'Bot0')), 'skills-i2-Bot0.jsonl')
  assert.strictEqual(skillLogPath({ index: 0, total: 1 }, 'Bot3'), undefined)
})

test('parseArm: key=value list to an object, numbers and booleans parsed, empty and junk ignored', () => {
  assert.deepStrictEqual(parseArm('shaft=0,reserve=0'), { shaft: 0, reserve: 0 })
  assert.deepStrictEqual(parseArm(' spacing=2.5, cheat=true ,x=false,name=abc'), { spacing: 2.5, cheat: true, x: false, name: 'abc' })
  assert.deepStrictEqual(parseArm(''), {})
  assert.deepStrictEqual(parseArm(undefined), {})
  assert.deepStrictEqual(parseArm('novalue,=1,a=1'), { a: 1 })
})

test('assignArms: every batch runs once per arm and arms are rotated so no arm owns a server', () => {
  const shares = assignArms(['b0', 'b1'], ['A', 'B'], 2)
  assert.deepStrictEqual(shares, [[{ batch: 'b0', arm: 'A' }, { batch: 'b1', arm: 'B' }], [{ batch: 'b0', arm: 'B' }, { batch: 'b1', arm: 'A' }]])
  assert.deepStrictEqual(assignArms(['b0', 'b1', 'b2'], [''], 2).map(s => s.map(t => t.batch)), distribute(['b0', 'b1', 'b2'], 2))
  assert.strictEqual(assignArms(['b0'], ['A', 'B'], 1)[0].length, 2)
})

test('tpsFromLine: 1m value from plain and coloured lines, null otherwise', () => {
  assert.strictEqual(tpsFromLine('[12:00:00 INFO]: TPS from last 1m, 5m, 15m: 19.8, 20.0, 20.0'), 19.8)
  assert.strictEqual(tpsFromLine('[12:00:00 INFO]: \u00a76TPS from last 1m, 5m, 15m: \u00a7a*20.0\u00a76, \u00a7a20.0'), 20)
  assert.strictEqual(tpsFromLine('Done (3.2s)!'), null)
  assert.strictEqual(tpsFromLine(null), null)
})

// runOne with a stubbed runObjective (agent module property) and a stubbed results file.
async function runOneWith(runObjective, home = { x: 1, y: 2, z: 3 }, env = {}) {
  const { EventEmitter } = require('node:events')
  const fs = require('node:fs')
  const agent = req('./agent.js')
  const { runOne } = req('./eval.js')
  const saved = { run: agent.runObjective, append: fs.appendFileSync, env: { ...process.env } }
  const rows = []
  agent.runObjective = runObjective
  fs.appendFileSync = (_, line) => rows.push(JSON.parse(line))
  Object.assign(process.env, env)
  try {
    const bot = Object.assign(new EventEmitter(), { username: 'Bot0', objectiveRun: null })
    await runOne(bot, { id: 7 }, home, Date.now(), 1, 'normal', null, { index: 0, total: 1 }, 'shaft=0')
  } finally {
    agent.runObjective = saved.run
    fs.appendFileSync = saved.append
    for (const k of Object.keys(process.env)) if (!(k in saved.env)) delete process.env[k]
    Object.assign(process.env, saved.env)
  }
  return rows[0]
}

test('runOne: an exception out of runObjective is a valid failed run (error), a setup failure is a harness fault', async () => {
  const bug = await runOneWith(async () => { throw new TypeError('planner bug') })
  assert.deepStrictEqual([bug.reason, bug.detail, bug.invalid], ['error', 'planner bug', undefined])
  const setup = await runOneWith(async () => ({ reason: 'timeout' }), new Error('chunk not loaded'))
  assert.deepStrictEqual([setup.reason, setup.detail, setup.invalid], ['harness', 'chunk not loaded', true])
})

test('runOne: the row records all five env switches (RESERVE=0 included), the commit, the arm and the params', async () => {
  const env = { SHAFT: '0', NIGHTSURF: '1', FOODGATE: '0', FIGHTGUARD: '1', RESERVE: '0' }
  let params
  const row = await runOneWith(async (_, opts) => { params = opts.params; return { reason: 'timeout', deposited: 0, deaths: 0, decisions: 1, params: opts.params } }, undefined, env)
  assert.deepStrictEqual(row.env, env)
  assert.ok('commit' in row || row.commit === undefined)
  assert.strictEqual(row.arm, 'shaft=0')
  assert.strictEqual(params.shaft, 0)
  assert.strictEqual(row.params.shaft, 0)
})

// ---- bots in worker processes ----
const { EventEmitter } = require('node:events')
const { groupBots, botsPerProc, startMeter, serverProxy, runInProcs } = req('./worker.js')

test('botsPerProc: default 3, 0 = legacy single process, junk is rejected', () => {
  assert.strictEqual(botsPerProc({}), 3)
  assert.strictEqual(botsPerProc({ BOTS_PER_PROC: '0' }), 0)
  assert.strictEqual(botsPerProc({ BOTS_PER_PROC: '1' }), 1)
  assert.throws(() => botsPerProc({ BOTS_PER_PROC: 'x' }))
  assert.throws(() => botsPerProc({ BOTS_PER_PROC: '-1' }))
})

test('groupBots: consecutive bot indices, last group may be short', () => {
  assert.deepStrictEqual(groupBots(5, 2), [[0, 1], [2, 3], [4]])
  assert.deepStrictEqual(groupBots(3, 1), [[0], [1], [2]])
  assert.deepStrictEqual(groupBots(12, 3).length, 4)
  assert.deepStrictEqual(groupBots(0, 3), [])
})

test('startMeter: per-bot tick rate (mean, min, p10) from minute windows and loop delay', () => {
  let t = 0
  const bot = new EventEmitter()
  const meter = startMeter([bot], { now: () => t, intervalMs: 0, loopDelay: { mean: 5e6, percentile: () => 40e6, enable() {}, disable() {} } })
  const tick = (n, ms) => { for (let i = 0; i < n; i++) bot.emit('physicsTick'); t += ms; meter.sample() }
  tick(600, 60000) // 10/s
  tick(1200, 60000) // 20/s
  const { tickRate, loopDelayMs } = meter.read(bot)
  assert.deepStrictEqual(tickRate, { mean: 15, min: 10, p10: 10 })
  assert.deepStrictEqual(loopDelayMs, { mean: 5, p99: 40 })
  meter.stop()
  bot.emit('physicsTick')
  assert.strictEqual(meter.read(bot).tickRate.mean, 15)
})

test('serverProxy: commands go over IPC and resolve on the matching reply, errors reject', async () => {
  const sent = []
  const proc = new EventEmitter()
  proc.send = (m) => sent.push(m)
  const server = serverProxy(proc)
  const p = server.command('tp a', /Set spawn/i, 500)
  assert.deepStrictEqual([sent[0].t, sent[0].cmd, sent[0].reply, sent[0].ms], ['cmd', 'tp a', { source: 'Set spawn', flags: 'i' }, 500])
  proc.emit('message', { t: 'res', id: sent[0].id, ok: true, value: 'line' })
  assert.strictEqual(await p, 'line')
  const q = server.command('x')
  proc.emit('message', { t: 'res', id: sent[1].id, ok: false, error: 'timeout' })
  await assert.rejects(q, /timeout/)
})

function fakeChild(script) {
  const child = new EventEmitter()
  child.sent = []
  child.killed = false
  child.send = (m) => { child.sent.push(m); script(child, m) }
  child.kill = () => { child.killed = true; child.emit('exit', null) }
  setImmediate(() => script(child, { t: 'boot' }))
  return child
}
const say = (child, m) => setImmediate(() => child.emit('message', m))

test('runInProcs: barrier, server commands relayed, rows collected, a crashed worker yields harness rows for its bots', async () => {
  const cmds = []
  const server = { command: async (cmd) => { cmds.push(cmd); return 'ok' } }
  const good = fakeChild((c, m) => {
    if (m.t === 'boot') say(c, { t: 'spawned' })
    if (m.t === 'init') return
    if (m.t === 'start') { say(c, { t: 'row', i: 0, row: { slot: 1, reason: 'timeout' } }); say(c, { t: 'done' }) }
  })
  const crashy = fakeChild((c, m) => {
    if (m.t === 'boot') say(c, { t: 'spawned' })
    if (m.t === 'start') setImmediate(() => c.emit('exit', 1))
  })
  const kids = [good, crashy]
  const written = []
  const runner = runInProcs({
    server, slots: [{ id: 1 }, { id: 2 }], per: 1, init: { minutes: 1, difficulty: 'normal', instance: { index: 0, total: 1 }, port: 25565 },
    fork: () => kids.shift(), onHarness: (i, slot, detail) => { written.push([i, slot.id, detail]); return { slot: slot.id, reason: 'harness', invalid: true } },
  })
  // placed is sent by the test after time set
  const ready = runner.ready()
  await new Promise(r => setTimeout(r, 20))
  assert.deepStrictEqual(cmds, ['time set 0'])
  good.emit('message', { t: 'placed' }); crashy.emit('message', { t: 'placed' })
  await ready
  const rows = await runner.run(Date.now())
  assert.deepStrictEqual(rows.map(r => r.reason), ['timeout', 'harness'])
  assert.deepStrictEqual(written.map(w => w.slice(0, 2)), [[1, 2]])
  assert.ok(good.sent.find(m => m.t === 'init').members[0].slot.id === 1)
  runner.close()
  assert.ok(good.killed)
})
