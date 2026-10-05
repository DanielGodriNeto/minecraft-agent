// Per-run extraction from skills-*.jsonl + eval.jsonl -> runs.json (cache for stats.js)
const { evalRows, eachLine, files, fs, path } = require('./common')
const rows = evalRows(), by = new Map(rows.map(r => [r.run, r]))
const runs = new Map()
const inv = (s) => s?.inv ?? {}
const FUEL = ['coal', 'charcoal']
function st(r) {
  if (!runs.has(r)) runs.set(r, { run: r, t0: Number(r.split('-').pop()), n: 0, stoneT: null, ironT: null, haveStone: false, deposits: [], phase: {}, ingots: 0, hp0: [], leave: null, firstT: null, lastT: null })
  return runs.get(r)
}
;(async () => {
  for (const f of files(/^skills-.*\.jsonl$/)) await eachLine(f, (r) => {
    if (!r.run || !by.has(r.run)) return
    const s = st(r.run); s.n++; s.firstT ??= r.t; s.lastT = r.t
    const b = inv(r.before), a = inv(r.after); const gap = s.prevT ? (r.t - s.prevT) / 1000 : 0; s.prevT = r.t
    if (r.damage?.some(d => d.hp <= 0)) s.hp0.push(r.t)
    // stone pick: last 0->1 transition before iron pick
    const hadStone = (b.stone_pickaxe ?? 0) > 0, hasStone = (a.stone_pickaxe ?? 0) > 0
    if (s.ironT === null) {
      if (!hadStone && hasStone) s.stoneT = r.t, s.phase = {}, s.ingots = 0, s.sec = null
      if (s.stoneT !== null && hasStone) {
        if (r.t !== s.stoneT || hadStone) { s.phase[r.skill] = (s.phase[r.skill] || 0) + 1 }
        if (r.t !== s.stoneT || hadStone) { const g = (a.raw_iron ?? 0) - (b.raw_iron ?? 0); const isIronCall = JSON.stringify(r.args).includes('iron_ore'); s.sec ??= { all: 0, ironCalls: 0, ironCallsN: 0, smelt: 0, gained: 0 }; s.sec.all += gap; if (isIronCall) { s.sec.ironCalls += gap; s.sec.ironCallsN++ } if (g > 0) s.sec.gained += g; if (r.skill === 'smelt') s.sec.smelt += gap }
        if (r.skill === 'smelt') s.ingots += Math.max(0, (a.iron_ingot ?? 0) - (b.iron_ingot ?? 0))
      }
      if ((a.iron_pickaxe ?? 0) > 0 && (b.iron_pickaxe ?? 0) === 0) { s.ironT = r.t; s.ironCraftInv = a; s.ironPhaseDeaths = s.hp0.filter(t => s.stoneT !== null && t >= s.stoneT).length }
      if (hadStone && !hasStone) { s.stoneT = null; s.phase = {}; s.ingots = 0; s.sec = null } // lost inventory (death) before iron
    }
    // leaving y16: first dig_down after iron pickaxe held, starting at y>=0
    if (s.ironT !== null && s.leave === null && r.skill === 'dig_down' && (b.iron_pickaxe ?? 0) > 0 && r.before.pos[1] >= 0)
      s.leave = { y: r.before.pos[1], t: r.t, iron_ingot: b.iron_ingot ?? 0, raw_iron: b.raw_iron ?? 0, coal: FUEL.reduce((n, k) => n + (b[k] ?? 0), 0), logs: Object.entries(b).filter(([k]) => /_log$|_planks$/.test(k)).reduce((n, [, v]) => n + v, 0), pick: b.stone_pickaxe ?? 0 }
    if (r.skill === 'deposit' && r.result?.ok) { const n = (b.diamond ?? 0) - (a.diamond ?? 0); r.result && s.deposits.push({ t: r.t, n }) }
    if (r.skill === 'smelt' && s.ironT === null) { /* counted above */ }
  })
  const out = [...runs.values()].map(s => { const e = by.get(s.run); return { ...s, reason: e.reason, deposited: e.deposited, deaths: e.deaths, minutes: e.minutes, difficulty: e.difficulty, slot: e.slot } })
  fs.writeFileSync(path.join(__dirname, 'runs.json'), JSON.stringify(out))
  console.log(out.length)
})()
