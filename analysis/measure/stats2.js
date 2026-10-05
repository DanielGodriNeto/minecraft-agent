const { q, evalRows, eachLine, fs, LOGS } = require('./common'); const runs = require('./runs.json')
const sm = (a) => ({ n: a.length, min: +q(a, 0).toFixed(2), q1: +q(a, .25).toFixed(2), med: +q(a, .5).toFixed(2), q3: +q(a, .75).toFixed(2), max: +q(a, 1).toFixed(2) })
const iron = runs.filter(r => r.ironT && r.sec)
const out = { n: iron.length }
out.secAll = sm(iron.map(r => r.sec.all)); out.secIronCalls = sm(iron.map(r => r.sec.ironCalls)); out.secSmelt = sm(iron.map(r => r.sec.smelt))
out.ironCallsN = sm(iron.map(r => r.sec.ironCallsN)); out.rawGained = sm(iron.map(r => r.sec.gained))
out.shareIronCalls = +(iron.reduce((s, r) => s + r.sec.ironCalls, 0) / iron.reduce((s, r) => s + r.sec.all, 0)).toFixed(3)
out.shareSmelt = +(iron.reduce((s, r) => s + r.sec.smelt, 0) / iron.reduce((s, r) => s + r.sec.all, 0)).toFixed(3)
const g = iron.filter(r => r.sec.gained > 0)
out.secPerRawIron_pooled = +(g.reduce((s, r) => s + r.sec.ironCalls, 0) / g.reduce((s, r) => s + r.sec.gained, 0)).toFixed(1)
out.gainedLt3 = iron.filter(r => r.sec.gained < 3).length
// censoring-adjusted first bank among runs lasting >=59.5 min
const full = runs.filter(r => r.minutes >= 59.5)
const fb = r => r.deposits.find(d => d.n > 0)
out.full60 = { runs: full.length, bankedAny: full.filter(fb).length, share: Object.fromEntries([20, 30, 45, 60].map(m => [m, +(full.filter(r => fb(r) && (fb(r).t - r.t0) / 6e4 <= m).length / full.length).toFixed(3)])), firstBankMin: sm(full.filter(fb).map(r => (fb(r).t - r.t0) / 6e4)) }
// first-bank by iron time: gap from iron pick to first bank
const both = runs.filter(r => fb(r) && r.ironT)
out.ironToFirstBank = sm(both.map(r => (fb(r).t - r.ironT) / 6e4)); out.startToIronBankedRuns = sm(both.map(r => (r.ironT - r.t0) / 6e4))
out.ironPickRate_allRuns = +(runs.filter(r => r.ironT).length / runs.length).toFixed(3)
// final-pickaxe: banked runs share getting iron
out.bankedWithIron = both.length
// trace death undercount
const by = new Map(evalRows().map(r => [r.run, r])); let tr = 0, ev = 0, n = 0
;(async () => {
  for (const f of fs.readdirSync(LOGS).filter(f => /^trace-/.test(f))) {
    const run = f.slice(6, -6); const e = by.get(run); if (!e) continue
    let mx = 0; await eachLine(require('path').join(LOGS, f), l => { mx = Math.max(mx, l.deaths) }); tr += mx; ev += e.deaths; n++
  }
  out.traceDeaths = { runs: n, traceMaxDeaths: tr, evalDeaths: ev, undercount: +(1 - tr / ev).toFixed(3) }
  console.log(JSON.stringify(out, null, 1))
})()
