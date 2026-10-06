// Q A: gift=armor vs gift=base, same 24 slots. Damage events/hit size by attacker, time to first death. Run from repo root.
const { giftRows, t0, skillsByRun, hits, cat, median } = require('./gift_common')
const by = giftRows(), arms = ['gift=base', 'gift=armor']
const slots = Object.keys(by['gift=armor']).filter(s => by['gift=base'][s])
;(async () => {
  const runs = new Set(arms.flatMap(a => slots.map(s => by[a][s].run)))
  const sk = await skillsByRun(runs)
  const cats = ['zombie', 'skeleton', 'spider', 'other']
  for (const a of arms) {
    const acc = { runs: 0, noSkills: 0, hours: 0, hoursPre: 0, nHit: {}, dmg: {}, nHitPre: {}, dmgPre: {}, perHit: {}, perHitPre: {}, first: [], deathsEval: 0, deathsSkills: 0, capped: 0, calls: 0 }
    for (const c of cats) { acc.nHit[c] = 0; acc.dmg[c] = 0; acc.nHitPre[c] = 0; acc.dmgPre[c] = 0; acc.perHit[c] = []; acc.perHitPre[c] = [] }
    const byMob = {}
    for (const s of slots) {
      const r = by[a][s], es = sk.get(r.run)
      if (!es) { acc.noSkills++; continue }
      acc.runs++; acc.hours += r.minutes / 60; acc.deathsEval += r.deaths
      let firstDeathMin = null
      for (const e of es) {
        if (!e.damage) continue
        acc.calls++; if (e.damage.length >= 10) acc.capped++
        const h = hits(e), dead = e.damage.some(d => d.hp <= 0)
        const pre = firstDeathMin === null
        for (const x of h) {
          const c = cat(x.name)
          acc.nHit[c]++; acc.dmg[c] += x.dmg; acc.perHit[c].push(x.dmg)
          if (pre) { acc.nHitPre[c]++; acc.dmgPre[c] += x.dmg; acc.perHitPre[c].push(x.dmg) }
          if (pre && ['zombie', 'skeleton', 'spider'].includes(c)) (byMob[x.name] ??= []).push(x.dmg)
        }
        if (dead) { acc.deathsSkills++; if (pre) firstDeathMin = (e.t - t0(r.run)) / 60000 }
      }
      acc.hoursPre += (firstDeathMin ?? r.minutes) / 60
      if (firstDeathMin !== null) acc.first.push(firstDeathMin)
    }
    const f = (x, d = 2) => x.toFixed(d)
    console.log(`\n== ${a}: runs=${acc.runs} (no skills log: ${acc.noSkills}) alive hours=${f(acc.hours)} hours before first death (or run end)=${f(acc.hoursPre)}`)
    console.log(`deaths eval.jsonl=${acc.deathsEval} hp<=0 entries in skills=${acc.deathsSkills}; runs with >=1 death=${acc.first.length}; time to first death min (n=${acc.first.length}) median=${acc.first.length ? f(median(acc.first), 1) : '-'} mean=${acc.first.length ? f(acc.first.reduce((x, y) => x + y, 0) / acc.first.length, 1) : '-'}; calls with damage=${acc.calls}, capped at 10 entries=${acc.capped}`)
    console.log('cause | WHOLE RUN: hits, total hp, hits/h, hp/h, mean hp/hit | BEFORE FIRST DEATH: hits, total hp, hits/h, hp/h, mean hp/hit')
    for (const c of cats) console.log(c.padEnd(9), '|', acc.nHit[c], f(acc.dmg[c], 1), f(acc.nHit[c] / acc.hours, 1), f(acc.dmg[c] / acc.hours, 1), acc.nHit[c] ? f(acc.dmg[c] / acc.nHit[c]) : '-', '|', acc.nHitPre[c], f(acc.dmgPre[c], 1), f(acc.nHitPre[c] / acc.hoursPre, 1), f(acc.dmgPre[c] / acc.hoursPre, 1), acc.nHitPre[c] ? f(acc.dmgPre[c] / acc.nHitPre[c]) : '-')
    const tot = (k) => cats.reduce((s, c) => s + acc[k][c], 0)
    console.log('TOTAL', '|', tot('nHit'), f(tot('dmg'), 1), f(tot('nHit') / acc.hours, 1), f(tot('dmg') / acc.hours, 1), '|', tot('nHitPre'), f(tot('dmgPre'), 1), f(tot('nHitPre') / acc.hoursPre, 1), f(tot('dmgPre') / acc.hoursPre, 1))
    console.log('per-attacker mean hp/hit before first death (n hits):', Object.entries(byMob).sort((x, y) => y[1].length - x[1].length).map(([n, v]) => `${n} ${f(v.reduce((x, y) => x + y, 0) / v.length)} (${v.length})`).join('; '))
    console.log('median hp/hit by cat (pre-death):', cats.map(c => `${c} ${median(acc.perHitPre[c])}`).join('; '))
  }
})()
