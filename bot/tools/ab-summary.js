// usage: node tools/ab-summary.js <firstSlot> <lastSlot> <armKey>   e.g. 296 343 watchdog
// Reads logs/eval.jsonl, prints per-arm totals and a paired verdict. Exit 0 always; look at "STATUS".
const fs = require('fs')
const [first, last, key] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]]
const rows = fs.readFileSync(require('path').join(__dirname, '../../logs/eval.jsonl'), 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l)).filter((r) => r.arm && r.arm.includes(key + '=') && r.slot >= first && r.slot <= last)
const arms = [...new Set(rows.map((r) => r.arm))].sort()
const expected = last - first + 1
const by = {}
for (const a of arms) by[a] = Object.fromEntries(rows.filter((r) => r.arm === a).map((r) => [r.slot, r]))
for (const a of arms) {
  const x = Object.values(by[a])
  const c = (f) => x.filter(f).length
  console.log(a, 'n', x.length, 'banked', c((r) => r.deposited > 0), 'dia', x.reduce((s, r) => s + r.deposited, 0),
    'stuck', c((r) => r.reason === 'stuck'), 'deaths', c((r) => r.reason === 'deaths'), 'timeout', c((r) => r.reason === 'timeout'))
}
if (arms.length === 2) {
  const [a, b] = arms
  const slots = Object.keys(by[a]).filter((s) => by[b][s])
  let w = 0, l = 0
  for (const s of slots) { const d = (by[b][s].deposited > 0) - (by[a][s].deposited > 0); if (d > 0) w++; else if (d < 0) l++ }
  const sum = (arm) => slots.reduce((t, s) => t + by[arm][s].deposited, 0)
  const diaPct = sum(a) ? ((sum(b) - sum(a)) / sum(a)) * 100 : 0
  console.log(`paired ${slots.length}/${expected}: ${b} better on ${w} slots, worse on ${l}; diamonds ${diaPct.toFixed(0)}%`)
  console.log('STATUS', slots.length < expected ? 'RUNNING' : 'DONE')
} else console.log('STATUS', arms.length ? 'RUNNING' : 'NOT_STARTED')
