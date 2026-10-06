// Paired analysis of the gift ablation: per-slot diamonds banked, each arm vs base. Run from the repo root.
const fs = require('fs')
const rows = fs.readFileSync('logs/eval.jsonl', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l) } catch {} })
  .filter(r => r && r.slot >= 100 && r.slot <= 123 && ['372d2d1', '278538c'].includes(r.commit) && r.arm?.startsWith('gift=') && !r.invalid)
const by = {}
for (const r of rows) (by[r.arm] ??= {})[r.slot] = r // latest row per (arm,slot) wins
const arms = ['gift=base', 'gift=armor', 'gift=spare', 'gift=fortune2', 'gift=diamondpick']
const mean = a => a.reduce((s, x) => s + x, 0) / a.length
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2))
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
function wilcoxon(d) { // signed-rank, zeros dropped, tie-averaged ranks, normal approximation
  const nz = d.filter(x => x !== 0); const n = nz.length
  if (n < 6) return { n, p: NaN }
  const s = nz.map(x => ({ a: Math.abs(x), sg: Math.sign(x) })).sort((p, q) => p.a - q.a)
  let i = 0; while (i < n) { let j = i; while (j + 1 < n && s[j + 1].a === s[i].a) j++; for (let k = i; k <= j; k++) s[k].rank = (i + j) / 2 + 1; i = j + 1 }
  const W = s.reduce((t, x) => t + (x.sg > 0 ? x.rank : 0), 0)
  const mu = n * (n + 1) / 4, sig = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24)
  return { n, W, p: 2 * (1 - normCdf(Math.abs(W - mu) / sig)) }
}
const first = r => r.deposits?.[0]?.minute ?? null
const metric = { banked: r => r.deposited || 0, deaths: r => r.deaths || 0 }
console.log('arm | n | mean banked | median | mean deaths | stuck | mean minutes | median first bank (min) | zero-bank runs')
for (const a of arms) {
  const rs = Object.values(by[a] ?? {}); const b = rs.map(metric.banked).sort((x, y) => x - y)
  const fb = rs.map(first).filter(x => x != null).sort((x, y) => x - y)
  console.log(a, rs.length, mean(b).toFixed(2), b[b.length >> 1], mean(rs.map(metric.deaths)).toFixed(2), rs.filter(r => r.reason === 'stuck').length, mean(rs.map(r => r.minutes)).toFixed(1), fb[fb.length >> 1], b.filter(x => x === 0).length)
}
for (const m of ['banked', 'deaths']) {
  console.log(`\npaired vs base on ${m} (slot pairs; Wilcoxon signed-rank, normal approx; log1p mean diff, 95% CI)`)
  for (const a of arms.slice(1)) {
    const slots = Object.keys(by[a]).filter(s => by['gift=base'][s])
    const d = slots.map(s => metric[m](by[a][s]) - metric[m](by['gift=base'][s]))
    const ld = slots.map(s => Math.log1p(metric[m](by[a][s])) - Math.log1p(metric[m](by['gift=base'][s])))
    const se = sd(ld) / Math.sqrt(ld.length), w = wilcoxon(d)
    console.log(a, `pairs=${slots.length} meanDiff=${mean(d).toFixed(2)} wins/losses=${d.filter(x => x > 0).length}/${d.filter(x => x < 0).length} wilcoxonP=${w.p.toFixed(3)} log1pDiff=${mean(ld).toFixed(2)} ±${(1.96 * se).toFixed(2)} (ratio ~${Math.exp(mean(ld)).toFixed(2)}x)`)
  }
}
