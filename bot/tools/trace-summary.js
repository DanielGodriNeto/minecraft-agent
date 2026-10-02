// Usage: node tools/trace-summary.js [logs dir]  (from bot/)
// Aggregates the last TAIL decisions of every run that ended 'stuck' in logs/eval.jsonl, from its trace-<run>.jsonl (params.traceLog).
const fs = require('node:fs')
const path = require('node:path')

const TAIL = 20
const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1 }

// runs: arrays of trace entries (oldest first). Pure.
function summarize(runs) {
  const out = { runs: runs.length, lastFailure: {}, skills: {}, hazardUp: 0, medianY: null }
  const ys = []
  for (const trace of runs) {
    const failure = trace.at(-1)?.lastFailure
    if (failure) bump(out.lastFailure, `${failure.skill}:${failure.reason}`)
    for (const e of trace) {
      bump(out.skills, e.skill)
      ys.push(e.y)
    }
    if (trace.some(e => e.hazardUp)) out.hazardUp++
  }
  ys.sort((a, b) => a - b)
  if (ys.length) out.medianY = ys[Math.floor(ys.length / 2)]
  return out
}

const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

function main(dir = path.join(__dirname, '..', '..', 'logs')) {
  const stuck = readLines(path.join(dir, 'eval.jsonl')).filter(r => r.reason === 'stuck' && r.run)
  const runs = stuck.map(r => path.join(dir, `trace-${r.run}.jsonl`)).filter(f => fs.existsSync(f)).map(f => readLines(f).slice(-TAIL))
  console.log(JSON.stringify({ stuckRows: stuck.length, ...summarize(runs) }, null, 1))
}

if (require.main === module) main(process.argv[2])
module.exports = { summarize }
