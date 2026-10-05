const { evalRows, eachLine, files, fs, LOGS } = require('./common')
const rows = evalRows(); const by = new Map(rows.map(r => [r.run, r]))
const sk = new Map(), tr = new Set()
;(async () => {
  for (const f of files(/^skills-.*\.jsonl$/)) { const s = new Set(); await eachLine(f, r => { if (r.run) s.add(r.run) }); for (const r of s) sk.set(r, (sk.get(r) || 0) + 1) }
  for (const f of fs.readdirSync(LOGS).filter(f => /^trace-/.test(f))) tr.add(f.slice(6, -6))
  const banked = rows.filter(r => r.deposited > 0)
  console.log({ rows: rows.length, banked: banked.length, skillRuns: sk.size, multiFile: [...sk.values()].filter(x => x > 1).length, skillRunsInEval: [...sk.keys()].filter(k => by.has(k)).length, traceRuns: tr.size, traceInEval: [...tr].filter(k => by.has(k)).length,
    bankedWithSkills: banked.filter(r => sk.has(r.run)).length, bankedWithTrace: banked.filter(r => tr.has(r.run)).length, bankedWithEither: banked.filter(r => sk.has(r.run) || tr.has(r.run)).length,
    traceNotInSkills: [...tr].filter(k => !sk.has(k)).length })
  const x = rows.filter(r => r.deposited > 0 && r.deposits).slice(0, 2).map(r => [r.run, JSON.stringify(r.deposits), r.minutes]); console.log(x)
  const t = [...tr].slice(0, 3); console.log(t, t.map(k => by.get(k)?.minutes))
})()
