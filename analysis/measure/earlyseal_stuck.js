// earlySeal A/B: why do runs end `stuck`? Run from the repo root: node analysis/measure/earlyseal_stuck.js [--all]
// Per run (slots SLOT_MIN-SLOT_MAX env, default 100-123, arms earlySeal=0/1): stuck row, last skills, pickaxes, pickLost events, early shelters near the end.
// Minute = (t - run start)/60000; run start = run tag suffix. Pickaxes come from skill-log inventories (before/after).
const { evalRows } = require('./common')
const { skillsByRun, t0 } = require('./gift_common')
const SMIN = +(process.env.SLOT_MIN || 100), SMAX = +(process.env.SLOT_MAX || 123)
// latest non-invalid row per (arm,slot), as earlyseal_paired.js (rows come from several launches)
const rows = [...new Map(evalRows().filter(r => /^earlySeal=[01]$/.test(r.arm ?? '') && r.slot >= SMIN && r.slot <= SMAX && !r.invalid).map(r => [r.arm + '|' + r.slot, r])).values()]
const picks = (inv) => Object.entries(inv ?? {}).filter(([k]) => k.endsWith('_pickaxe')).map(([k, n]) => k + (n > 1 ? 'x' + n : '')).join('+') || '-'
const hasPick = (inv) => picks(inv) !== '-'
const mins = (e, r) => ((e.t - t0(r.run)) / 60000).toFixed(1)
const ok = (e) => e.result.ok ? 'ok' : e.result.reason
const pos = (e) => e.after.pos.map(Math.round).join(',')

function summarize(r, ev) {
  const early = ev.filter(e => e.skill === 'shelter' && e.telemetry?.early)
  const lostEv = ev.filter(e => e.telemetry?.pickLost).flatMap(e => e.telemetry.pickLost.map(p => ({ min: mins(e, r), skill: e.skill, ...p })))
  const last = ev.at(-1)
  const finalPick = last ? hasPick(last.after.inv) : null
  let lastWithPick = null
  ev.forEach(e => { if (hasPick(e.after.inv)) lastWithPick = e })
  const everPick = ev.some(e => hasPick(e.before.inv) || hasPick(e.after.inv))
  return { early, lostEv, last, finalPick, lastWithPick, everPick, lostLast: everPick && finalPick === false }
}

function detail(r, ev, s) {
  const endT = s.last?.t ?? t0(r.run) + r.minutes * 60000
  const tail = ev.slice(-5)
  const earlyEnd = s.early.filter(e => endT - e.t < 600000).map(e => `${mins(e, r)}m ${ok(e)} ${(e.result.ticks / 20).toFixed(0)}s`)
  const stk = r.telemetry?.stuck ?? []
  const endRow = stk.find(x => x.end)
  const unchanged = tail.length > 1 && tail.every(e => JSON.stringify(e.after.inv) === JSON.stringify(tail[0].after.inv) && Math.hypot(...e.after.pos.map((v, i) => v - tail[0].after.pos[i])) < 5)
  console.log(`\n${r.arm} slot${r.slot} reason=${r.reason} min=${r.minutes.toFixed(1)} deaths=${r.deaths} stuckResets=${JSON.stringify(r.stuckResets?.levels)} total=${r.stuckResets?.count}`)
  console.log(`  stuck rows=${stk.length} end-row picks=${JSON.stringify((endRow?.pickaxes ?? []).map(p => p.name))} recent=${(endRow?.recent ?? []).map(x => x.skill + ':' + (x.ok ? 'ok' : x.reason)).join(' ')}`)
  console.log(`  log last5=${tail.map(e => e.skill + ':' + ok(e)).join(' ')} | pos=${s.last ? pos(s.last) : '?'} | tail same pos(<5)+inv=${unchanged}`)
  console.log(`  picks final=${s.last ? picks(s.last.after.inv) : '?'} lastWithPick=${s.lastWithPick ? mins(s.lastWithPick, r) + 'm' : 'none'} pickLost=${JSON.stringify(s.lostEv.map(p => `${p.min}m ${p.skill} ${p.name} ${p.cause} ${p.durabilityUsed}/${p.maxDurability}`))}`)
  console.log(`  early shelters total=${s.early.length}; in last 10 min before end: ${earlyEnd.join('; ') || 'none'}; log entries=${ev.length}`)
}

