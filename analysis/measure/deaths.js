const { evalRows, eachLine, files, band } = require('./common')
const rows = evalRows(), byRun = new Map(rows.map(r => [r.run, r]))
const seen = new Set(), deaths = [], skillRuns = new Set()
const cls = (c, e) => {
  const n = c.split('@')[0]
  if (n === 'unknown') return e.feet === 'air' && e.head === 'air' && !e.onFire && (e.oxygen ?? 20) >= 20 ? 'unknown(air,no hazard;fall?)' : 'unknown(other)'
  if (['zombie', 'zombie_villager', 'husk', 'drowned'].includes(n)) return n === 'drowned' ? 'drowned(mob)' : 'zombie-type'
  if (['skeleton', 'stray', 'bogged'].includes(n)) return 'skeleton-type(arrow)'
  if (['lava', 'magma'].includes(n)) return 'lava/magma'
  if (n === 'burning') return 'fire'
  if (['suffocation', 'drowning', 'creeper', 'spider', 'cave_spider'].includes(n)) return n
  return 'other:' + n
}
;(async () => {
  for (const f of files(/^skills-.*\.jsonl$/)) await eachLine(f, (r) => {
    if (r.run) skillRuns.add(r.run)
    if (!r.damage) return
    const i = r.damage.findIndex(d => d.hp <= 0); if (i < 0) return
    const k = r.run + r.t + r.skill; if (seen.has(k)) return; seen.add(k)
    const d = r.damage[i]
    let lastKnown = null
    for (let j = i; j >= 0; j--) if (r.damage[j].cause !== 'unknown') { lastKnown = r.damage[j]; break }
    deaths.push({ run: r.run, skill: r.skill, y: r.before.pos[1], cause: cls(d.cause, d), lastKnown: lastKnown ? cls(lastKnown.cause, lastKnown) : 'none', inEval: byRun.has(r.run), n: r.damage.length, idx: i })
  }, '"hp":0')
  const hist = (arr, key) => { const h = {}; arr.forEach(x => h[x[key]] = (h[x[key]] || 0) + 1); return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1])) }
  const ev = deaths.filter(d => d.inEval)
  const evalDeathsInSkillRuns = rows.filter(r => skillRuns.has(r.run)).reduce((s, r) => s + r.deaths, 0)
  console.log(JSON.stringify({
    evalRows: rows.length, evalDeathsTotal: rows.reduce((s, r) => s + r.deaths, 0), runsWithSkillLogs: rows.filter(r => skillRuns.has(r.run)).length,
    evalDeathsInRunsWithSkillLogs: evalDeathsInSkillRuns, hp0Events: deaths.length, hp0InEvalRuns: ev.length,
    causeAtDeath: hist(ev, 'cause'), lastKnownCause: hist(ev, 'lastKnown'),
    byBand: Object.fromEntries(['surface>60', '0..60', '-40..0', 'deep<-40'].map(b => { const s = ev.filter(d => band(d.y) === b); return [b, { n: s.length, causes: hist(s, 'cause'), lastKnown: hist(s, 'lastKnown') }] })),
    bySkill: hist(ev, 'skill'),
  }, null, 1))
})()
