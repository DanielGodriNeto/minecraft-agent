// Q C (time cost of shelter, gift runs) and Q D (shelter death rate by start health, with/without a nearby-hostile proxy, all skills logs).
// Run from repo root. Shelter call: skill 'shelter', args [dir] (mode threat) or [dir,'dawn'|'rest'].
const { fs, files } = require('./common')
const { giftRows, ARMS, t0, median, quant } = require('./gift_common')
const by = giftRows(), giftRuns = new Map()
for (const a of ARMS) for (const r of Object.values(by[a] ?? {})) giftRuns.set(r.run, r)
const mode = (e) => e.args[1] ?? 'threat'
const bucket = (h) => h < 4 ? '[0,4)' : h < 8 ? '[4,8)' : h < 12 ? '[8,12)' : h < 16 ? '[12,16)' : '[16,20]'
const f = (x, d = 2) => x === null || x === undefined ? '-' : x.toFixed(d)
const C = {}, D = {}
let giftCalls = 0, shelterCalls = 0, allRuns = new Set()

function proxy(prev, start) { // closest proxy for "hostile within 4 blocks at start": the previous call logged a hit from a mob <=4 blocks and ended <=10 s before this call began
  const d = prev?.damage?.at(-1)
  if (!d || !d.cause.includes('@') || start - prev.t > 10000) return false
  return Number(d.cause.split('@')[1]) <= 4
}
const add = (tab, k, v) => (tab[k] ??= []).push(v)
const row = (e, prev, run, startT) => {
  const dur = e.t - startT
  return { dur, ticksS: e.result.ticks / 20, mode: mode(e), res: e.result.ok ? 'ok' : e.result.reason, hp: e.before.health, died: !!e.damage?.some(d => d.hp <= 0), near4: proxy(prev, startT), run }
}

for (const file of files(/^skills-.*\.jsonl$/)) {
  const seen = new Set(); let prev = null
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue
    let e; try { e = JSON.parse(l) } catch { continue }
    if (!e.run) continue
    const k = e.run + e.t + e.skill; if (seen.has(k)) continue; seen.add(k)
    const startT = prev && prev.run === e.run ? prev.t : t0(e.run)
    if (e.skill === 'shelter') {
      const x = row(e, prev && prev.run === e.run ? prev : null, e.run, startT)
      shelterCalls++; allRuns.add(e.run)
      add(D, `${bucket(x.hp)}|${x.near4 ? 'near4-proxy' : 'no-recent-near4-hit'}`, x)
      add(D, `${bucket(x.hp)}|ALL`, x)
      if (giftRuns.has(e.run)) { add(C, x.mode + '|' + x.res, x); add(C, x.mode + '|ALL', x); add(C, 'ALL', x); giftCalls++ }
    }
    prev = e
  }
}
const g = [...giftRuns.values()]
const hours = g.reduce((s, r) => s + r.minutes, 0) / 60
console.log(`== C. shelter cost, gift runs (n=${g.length} runs, ${hours.toFixed(1)} run-hours, ${giftCalls} shelter calls)`)
console.log('duration = wall time since previous skill log ended (includes planner overhead); ticks/20 s in brackets (undercounts when tps<20)')
console.log('mode|result | calls | calls/h | median min | p90 min | total min | share of run time | [median ticks/20 s]')
for (const k of Object.keys(C).sort()) {
  const v = C[k], tot = v.reduce((s, x) => s + x.dur, 0) / 60000
  console.log(k.padEnd(26), v.length, f(v.length / hours, 1), f(median(v.map(x => x.dur)) / 60000), f(quant(v.map(x => x.dur), 0.9) / 60000), f(tot, 1), f(100 * tot / (hours * 60), 1) + '%', `[${f(median(v.map(x => x.ticksS)), 1)}]`)
}
const perRun = g.map(r => (C.ALL ?? []).filter(x => x.run === r.run).reduce((s, x) => s + x.dur, 0) / 60000 / r.minutes)
console.log('per-run share of run time in shelter: median', f(100 * median(perRun), 1) + '%', 'p90', f(100 * quant(perRun, 0.9), 1) + '%', 'max', f(100 * Math.max(...perRun), 1) + '%')
console.log(`\n== D. shelter death rate by start health (all skills logs: ${shelterCalls} shelter calls in ${allRuns.size} runs). death = an hp<=0 damage entry inside the call.`)
console.log('bucket|stratum | calls | deaths | death rate | median min')
for (const k of Object.keys(D).sort()) { const v = D[k]; console.log(k.padEnd(34), v.length, v.filter(x => x.died).length, f(100 * v.filter(x => x.died).length / v.length, 1) + '%', f(median(v.map(x => x.dur)) / 60000)) }
console.log('\n-- by mode and proxy (all health):')
const M = {}
for (const [k, v] of Object.entries(D)) if (!k.endsWith('|ALL')) for (const x of v) add(M, `${x.mode}|${x.near4 ? 'near4-proxy' : 'no-recent-near4-hit'}`, x)
for (const k of Object.keys(M).sort()) { const v = M[k]; console.log(k.padEnd(34), v.length, v.filter(x => x.died).length, f(100 * v.filter(x => x.died).length / v.length, 1) + '%') }
