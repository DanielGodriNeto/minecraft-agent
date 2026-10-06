// Shared loader for the step-0 gift analyses. Run scripts from the repo root.
const { fs, LOGS, eachLine, files, path } = require('./common')
const ARMS = ['gift=base', 'gift=armor', 'gift=spare', 'gift=fortune2', 'gift=diamondpick']

// Same selection as gift_paired.js: slots 100-123, commits 372d2d1/278538c, gift= arms, not invalid, latest row per arm+slot.
function giftRows() {
  const rows = fs.readFileSync(path.join(LOGS, 'eval.jsonl'), 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l) } catch {} })
    .filter(r => r && r.slot >= 100 && r.slot <= 123 && ['372d2d1', '278538c'].includes(r.commit) && r.arm?.startsWith('gift=') && !r.invalid)
  const by = {}
  for (const r of rows) (by[r.arm] ??= {})[r.slot] = r
  return by
}

const t0 = (run) => Number(run.split('-').pop()) // run tag suffix = run start (ms), see FINDINGS.md header

// Streams every skills log once; returns Map run -> entries sorted by t, deduped on bot+t+skill, only for runs in `runSet` (null = all).
async function skillsByRun(runSet) {
  const m = new Map(), seen = new Set()
  for (const f of files(/^skills-.*\.jsonl$/)) await eachLine(f, (r) => {
    if (!r.run || (runSet && !runSet.has(r.run))) return
    const k = r.bot + r.t + r.skill + r.run; if (seen.has(k)) return; seen.add(k)
    if (!m.has(r.run)) m.set(r.run, []); m.get(r.run).push(r)
  })
  for (const v of m.values()) v.sort((a, b) => a.t - b.t)
  return m
}

// Per-hit damage from a call's damage[] (each entry is the hp AFTER a health drop; no timestamp, no amount).
// First hit = before.health - hp (regen/eat before the hit is not logged); if the array hit the 10-entry cap the oldest entries were dropped, so the first delta is skipped.
function hits(e) {
  const out = []; let prev = e.before.health
  e.damage.forEach((d, i) => {
    const dmg = prev - d.hp; prev = d.hp
    if (i === 0 && e.damage.length >= 10) return
    if (dmg > 0) out.push({ ...d, dmg, name: d.cause.split('@')[0], dist: d.cause.includes('@') ? Number(d.cause.split('@')[1]) : null })
  })
  return out
}
const cat = (n) => ['zombie', 'zombie_villager', 'husk', 'drowned'].includes(n) ? 'zombie' : ['skeleton', 'stray', 'bogged'].includes(n) ? 'skeleton' : ['spider', 'cave_spider'].includes(n) ? 'spider' : 'other'
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const quant = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null }
module.exports = { ARMS, giftRows, t0, skillsByRun, hits, cat, median, quant }
