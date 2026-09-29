// Phase 2.4 capacity benchmark. Server must NOT be running; this script owns it.
//   node bench.js <counts> [minutes]   e.g. node bench.js 4,8,12,16 8
// Each count is a fresh batch of N `max` runs on dev slots 120..120+N-1, sampled every 30 s.
// Results: logs/bench.jsonl (one line per count); runs are not written to logs/eval.jsonl.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { runBatch, readDifficulty, SLOTS, MAX_BOTS } = require('./eval.js')

const RESULTS = path.join(__dirname, '..', 'logs', 'bench.jsonl')
const FIRST_SLOT = 120
const SAMPLE_MS = 30000
const WARMUP_S = 60
const TPS_REPLY = /TPS from last/
const TPS_MIN = 19
const CPU_MAX = 85

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// "[12:00:00 INFO]: TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0" (colour codes and a '*' cap marker allowed) -> 1m value.
function parseTps(line) {
  const clean = line.replace(/\u001b\[[0-9;]*m/g, '').replace(/§./g, '')
  const values = /TPS from last[^:]*:\s*(.*)$/.exec(clean)?.[1]
  const first = values && /\*?(\d+(?:\.\d+)?)/.exec(values)
  return first ? Number(first[1]) : null
}

const cpuTimes = () => os.cpus().reduce((t, { times }) => {
  const total = Object.values(times).reduce((a, b) => a + b, 0)
  return { idle: t.idle + times.idle, total: t.total + total }
}, { idle: 0, total: 0 })

// Total machine utilisation between two cpuTimes() readings, in percent.
function cpuPercent(prev, cur) {
  const total = cur.total - prev.total
  return total > 0 ? 100 * (1 - (cur.idle - prev.idle) / total) : 0
}

// A reply that never comes counts as 0 TPS: an unresponsive server has failed the benchmark.
async function sampleTps(server) {
  const line = await server.command('tps', TPS_REPLY, SAMPLE_MS).catch(() => null)
  return line === null ? 0 : parseTps(line) ?? 0
}

// Samples every SAMPLE_MS until the returned stop function is called.
function startSampler(server, samples) {
  const t0 = Date.now()
  let prev = cpuTimes()
  let timer
  let stopped = false
  const tick = async () => {
    const tps = await sampleTps(server)
    if (stopped) return
    const cur = cpuTimes()
    samples.push({ t: (Date.now() - t0) / 1000, tps, cpu: cpuPercent(prev, cur), rssMb: process.memoryUsage().rss / 2 ** 20 })
    prev = cur
    timer = setTimeout(tick, SAMPLE_MS)
  }
  timer = setTimeout(tick, SAMPLE_MS)
  return () => { stopped = true; clearTimeout(timer) }
}

function evaluate(bots, minutes, samples) {
  const steady = samples.filter(s => s.t >= WARMUP_S)
  if (steady.length === 0) throw new Error(`no samples after ${WARMUP_S}s warmup; use more minutes`)
  const tps = steady.map(s => s.tps)
  const cpu = steady.map(s => s.cpu)
  const row = {
    bots, minutes, samples: steady.length,
    tpsMin: Math.min(...tps), tpsMedian: median(tps),
    cpuMedian: median(cpu), cpuMax: Math.max(...cpu),
    rssMaxMb: Math.max(...steady.map(s => s.rssMb)),
  }
  return { ...row, pass: row.tpsMin >= TPS_MIN && row.cpuMedian <= CPU_MAX }
}

const recommend = (rows) => rows.filter(r => r.pass).reduce((n, r) => Math.max(n, r.bots), 0) || null

function printTable(rows) {
  console.log('bots  tpsMin  tpsMed  cpuMed  cpuMax  rssMb  pass')
  for (const r of rows) {
    console.log([r.bots, r.tpsMin.toFixed(1), r.tpsMedian.toFixed(1), r.cpuMedian.toFixed(0), r.cpuMax.toFixed(0),
      r.rssMaxMb.toFixed(0), r.pass ? 'yes' : 'NO'].map((c, i) => String(c).padEnd([6, 8, 8, 8, 8, 7, 4][i])).join('').trimEnd())
  }
  console.log(`recommended N = ${recommend(rows) ?? 'none passed'}`)
}

async function benchOne(bots, minutes, difficulty) {
  const slots = SLOTS.filter(s => s.id >= FIRST_SLOT && s.id < FIRST_SLOT + bots)
  if (slots.length < bots) throw new Error(`slots.json has no ${bots} slots from ${FIRST_SLOT}`)
  const samples = []
  await runBatch(slots, minutes, difficulty, { log: null, onStart: server => startSampler(server, samples) })
  const row = { ...evaluate(bots, minutes, samples), difficulty, at: new Date().toISOString() }
  fs.appendFileSync(RESULTS, JSON.stringify(row) + '\n')
  return row
}

function parseCounts(arg) {
  const counts = String(arg).split(',').map(Number)
  if (counts.some(n => !Number.isInteger(n) || n < 1 || n > MAX_BOTS)) throw new Error(`counts must be integers 1..${MAX_BOTS} (only Bot0..Bot${MAX_BOTS - 1} are whitelisted)`)
  return counts
}

async function main([countsArg, minutes = '8']) {
  if (!countsArg) throw new Error('usage: node bench.js <counts> [minutes]   e.g. node bench.js 4,8,12,16 8')
  const counts = parseCounts(countsArg)
  if (Number(minutes) * 60 <= WARMUP_S + SAMPLE_MS / 1000) throw new Error(`minutes must exceed ${(WARMUP_S + SAMPLE_MS / 1000) / 60} (warmup plus one sample)`)
  const difficulty = readDifficulty()
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true })
  const rows = []
  for (const n of counts) {
    rows.push(await benchOne(n, Number(minutes), difficulty))
    console.log(JSON.stringify(rows.at(-1)))
  }
  printTable(rows)
}

module.exports = { parseTps, cpuPercent, evaluate, recommend, parseCounts, median }
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1) })