// ---- classification of stuck runs: (a) earlySeal hold/loop, (b) no pickaxe left, (c) other ----
const lf = [0]; for (let i = 1; i < 400; i++) lf[i] = lf[i - 1] + Math.log(i)
const lchoose = (n, k) => lf[n] - lf[k] - lf[n - k]
// two-sided Fisher exact test on [[a,b],[c,d]] (sum of tables with probability <= observed)
function fisher(a, b, c, d) {
  const r1 = a + b, c1 = a + c, n = a + b + c + d
  const pr = (x) => Math.exp(lchoose(r1, x) + lchoose(n - r1, c1 - x) - lchoose(n, c1))
  const p0 = pr(a); let p = 0
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) if (pr(x) <= p0 * (1 + 1e-9)) p += pr(x)
  return p
}
function classOf(r, ev) {
  const s = summarize(r, ev), endT = s.last?.t ?? t0(r.run) + r.minutes * 60000
  const endRow = (r.telemetry?.stuck ?? []).find(x => x.end)
  const noPick = endRow ? (endRow.pickaxes ?? []).length === 0 : s.finalPick === false
  const earlyNearEnd = s.early.filter(e => endT - e.t < 600000).length
  const last5Shelter = ev.slice(-5).filter(e => e.skill === 'shelter').length
  const cls = noPick ? 'b_noPickaxe' : earlyNearEnd > 0 ? 'a_earlySealHold' : 'c_other'
  const lastPick = s.lastWithPick ? +mins(s.lastWithPick, r) : null // last log entry that still held a pickaxe
  return { cls, earlyNearEnd, last5Shelter, noPick, lastPick, everPick: s.everPick, stuckMin: r.minutes, deaths: r.deaths, pickLostEvents: s.lostEv.length }
}
function classify(rows, sk) {
  const out = {}
  for (const r of rows.filter(x => x.reason === 'stuck')) (out[r.arm] ??= []).push({ slot: r.slot, ...classOf(r, sk.get(r.run) ?? []) })
  const cnt = (arm, c) => (out[arm] ?? []).filter(x => x.cls === c).length
  const n = (arm) => rows.filter(r => r.arm === arm).length
  console.log(`\n== stuck classes, slots ${SMIN}-${SMAX} (a=earlySeal hold near end, b=no pickaxe at end, c=other; b takes precedence)`)
  for (const arm of ['earlySeal=0', 'earlySeal=1']) console.log(arm, `stuck=${(out[arm] ?? []).length}/${n(arm)}`, ['a_earlySealHold', 'b_noPickaxe', 'c_other'].map(c => c + '=' + cnt(arm, c)).join(' '), `noPick&earlyNearEnd=${(out[arm] ?? []).filter(x => x.noPick && x.earlyNearEnd).length}`)
  const s0 = (out['earlySeal=0'] ?? []).length, s1 = (out['earlySeal=1'] ?? []).length, n0 = n('earlySeal=0'), n1 = n('earlySeal=1')
  console.log(`Fisher stuck on vs off: ${s1}/${n1} vs ${s0}/${n0} p=${fisher(s1, n1 - s1, s0, n0 - s0).toFixed(3)}`)
  const b0 = cnt('earlySeal=0', 'b_noPickaxe'), b1 = cnt('earlySeal=1', 'b_noPickaxe')
  console.log(`Fisher class b on vs off: ${b1}/${n1} vs ${b0}/${n0} p=${fisher(b1, n1 - b1, b0, n0 - b0).toFixed(3)}`)
  const m = (l) => l.length ? (l.reduce((x, y) => x + y, 0) / l.length).toFixed(2) : 'n/a'
  for (const arm of ['earlySeal=0', 'earlySeal=1']) {
    const l = out[arm] ?? [], b = l.filter(x => x.cls === 'b_noPickaxe')
    console.log(arm, `stuck: deaths before stuck mean=${m(l.map(x => x.deaths))} (${l.map(x => x.deaths).join(',')}); stuck minute mean=${m(l.map(x => x.stuckMin))}; class b: deaths mean=${m(b.map(x => x.deaths))}, last-pickaxe min mean=${m(b.filter(x => x.lastPick != null).map(x => x.lastPick))} (${b.map(x => x.lastPick ?? '-').join(',')}), stuck min=${b.map(x => x.stuckMin.toFixed(0)).join(',')}`)
  }
  for (const arm of Object.keys(out)) for (const x of out[arm]) console.log(' ', arm, JSON.stringify(x))
}

;(async () => {
  const sk = await skillsByRun(new Set(rows.map(r => r.run)))
  const stat = {}
  const wantDetail = new Set()
  for (const r of rows) {
    const ev = sk.get(r.run) ?? [], s = summarize(r, ev)
    const a = (stat[r.arm] ??= { runs: 0, stuck: 0, lostLast: 0, lostLastAndStuck: 0, pickLostEvents: 0, earlyN: [], earlyNLost: [], earlyNKept: [], stuckAliveMin: 0 })
    a.runs++; if (r.reason === 'stuck') { a.stuck++; wantDetail.add(r) }
    if (s.lostLast) { a.lostLast++; a.earlyNLost.push(s.early.length); if (r.reason === 'stuck') a.lostLastAndStuck++ } else a.earlyNKept.push(s.early.length)
    a.pickLostEvents += s.lostEv.length; a.earlyN.push(s.early.length)
    if (!ev.length) console.log('NO LOGS', r.run)
  }
  classify(rows, sk)
  const mean = (l) => l.length ? (l.reduce((x, y) => x + y, 0) / l.length).toFixed(2) : 'n/a'
  for (const [arm, a] of Object.entries(stat)) console.log(arm, `runs=${a.runs} stuck=${a.stuck} runsEndingWithoutPickaxe(had one earlier)=${a.lostLast} (of which stuck ${a.lostLastAndStuck}) pickLostEvents=${a.pickLostEvents} meanEarlyShelters: lost=${mean(a.earlyNLost)} kept=${mean(a.earlyNKept)} all=${mean(a.earlyN)}`)
  // Spearman-free check on the earlySeal=1 arm: runs by early-shelter count vs ending without pickaxe
  const on = rows.filter(r => r.arm === 'earlySeal=1').map(r => { const s = summarize(r, sk.get(r.run) ?? []); return { n: s.early.length, lost: s.lostLast } })
  const lo = on.filter(x => x.n <= 2), hi = on.filter(x => x.n > 2)
  console.log(`earlySeal=1 early<=2: ${lo.filter(x => x.lost).length}/${lo.length} lost pickaxe; early>2: ${hi.filter(x => x.lost).length}/${hi.length}`)
  for (const r of rows.filter(x => wantDetail.has(x))) detail(r, sk.get(r.run) ?? [], summarize(r, sk.get(r.run) ?? []))
  if (process.argv.includes('--all')) for (const r of rows.filter(x => !wantDetail.has(x))) detail(r, sk.get(r.run) ?? [], summarize(r, sk.get(r.run) ?? []))
})()
