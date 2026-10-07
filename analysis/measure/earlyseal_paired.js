// Paired analysis of the earlySeal A/B (arm earlySeal=0 vs earlySeal=1, slots 100-123). Run from the repo root.
const fs = require('fs')
const rows = fs.readFileSync('logs/eval.jsonl', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l) } catch {} })
  .filter(r => r && r.slot >= 100 && r.slot <= 123 && /^earlySeal=[01]$/.test(r.arm || '') && !r.invalid)
const by = { 'earlySeal=0': {}, 'earlySeal=1': {} }
for (const r of rows) by[r.arm][r.slot] = r // latest row per (arm,slot)
const mean = a => a.reduce((s, x) => s + x, 0) / a.length
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2))
function wilcoxon(d) {
  const nz = d.filter(x => x !== 0), n = nz.length
  if (n < 6) return { n, p: NaN }
  const s = nz.map(x => ({ a: Math.abs(x), sg: Math.sign(x) })).sort((p, q) => p.a - q.a)
  let i = 0; while (i < n) { let j = i; while (j + 1 < n && s[j + 1].a === s[i].a) j++; for (let k = i; k <= j; k++) s[k].rank = (i + j) / 2 + 1; i = j + 1 }
  const W = s.reduce((t, x) => t + (x.sg > 0 ? x.rank : 0), 0)
  const mu = n * (n + 1) / 4, sig = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24)
  return { n, p: 2 * (1 - normCdf(Math.abs(W - mu) / sig)) }
}
const bankedAt = (r, t) => (r.deposits || []).filter(d => d.minute <= t).reduce((s, d) => s + d.count, 0)
const alive = r => (r.minutes || 0) / 60
const metrics = {
  'deaths': r => r.deaths || 0,
  'banked total': r => r.deposited || 0,
  'banked@60': r => bankedAt(r, 60),
  'banked@90': r => bankedAt(r, 90),
  'alive minutes': r => r.minutes || 0,
}
const slots = Object.keys(by['earlySeal=1']).filter(s => by['earlySeal=0'][s])
console.log('pairs', slots.length)
for (const a of ['earlySeal=0', 'earlySeal=1']) {
  const rs = Object.values(by[a]); const H = rs.reduce((s, r) => s + alive(r), 0)
  console.log(a, 'n', rs.length, 'banked', rs.reduce((s, r) => s + (r.deposited || 0), 0), 'deaths', rs.reduce((s, r) => s + (r.deaths || 0), 0), 'deaths/alive-h', (rs.reduce((s, r) => s + (r.deaths || 0), 0) / H).toFixed(2), 'stuck', rs.filter(r => r.reason === 'stuck').length, 'alive-h', H.toFixed(1), 'zero-death runs', rs.filter(r => !r.deaths).length)
}
for (const [name, f] of Object.entries(metrics)) {
  const d = slots.map(s => f(by['earlySeal=1'][s]) - f(by['earlySeal=0'][s]))
  const w = wilcoxon(d), se = sd(d) / Math.sqrt(d.length)
  console.log(`${name.padEnd(14)} meanDiff(on-off)=${mean(d).toFixed(2)} ±${(1.96 * se).toFixed(2)} wins/losses=${d.filter(x => x > 0).length}/${d.filter(x => x < 0).length} wilcoxonP=${w.p.toFixed(3)}`)
}
const rate = slots.map(s => { const a = by['earlySeal=0'][s], b = by['earlySeal=1'][s]; return (b.deaths || 0) / alive(b) - (a.deaths || 0) / alive(a) })
console.log('deaths/alive-h per pair meanDiff', mean(rate).toFixed(2), '±', (1.96 * sd(rate) / Math.sqrt(rate.length)).toFixed(2), 'wilcoxonP', wilcoxon(rate).p.toFixed(3))
const ins = (arm) => Object.values(by[arm]).reduce((m, r) => { m[r.instance] = (m[r.instance] || 0) + 1; return m }, {})
console.log('instances', JSON.stringify(ins('earlySeal=0')), JSON.stringify(ins('earlySeal=1')))
