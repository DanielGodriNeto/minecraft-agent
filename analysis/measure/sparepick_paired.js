// Paired analysis of the SPAREPICK A/B (arms SPAREPICK=0 vs SPAREPICK=1, slots 100-123 by default; SLOT_MIN and SLOT_MAX override). Run from the repo root.
// Latest non-invalid row per (arm,slot); pairs by slot. Stuck classes as earlyseal_stuck.js: b=no pickaxe at end, hold=early shelter near end, other.
const { evalRows } = require('./common')
const { skillsByRun, t0 } = require('./gift_common')
const SMIN = +(process.env.SLOT_MIN || 100), SMAX = +(process.env.SLOT_MAX || 123)
const ARMS = ['SPAREPICK=0', 'SPAREPICK=1']
const all = evalRows().filter(r => ARMS.includes(r.arm) && r.slot >= SMIN && r.slot <= SMAX && !r.invalid)
const by = { [ARMS[0]]: {}, [ARMS[1]]: {} }
for (const r of all) by[r.arm][r.slot] = r
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2))
function wilcoxon(d) {
  const nz = d.filter(x => x !== 0), n = nz.length
  if (n < 6) return NaN
  const s = nz.map(x => ({ a: Math.abs(x), sg: Math.sign(x) })).sort((p, q) => p.a - q.a)
  let i = 0; while (i < n) { let j = i; while (j + 1 < n && s[j + 1].a === s[i].a) j++; for (let k = i; k <= j; k++) s[k].rank = (i + j) / 2 + 1; i = j + 1 }
  const W = s.reduce((t, x) => t + (x.sg > 0 ? x.rank : 0), 0)
  return 2 * (1 - normCdf(Math.abs(W - n * (n + 1) / 4) / Math.sqrt(n * (n + 1) * (2 * n + 1) / 24)))
}
const lf = [0]; for (let i = 1; i < 400; i++) lf[i] = lf[i - 1] + Math.log(i)
const lchoose = (n, k) => lf[n] - lf[k] - lf[n - k]
function fisher(a, b, c, d) { // two-sided
  const r1 = a + b, c1 = a + c, n = a + b + c + d
  const pr = x => Math.exp(lchoose(r1, x) + lchoose(n - r1, c1 - x) - lchoose(n, c1))
  const p0 = pr(a); let p = 0
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) if (pr(x) <= p0 * (1 + 1e-9)) p += pr(x)
  return p
}
const picks = inv => Object.keys(inv ?? {}).filter(k => k.endsWith('_pickaxe'))
const mins = (e, r) => (e.t - t0(r.run)) / 60000

function classOf(r, ev) {
  const last = ev.at(-1), endT = last?.t ?? t0(r.run) + r.minutes * 60000
  const endRow = (r.telemetry?.stuck ?? []).find(x => x.end)
  const noPick = endRow ? (endRow.pickaxes ?? []).length === 0 : last ? picks(last.after.inv).length === 0 : false
  const holdNearEnd = ev.filter(e => e.skill === 'shelter' && e.telemetry?.early && endT - e.t < 600000).length
  return noPick ? 'b_noPickaxe' : holdNearEnd > 0 ? 'hold' : 'other'
}
// minute of the last pickLost telemetry event in a run (null if none)
function lastLostMin(r, ev) {
  const m = ev.filter(e => e.telemetry?.pickLost?.length).map(e => mins(e, r))
  return m.length ? Math.max(...m) : null
}

;(async () => {
  const slots = Object.keys(by[ARMS[1]]).filter(s => by[ARMS[0]][s])
  const missing = a => { const m = []; for (let s = SMIN; s <= SMAX; s++) if (!by[a][s]) m.push(s); return m }
  console.log(`SPAREPICK A/B slots ${SMIN}-${SMAX}: pairs n=${slots.length}; missing off=[${missing(ARMS[0])}] on=[${missing(ARMS[1])}]`)
  const metrics = { deaths: r => r.deaths || 0, 'banked (deposited)': r => r.deposited || 0 }
  for (const [name, f] of Object.entries(metrics)) {
    const off = slots.map(s => f(by[ARMS[0]][s])), on = slots.map(s => f(by[ARMS[1]][s])), d = on.map((x, i) => x - off[i])
    console.log(`${name.padEnd(19)} sum off=${off.reduce((a, b) => a + b, 0)} on=${on.reduce((a, b) => a + b, 0)} meanDiff(on-off)=${mean(d).toFixed(2)} wins/losses=${d.filter(x => x > 0).length}/${d.filter(x => x < 0).length} wilcoxonP=${wilcoxon(d).toFixed(3)}`)
  }
  const sk = await skillsByRun(new Set(all.map(r => r.run)))
  const cls = {}, lost = {}
  for (const a of ARMS) {
    const rs = Object.values(by[a])
    cls[a] = rs.filter(r => r.reason === 'stuck').map(r => ({ slot: r.slot, c: classOf(r, sk.get(r.run) ?? []), min: r.minutes }))
    lost[a] = rs.map(r => lastLostMin(r, sk.get(r.run) ?? [])).filter(x => x != null)
  }
  const n = a => Object.keys(by[a]).length, st = a => cls[a].length
  const [s0, s1, n0, n1] = [st(ARMS[0]), st(ARMS[1]), n(ARMS[0]), n(ARMS[1])]
  console.log(`stuck off=${s0}/${n0} on=${s1}/${n1} Fisher p=${fisher(s1, n1 - s1, s0, n0 - s0).toFixed(3)}`)
  for (const a of ARMS) {
    const c = k => cls[a].filter(x => x.c === k).length
    console.log(a, `stuck classes: b_noPickaxe=${c('b_noPickaxe')} hold=${c('hold')} other=${c('other')}; stuck slots/min: ${cls[a].map(x => `${x.slot}:${x.c[0]}@${x.min.toFixed(0)}`).join(' ') || '-'}`)
    console.log(a, `last pickLost minute: mean=${lost[a].length ? mean(lost[a]).toFixed(1) : 'n/a'} over ${lost[a].length}/${n(a)} runs with pickLost telemetry`)
  }
  const b0 = cls[ARMS[0]].filter(x => x.c === 'b_noPickaxe').length, b1 = cls[ARMS[1]].filter(x => x.c === 'b_noPickaxe').length
  console.log(`class b on=${b1}/${n1} off=${b0}/${n0} Fisher p=${fisher(b1, n1 - b1, b0, n0 - b0).toFixed(3)}`)
})()
