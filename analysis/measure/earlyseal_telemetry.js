// earlySeal A/B telemetry (arms earlySeal=0/1, slots 100-123). Run from the repo root: node analysis/measure/earlyseal_telemetry.js
// Skill logs matched to runs by `run` (as deaths.js); duration of a skill call = result.ticks / 20 (exact, unlike gap-to-previous-log).
const { evalRows } = require('./common')
const { skillsByRun, median } = require('./gift_common')
const ARMS = ['earlySeal=0', 'earlySeal=1']
const HOLD_TICKS = 1800 // EARLY_HOLD_MS 90 s; a hold that times out logs ~1900 ticks (seen: 1903, 1949)
const LOCK_MS = 300000 // EARLY_SEAL_LOCK_MS in bot/agent.js
const rows = evalRows().filter(r => ARMS.includes(r.arm) && r.slot >= 100 && r.slot <= 123 && !r.invalid)
const skillsOf = async () => skillsByRun(new Set(rows.map(r => r.run)))
const died = (e) => (e.damage ?? []).some(d => d.hp <= 0)
const sec = (e) => (e.result?.ticks ?? 0) / 20
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a'
const f = (n, d = 2) => n == null ? 'n/a' : n.toFixed(d)
const count = (a, key) => a.reduce((h, x) => { const k = key(x); h[k] = (h[k] ?? 0) + 1; return h }, {})
const hBucket = (h) => h == null ? 'missing' : h < 3 ? '<3' : h <= 8 ? '3-8' : '>8'
const hpBucket = (h) => h == null ? 'missing' : h < 4 ? '[0,4)' : h < 8 ? '[4,8)' : h < 12 ? '[8,12)' : h < 16 ? '[12,16)' : '[16,20]'
const deathGroup = (s) => ['fight', 'flee', 'shelter'].includes(s) ? s : s === 'mine' || s === 'dig_down' ? 'mine' : 'other'
function rate(list) { const d = list.filter(died).length; return `${d}/${list.length} (${pct(d, list.length)})` }
function byBucket(list, bucket, order) { const g = {}; list.forEach(e => (g[bucket(e)] ??= []).push(e)); return Object.fromEntries(order.filter(k => g[k]).map(k => [k, rate(g[k])])) }

;(async () => {
  const sk = await skillsOf()
  const out = {}
  for (const arm of ARMS) {
    const ar = rows.filter(r => r.arm === arm), hours = ar.reduce((s, r) => s + r.minutes, 0) / 60
    const ev = ar.flatMap(r => (sk.get(r.run) ?? []).map(e => ({ ...e, _r: r })))
    const sh = ev.filter(e => e.skill === 'shelter'), fl = ev.filter(e => e.skill === 'flee')
    const early = sh.filter(e => e.telemetry?.early), late = sh.filter(e => !e.telemetry?.early)
    const ph = (n) => f(n / hours)
    const o = { runs: ar.length, runsWithSkillLogs: ar.filter(r => sk.has(r.run)).length, runHours: f(hours), deathsEval: ar.reduce((s, r) => s + r.deaths, 0) }
    o.callsPerHour = { shelterEarly: ph(early.length), shelterNotEarly: ph(late.length), flee: ph(fl.length), earlyByReason: Object.fromEntries(Object.entries(count(early, e => e.telemetry.earlyReason ?? 'null')).map(([k, v]) => [k, ph(v)])) }
    o.earlyN = early.length
    o.earlyOutcomes = { ...count(early, e => died(e) ? 'died_inside' : e.result.ok ? 'ok' : e.result.reason) }
    const mins = early.map(e => sec(e) / 60), totMin = mins.reduce((a, b) => a + b, 0)
    o.earlyTime = { medianMin: f(median(mins), 3), totalMin: f(totMin, 1), pctRunTime: pct(totMin, ar.reduce((s, r) => s + r.minutes, 0)) }
    // (3) deaths by skill at death (dedupe run+t+skill, hp<=0 entry, as deaths.js)
    const dd = ev.filter(died)
    o.deathsPerHourBySkill = Object.fromEntries(Object.entries(count(dd, e => deathGroup(e.skill))).map(([k, v]) => [k, `${v} (${ph(v)}/h)`])); o.hp0Events = dd.length
    o.deathSkillsRaw = count(dd, e => e.skill)
    // (4) shelter death rate by startHealth / hostileDist (telemetry.* only; non-early and early shelters)
    const withT = (l) => l.filter(e => e.telemetry && 'startHealth' in e.telemetry)
    o.shelterTelemetryCoverage = `${withT(sh).length}/${sh.length}`
    for (const [name, l] of [['shelterAll', sh], ['shelterEarly', early], ['shelterNotEarly', late]]) {
      o[name + 'ByStartHealth'] = byBucket(l, e => hpBucket(e.telemetry?.startHealth), ['[0,4)', '[4,8)', '[8,12)', '[12,16)', '[16,20]', 'missing'])
      o[name + 'ByHostileDist'] = byBucket(l, e => hBucket(e.telemetry?.hostileDist), ['<3', '3-8', '>8', 'missing'])
    }
    o.shelterHostileDistNull = sh.filter(e => e.telemetry && 'hostileDist' in e.telemetry && e.telemetry.hostileDist == null).length
    // (5) sealFails
    const fails = sh.flatMap(e => (e.telemetry?.sealFails ?? []).map(x => ({ ...x, early: !!e.telemetry.early })))
    o.sealFails = { shelterCallsWithFails: sh.filter(e => e.telemetry?.sealFails).length, placements: fails.length, entityInCell: fails.filter(x => x.occupant).length, other: fails.filter(x => !x.occupant).length, occupantTypes: count(fails.filter(x => x.occupant), x => x.occupant.name), otherErrors: count(fails.filter(x => !x.occupant), x => x.error), earlyEntityInCell: fails.filter(x => x.early && x.occupant).length, earlyOther: fails.filter(x => x.early && !x.occupant).length }
    const callsFail = sh.filter(e => e.telemetry?.sealFails)
    o.sealFails.callsWithEntityFail = callsFail.filter(e => e.telemetry.sealFails.some(x => x.occupant)).length
    // (6) hold cap and lockout
    const capped = early.filter(e => e.result.ticks >= HOLD_TICKS)
    const byRunBot = new Map(); early.forEach(e => { const k = e.run + e.bot; (byRunBot.get(k) ?? byRunBot.set(k, []).get(k)).push(e) })
    let startsInLock = 0, failsTriggeringLock = early.filter(e => !e.result.ok).length, capReached = 0
    for (const l of byRunBot.values()) l.forEach((e, i) => {
      const start = e.t - sec(e) * 1000
      if (l.slice(0, i).some(p => !p.result.ok && start - p.t < LOCK_MS)) startsInLock++
      if (l.slice(0, i + 1).filter(p => e.t - p.t < 600000).length >= 2) capReached++
    })
    o.holdAndLockout = { hitHoldCap_ticksGE1800: capped.length, holdCapOutcomes: count(capped, e => e.result.ok ? 'ok' : e.result.reason), earlyFailsStartingLockout: failsTriggeringLock, earlyStartsInsideLockout_shouldBe0: startsInLock, earlySealsAfterWhichCap2per10minReached: capReached, lockoutBlocksNotObservable: true }
    out[arm] = o
  }
  console.log(JSON.stringify(out, null, 1))
})()
