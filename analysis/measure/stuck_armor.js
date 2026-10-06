// Q B: what the bot did before ending `stuck`. Last K skill calls per stuck run, armor vs base (and other arms for comparison). Run from repo root.
const { ARMS, giftRows, t0, skillsByRun, median } = require('./gift_common')
const K = Number(process.argv[2] ?? 8), only = process.argv[3] // optional arm filter
const by = giftRows()
const stuck = ARMS.flatMap(a => Object.values(by[a] ?? {}).filter(r => r.reason === 'stuck' && (!only || a === only)))
const pos = (p) => p.map(v => Math.round(v)).join(',')
;(async () => {
  const sk = await skillsByRun(new Set(stuck.map(r => r.run)))
  const pat = {}
  for (const arm of ARMS) {
    const rs = stuck.filter(r => r.arm === arm)
    if (!rs.length) continue
    console.log(`\n######## ${arm}: stuck runs=${rs.length} of ${Object.keys(by[arm]).length}; minutes median=${median(rs.map(r => r.minutes)).toFixed(1)}; deaths>0: ${rs.filter(r => r.deaths > 0).length}`)
    for (const r of rs) {
      const es = sk.get(r.run) ?? []
      const last = es.slice(-K)
      console.log(`\n-- ${r.run} slot ${r.slot} min=${r.minutes.toFixed(1)} deaths=${r.deaths} deposited=${r.deposited} decisions=${r.decisions} stuckResets=${JSON.stringify(r.stuckResets?.levels)} armorEnd=${r.armorPointsEnd} recoveries=${JSON.stringify(r.recoveries)} skillCalls=${es.length}`)
      if (!es.length) { console.log('   NO SKILLS LOG'); continue }
      for (const e of last) {
        const inv = e.after.inv, moved = Math.hypot(e.after.pos[0] - e.before.pos[0], e.after.pos[1] - e.before.pos[1], e.after.pos[2] - e.before.pos[2])
        console.log(`   +${((e.t - t0(r.run)) / 60000).toFixed(1)}m ${e.skill}(${JSON.stringify(e.args)}) ok=${e.result.ok} reason=${e.result.reason}${e.result.detail ? ' [' + e.result.detail.slice(0, 50) + ']' : ''} ticks=${e.result.ticks} pos=${pos(e.after.pos)} moved=${moved.toFixed(1)} hp=${e.after.health.toFixed(0)} food=${e.after.food} pick=${['diamond', 'iron', 'stone', 'wooden'].find(t => inv[t + '_pickaxe']) ?? 'none'} table=${inv.crafting_table ?? 0} night=${(e.after.time % 24000) >= 13000}`)
      }
      // when did the last pickaxe disappear? (inventory snapshot only: a pickaxe that breaks vanishes from inv; no break event is logged)
      const hasPick = (i) => ['diamond', 'iron', 'stone', 'wooden', 'netherite', 'golden'].some(t => i[t + '_pickaxe'])
      let lastIdx = -1; es.forEach((e, i) => { if (hasPick(e.after.inv)) lastIdx = i })
      const ln = es[lastIdx + 1], lp = es[lastIdx], fin = es.at(-1).after.inv
      console.log(lastIdx < 0 ? '   pickaxe: never present in any snapshot' : `   last snapshot WITH a pickaxe: call #${lastIdx} of ${es.length} (+${((lp.t - t0(r.run)) / 60000).toFixed(1)}m, ${lp.skill}); the next call that ended without one: ${ln ? ln.skill + '(' + JSON.stringify(ln.args).slice(0, 60) + ') ' + ln.result.reason : 'none'}; pickaxes in last pick snapshot: ${JSON.stringify(Object.fromEntries(Object.entries(lp.after.inv).filter(([k]) => k.endsWith('_pickaxe'))))} calls without a pickaxe before end: ${es.length - 1 - lastIdx}`)
      if (ln) { const dead = es.slice(0, lastIdx + 1).filter(e => e.damage?.some(d => d.hp <= 0)).at(-1); console.log(`   pickaxe-less from +${((lp.t - t0(r.run)) / 60000).toFixed(1)}m; current life started at +${dead ? ((dead.t - t0(r.run)) / 60000).toFixed(1) : '0.0'}m; run ended +${r.minutes.toFixed(1)}m; calls: ${JSON.stringify(es.slice(lastIdx + 1).reduce((c, e) => (c[e.skill] = (c[e.skill] || 0) + 1, c), {}))}`) }
      console.log('   final inv (materials): ' + JSON.stringify(Object.fromEntries(Object.entries(fin).filter(([k]) => /log|plank|stick|cobble|stone|iron|diamond|table|coal/.test(k)))))
      // pattern: which (skill,reason) dominates the last 12 calls
      const w = es.slice(-12), c = {}; w.forEach(e => { const k = `${e.skill}:${e.result.reason ?? 'ok'}`; c[k] = (c[k] || 0) + 1 })
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]
      console.log(`   last-12 histogram: ${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + 'x' + v).join(' ')}`)
      ;(pat[arm] ??= {})[top[0]] = (pat[arm][top[0]] || 0) + 1
    }
  }
  console.log('\n== dominant (skill:reason) in last 12 calls, count of stuck runs per arm'); console.log(JSON.stringify(pat, null, 1))
})()
