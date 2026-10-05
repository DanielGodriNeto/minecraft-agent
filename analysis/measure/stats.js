const { q } = require('./common'); const runs = require('./runs.json')
const sm = (a) => a.length ? { n: a.length, min: +q(a, 0).toFixed(2), q1: +q(a, .25).toFixed(2), med: +q(a, .5).toFixed(2), q3: +q(a, .75).toFixed(2), max: +q(a, 1).toFixed(2) } : { n: 0 }
const out = {}
// consistency: deposit sums vs eval
const withDep = runs.filter(r => r.deposited > 0)
out.depositCheck = { banked: withDep.length, exact: withDep.filter(r => r.deposits.reduce((s, d) => s + d.n, 0) === r.deposited).length, noDepositSkill: withDep.filter(r => !r.deposits.length).length }
// 2 iron economy
const iron = runs.filter(r => r.ironT && r.stoneT)
const mins = r => (r.ironT - r.stoneT) / 60000
const clean = iron.filter(r => !r.ironPhaseDeaths)
const describe = (set) => {
  const dur = set.map(mins), ing = set.map(r => r.ingots)
  const rate = set.filter(r => mins(r) > 0).map(r => r.ingots / mins(r))
  const tot = { min: dur.reduce((a, b) => a + b, 0), ing: ing.reduce((a, b) => a + b, 0) }
  return { runs: set.length, minutes: sm(dur), ingots: sm(ing), smeltCalls: sm(set.map(r => r.phase.smelt || 0)), mineCalls: sm(set.map(r => r.phase.mine || 0)), craftCalls: sm(set.map(r => r.phase.craft || 0)), allCalls: sm(set.map(r => Object.values(r.phase).reduce((a, b) => a + b, 0))), perRunRate: sm(rate), pooledIngotsPerMin: +(tot.ing / tot.min).toFixed(3), pooledMinPerIngot: +(tot.min / tot.ing).toFixed(2), zeroIngotRuns: set.filter(r => r.ingots === 0).length }
}
out.ironRuns = { gotIronPick: runs.filter(r => r.ironT).length, withStoneTimestamp: iron.length }
out.iron_all = describe(iron); out.iron_noDeathInPhase = describe(clean)
const pooled = out.iron_noDeathInPhase.pooledMinPerIngot
out.extrapolation_min_per_ingot_pooled_noDeath = Object.fromEntries([3, 6, 15].map(n => [n, +(n * pooled).toFixed(1)]))
const medRate = out.iron_noDeathInPhase.perRunRate.med
out.extrapolation_min_via_median_rate = Object.fromEntries([3, 6, 15].map(n => [n, +(n / medRate).toFixed(1)]))
// time from run start to stone pick / iron pick
out.t_runstart_to_stone = sm(iron.map(r => (r.stoneT - r.t0) / 60000)); out.t_runstart_to_iron = sm(iron.map(r => (r.ironT - r.t0) / 60000))
// 3 spare at leave
const lv = runs.filter(r => r.leave)
const frac = (f) => +(lv.filter(f).length / lv.length).toFixed(3)
out.leave = { runsWithLeave: lv.length, ironInventoryAtIronCraft: sm(iron.map(r => r.ironCraftInv.iron_ingot ?? 0)),
  spare_ingot_ge1: frac(r => r.leave.iron_ingot >= 1), spare_ingot_ge3: frac(r => r.leave.iron_ingot >= 3), spare_ingot_ge6: frac(r => r.leave.iron_ingot >= 6), spare_ingot_ge15: frac(r => r.leave.iron_ingot >= 15),
  spare_ingot_or_raw_ge3: frac(r => r.leave.iron_ingot + r.leave.raw_iron >= 3), spare_ingot_or_raw_ge6: frac(r => r.leave.iron_ingot + r.leave.raw_iron >= 6),
  ingot: sm(lv.map(r => r.leave.iron_ingot)), raw_iron: sm(lv.map(r => r.leave.raw_iron)), coal: sm(lv.map(r => r.leave.coal)), logsPlanks: sm(lv.map(r => r.leave.logs)), leaveY: sm(lv.map(r => r.leave.y)),
  coal_ge1: frac(r => r.leave.coal >= 1), coal_ge8: frac(r => r.leave.coal >= 8), coal_ge16: frac(r => r.leave.coal >= 16) }
// 4 time to first bank
const banked = runs.filter(r => r.deposits.length && r.deposits.some(d => d.n > 0))
const first = r => r.deposits.find(d => d.n > 0)
const ttb = banked.map(r => (first(r).t - r.t0) / 60000)
out.firstBank = { bankedRuns: banked.length, minutes: sm(ttb), share: Object.fromEntries([10, 15, 20, 30, 45, 60].map(m => [m, +(ttb.filter(x => x <= m).length / ttb.length).toFixed(3)])), shareOfAllRuns: Object.fromEntries([20, 30, 45, 60].map(m => [m, +(ttb.filter(x => x <= m).length / runs.length).toFixed(3)])), allRuns: runs.length }
const byLen = {}; banked.forEach(r => { const L = Math.round(r.minutes / 5) * 5; (byLen[L] ??= []).push((first(r).t - r.t0) / 60000) })
out.runLengthBuckets = Object.fromEntries(Object.entries(byLen).map(([k, v]) => [k, v.length]))
// 5 steady-state
const ss = (r) => { const f = first(r); const end = r.t0 + r.minutes * 60000; const hrs = (end - f.t) / 3600000; const later = r.deposits.filter(d => d !== f).reduce((s, d) => s + d.n, 0); return { hrs, later, rate: later / hrs } }
const mk = (set) => { const x = set.map(ss).filter(v => v.hrs > 0); return { runs: x.length, rate: sm(x.map(v => v.rate)), hoursAfterFirst: sm(x.map(v => v.hrs)), zeroLater: x.filter(v => v.later === 0).length, pooled: +(x.reduce((s, v) => s + v.later, 0) / x.reduce((s, v) => s + v.hrs, 0)).toFixed(2) } }
out.steady_timeout = mk(banked.filter(r => r.reason === 'timeout'))
out.steady_other = mk(banked.filter(r => r.reason !== 'timeout'))
out.steady_timeout_longEnough = mk(banked.filter(r => r.reason === 'timeout' && (r.t0 + r.minutes * 60000 - first(r).t) >= 20 * 60000))
out.reasonsBanked = banked.reduce((h, r) => (h[r.reason] = (h[r.reason] || 0) + 1, h), {})
out.minutesOfTimeouts = sm(runs.filter(r => r.reason === 'timeout').map(r => r.minutes))
console.log(JSON.stringify(out, null, 1))
