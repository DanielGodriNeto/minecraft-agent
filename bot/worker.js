// Bots of one eval batch run in several OS processes so their pathfinders do not share one event loop.
// Parent (eval.js, owns the server) <-> worker (this file, owns a group of bots), over child_process IPC:
//   parent->worker  {t:'init', port, instance, difficulty, minutes, arm, members:[{i, slot}]}  first message
//                   {t:'place'}                           every worker spawned and `time set 0` done: place the bots
//                   {t:'start', start}                    every worker placed: begin the timed run
//                   {t:'res', id, ok, value|error}        answer to a cmd
//   worker->parent  {t:'spawned'} {t:'placed'}            barriers
//                   {t:'cmd', id, cmd, reply:{source,flags}|null, ms}   run a server console command
//                   {t:'row', i, row}                     one finished bot (runOne already logged and appended it)
//                   {t:'done'}                            all rows sent; the worker exits after this
// A worker that exits before 'done' gets harness rows for the bots that never reported.
const { monitorEventLoopDelay } = require('node:perf_hooks')
const { fork } = require('node:child_process')

const SPAWN_MS = 60000
const round1 = (n) => Math.round(n * 10) / 10

// BOTS_PER_PROC: 0 = legacy single process, 1 = one process per bot, default 3.
function botsPerProc(env = process.env) {
  if (env.BOTS_PER_PROC === undefined) return 3
  const n = Number(env.BOTS_PER_PROC)
  if (!Number.isInteger(n) || n < 0) throw new Error(`BOTS_PER_PROC must be an integer >= 0, got ${env.BOTS_PER_PROC}`)
  return n
}

const groupBots = (count, per) => Array.from({ length: Math.ceil(count / per) }, (_, g) =>
  Array.from({ length: Math.min(per, count - g * per) }, (_, k) => g * per + k))

// Physics ticks/s per bot (one sample per interval) plus event-loop delay of this process.
function startMeter(bots, { now = Date.now, intervalMs = 60000, loopDelay = monitorEventLoopDelay() } = {}) {
  const state = bots.map(bot => {
    const s = { bot, ticks: 0, total: 0, seconds: 0, rates: [] }
    s.on = () => { s.ticks++; s.total++ }
    bot.on('physicsTick', s.on)
    return s
  })
  loopDelay.enable()
  let lastT = now()
  const sample = () => {
    const dt = (now() - lastT) / 1000
    if (dt <= 0) return
    lastT = now()
    for (const s of state) { s.rates.push(s.ticks / dt); s.seconds += dt; s.ticks = 0 }
  }
  const timer = intervalMs > 0 ? setInterval(sample, intervalMs) : null
  timer?.unref()
  let stopped = false
  return {
    sample,
    read(bot) {
      sample()
      const s = state.find(x => x.bot === bot)
      if (!s || !s.rates.length) return { tickRate: null, loopDelayMs: null }
      const sorted = [...s.rates].sort((a, b) => a - b)
      return {
        tickRate: { mean: round1(s.total / s.seconds), min: round1(sorted[0]), p10: round1(sorted[Math.floor(0.1 * (sorted.length - 1))]) },
        loopDelayMs: { mean: round1(loopDelay.mean / 1e6), p99: round1(loopDelay.percentile(99) / 1e6) },
      }
    },
    stop() {
      if (stopped) return
      if (now() - lastT >= 10000) sample() // a shorter tail window would only add noise
      stopped = true
      clearInterval(timer)
      loopDelay.disable()
      state.forEach(s => s.bot.off('physicsTick', s.on))
    },
  }
}

// Worker side: same shape as the console server object, but commands travel to the parent.
function serverProxy(proc) {
  const pending = new Map()
  let nextId = 0
  proc.on('message', (m) => {
    if (m?.t !== 'res') return
    const p = pending.get(m.id)
    pending.delete(m.id)
    if (p) m.ok ? p.resolve(m.value) : p.reject(new Error(m.error))
  })
  return {
    command: (cmd, reply, ms) => new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      proc.send({ t: 'cmd', id, cmd, reply: reply ? { source: reply.source, flags: reply.flags } : null, ms })
    }),
  }
}

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

// Parent side: { ready(), run(start) -> rows, close() }. onHarness(i, slot, detail, start) writes and returns a harness row.
function runInProcs({ server, slots, per, init, onHarness, fork: forkWorker = () => fork(__filename) }) {
  const rows = new Array(slots.length)
  let queue = Promise.resolve() // console commands are answered one at a time so replies cannot cross
  const relay = (w, m) => {
    queue = queue.then(() => server.command(m.cmd, m.reply && new RegExp(m.reply.source, m.reply.flags), m.ms))
      .then(value => ({ ok: true, value }), e => ({ ok: false, error: e.message }))
      .then(res => { if (w.alive) w.child.send({ t: 'res', id: m.id, ...res }) })
  }
  const workers = groupBots(slots.length, per).map(indices => {
    const child = forkWorker()
    const w = { child, indices, alive: true, barriers: {} }
    // A barrier resolves when the worker sends it, or for good once the worker is gone.
    w.barrier = (t) => {
      w.barriers[t] ??= deferred()
      if (!w.alive) w.barriers[t].resolve()
      return w.barriers[t]
    }
    const gone = () => { w.alive = false; Object.keys(w.barriers).forEach(w.barrier) }
    child.on('close', gone) // not 'exit': that can fire before the last row/done messages are read
    child.on('error', gone)
    child.on('message', (m) => {
      if (m.t === 'cmd') relay(w, m)
      else if (m.t === 'row') rows[m.i] = m.row
      else w.barrier(m.t).resolve()
    })
    child.send({ t: 'init', ...init, members: indices.map(i => ({ i, slot: slots[i] })) })
    return w
  })
  const all = (t) => Promise.all(workers.map(w => w.barrier(t).promise))
  const tell = (msg) => workers.forEach(w => { if (w.alive) w.child.send(msg) })
  function close() {
    process.off('exit', close)
    process.off('SIGINT', onSigint)
    workers.forEach(w => { if (w.alive) w.child.kill() })
  }
  function onSigint() { close(); process.exit(130) }
  process.on('exit', close)
  process.on('SIGINT', onSigint)
  return {
    async ready() {
      await all('spawned')
      await server.command('time set 0')
      tell({ t: 'place' })
      await all('placed')
    },
    async run(start) {
      tell({ t: 'start', start })
      await all('done')
      slots.forEach((slot, i) => { rows[i] ??= onHarness(i, slot, 'worker exited before reporting', start) })
      return rows
    },
    close,
  }
}

const nextMessage = (proc, t) => new Promise(resolve => {
  const on = (m) => { if (m?.t === t) { proc.off('message', on); resolve(m) } }
  proc.on('message', on)
})

// Sends one bot's row; a rejected run becomes that bot's harness row so the others in the process still finish.
const reportRow = (proc, i, run, fail) => run.catch(fail).then(row => proc.send({ t: 'row', i, row }))

async function workerMain(proc = process) {
  const ev = require('./eval.js') // lazy: eval.js requires this file
  const init = await nextMessage(proc, 'init')
  proc.on('disconnect', () => process.exit(1))
  const server = serverProxy(proc)
  const bots = init.members.map(({ i }) => ev.newBot(i, init.port, init.instance))
  await Promise.all(bots.map(b => ev.withDeadline(ev.once(b, 'spawn'), SPAWN_MS, `${b.username} spawn`)))
  const placing = nextMessage(proc, 'place')
  const started = nextMessage(proc, 'start')
  proc.send({ t: 'spawned' })
  await placing
  const homes = []
  for (const [k, { slot }] of init.members.entries()) homes.push(await ev.retry(() => ev.placeAtSlot(server, bots[k], slot), 2, 5000).catch(e => e))
  proc.send({ t: 'placed' })
  const { start } = await started
  const meter = startMeter(bots)
  await Promise.all(init.members.map(({ i, slot }, k) => reportRow(proc, i,
    ev.runOne(bots[k], slot, homes[k], start, init.minutes, init.difficulty, null, init.instance, init.arm, meter),
    e => ev.harnessRow(i, slot, `runOne failed: ${e.message}`, start, init.difficulty, init.instance, init.arm))))
  meter.stop()
  bots.forEach(b => b.end())
  proc.send({ t: 'done' }, () => process.exit(0))
}

module.exports = { reportRow, botsPerProc, groupBots, startMeter, serverProxy, runInProcs, SPAWN_MS }
if (require.main === module) workerMain().catch(e => { console.error(e); process.exit(1) })
