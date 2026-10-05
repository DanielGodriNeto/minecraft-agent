// Usage: node analysis/build.js  -> writes analysis/out/*  (runs with a TRACELOG trace only)
const fs = require('node:fs'), path = require('node:path')
const LOGS = path.join(__dirname, '..', 'logs'), OUT = path.join(__dirname, 'out')
fs.mkdirSync(path.join(OUT, 'timelines'), { recursive: true })
const rd = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const rows = rd(path.join(LOGS, 'eval.jsonl'))
const seen = new Set(), runs = []
for (const r of rows) {
  if (!r.run || seen.has(r.run)) continue
  const f = path.join(LOGS, `trace-${r.run}.jsonl`)
  if (!fs.existsSync(f)) continue
  const tr = rd(f)
  if (!tr.length) continue
  seen.add(r.run)
  runs.push({ r, tr })
}
const PICK = ['wooden', 'stone', 'iron', 'diamond']
const min = (t, t0) => +((t - t0) / 60000).toFixed(1)
const analyze = ({ r, tr }) => {
  const t0 = Number(r.run.split('-')[1]) || tr[0].ts
  const m = {}, mark = (k, e) => { if (m[k] === undefined) m[k] = { t: min(e.ts, t0), y: e.y, pos: e.pos } }
  const timeBySkill = {}, deaths = []
  let minY = 999, maxDia = 0, lastDeaths = 0
  tr.forEach((e, i) => {
    if (e.inv?.wood > 0) mark('wood', e)
    if (e.inv?.stone >= 3) mark('cobble3', e)
    for (const p of PICK) if (e.inv?.pickaxes?.[p] > 0) mark(p + '_pick', e)
    if (e.inv?.diamond > 0) mark('first_diamond', e)
    if (e.inv?.diamond >= 3) mark('three_diamonds', e)
    if (e.y < 0) mark('below_y0', e)
    if (e.y <= -50) mark('diamond_depth', e)
    minY = Math.min(minY, e.y); maxDia = Math.max(maxDia, e.inv?.diamond ?? 0)
    if ((e.deaths ?? 0) > lastDeaths) { deaths.push({ t: min(e.ts, t0), pos: e.pos, y: e.y, prevSkill: tr[i - 1]?.skill }); lastDeaths = e.deaths }
    const next = tr[i + 1]
    if (next) timeBySkill[e.skill] = (timeBySkill[e.skill] ?? 0) + (next.ts - e.ts) / 60000
  })
  const last = tr.at(-1)
  const stage = ['first_diamond', 'diamond_depth', 'iron_pick', 'stone_pick', 'wooden_pick', 'wood'].find(k => m[k]) ?? 'nothing'
  const stageMap = { first_diamond: '6 diamond mined', diamond_depth: '5 reached y<=-50', iron_pick: '4 iron pickaxe', stone_pick: '3 stone pickaxe', wooden_pick: '2 wooden pickaxe', wood: '1 got wood', nothing: '0 nothing' }
  let dist = 0
  for (let i = 1; i < tr.length; i++) { const a = tr[i - 1].pos, b = tr[i].pos; if (a && b) dist += Math.hypot(a[0] - b[0], a[2] - b[2]) }
  const start = tr[0].pos, far = Math.max(...tr.map(e => Math.hypot(e.pos[0] - start[0], e.pos[2] - start[2])))
  return { slot: r.slot, run: r.run, arm: r.arm ?? '', reason: r.reason, deposited: r.deposited, deaths: r.deaths, minutes: +(+r.minutes).toFixed(1),
    decisions: tr.length, stage: stageMap[stage], milestones: m, minY, maxDiamondsHeld: maxDia, deathList: deaths, timeBySkill,
    endSkill: last.skill, endY: last.y, endPos: last.pos, lastFailure: last.lastFailure, failSigs: last.stuck?.failSigs ?? {}, travelBlocks: Math.round(dist), maxFromStart: Math.round(far), startPos: start,
    tail: tr.slice(-8).map(e => `${min(e.ts, t0)}m ${e.skill} y${e.y} hp${e.health} f${e.food} ${e.lastFailure ? 'FAIL:' + e.lastFailure.skill + ':' + e.lastFailure.reason : ''}`) }
}
const A = runs.map(analyze)
fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(A, null, 1))
const cols = ['slot', 'arm', 'reason', 'deposited', 'deaths', 'minutes', 'decisions', 'stage', 'minY', 'maxDiamondsHeld', 'travelBlocks', 'maxFromStart', 'endSkill', 'endY']
const ms = ['wood', 'cobble3', 'wooden_pick', 'stone_pick', 'iron_pick', 'below_y0', 'diamond_depth', 'first_diamond', 'three_diamonds']
const csv = [[...cols, 'lastFailure', ...ms.map(k => k + '_min'), ...ms.map(k => k + '_y')].join(',')]
for (const a of A) csv.push([...cols.map(c => String(a[c]).replace(/,/g, ';')), a.lastFailure ? `${a.lastFailure.skill}:${a.lastFailure.reason}` : '', ...ms.map(k => a.milestones[k]?.t ?? ''), ...ms.map(k => a.milestones[k]?.y ?? '')].join(','))
fs.writeFileSync(path.join(OUT, 'runs.csv'), csv.join('\n'))

const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-'
const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null }
const N = A.length
const banked = A.filter(a => a.deposited > 0), notBanked = A.filter(a => !a.deposited)
let md = `# Playtest report\n\nRuns with a trace: **${N}** (slots ${Math.min(...A.map(a => a.slot))}-${Math.max(...A.map(a => a.slot))}); eval rows total ${rows.length}. Includes every A/B arm (mixed switch settings), so read section 9 for arm differences.\n\n`
md += `## 1. Endings\n| reason | n | % |\n|---|---|---|\n`
const byR = {}; A.forEach(a => byR[a.reason] = (byR[a.reason] ?? 0) + 1)
for (const [k, v] of Object.entries(byR)) md += `| ${k} | ${v} | ${pct(v, N)} |\n`
md += `\nBanked (deposited>0): ${banked.length} = ${pct(banked.length, N)}; runs with >=1 death: ${pct(A.filter(a => a.deaths > 0).length, N)}\n\n`
md += `## 2. Progress funnel (% of runs reaching each milestone; median minute and y when reached)\n| milestone | runs | % | median min | median y |\n|---|---|---|---|---|\n`
for (const k of [...ms, 'dep']) {
  const hit = k === 'dep' ? banked : A.filter(a => a.milestones[k])
  md += `| ${k === 'dep' ? 'deposited >=1 (min = run length)' : k} | ${hit.length} | ${pct(hit.length, N)} | ${k === 'dep' ? med(hit.map(a => a.minutes)) : med(hit.map(a => a.milestones[k].t))} | ${k === 'dep' ? '' : med(hit.map(a => a.milestones[k].y))} |\n`
}
md += `\n## 3. Highest stage reached vs ending\n| stage | n | % | timeout | stuck | death/other | banked |\n|---|---|---|---|---|---|---|\n`
for (const s of [...new Set(A.map(a => a.stage))].sort()) { const g = A.filter(a => a.stage === s); md += `| ${s} | ${g.length} | ${pct(g.length, N)} | ${g.filter(a => a.reason === 'timeout').length} | ${g.filter(a => a.reason === 'stuck').length} | ${g.filter(a => !['timeout', 'stuck'].includes(a.reason)).length} | ${g.filter(a => a.deposited > 0).length} |\n` }
md += `\n## 4. Where time goes (mean minutes per run by skill)\n| skill | banked | not banked |\n|---|---|---|\n`
const skills = [...new Set(A.flatMap(a => Object.keys(a.timeBySkill)))]
const tot = s => A.reduce((t, a) => t + (a.timeBySkill[s] ?? 0), 0)
for (const s of skills.sort((x, y) => tot(y) - tot(x))) md += `| ${s} | ${(banked.reduce((t, a) => t + (a.timeBySkill[s] ?? 0), 0) / (banked.length || 1)).toFixed(1)} | ${(notBanked.reduce((t, a) => t + (a.timeBySkill[s] ?? 0), 0) / (notBanked.length || 1)).toFixed(1)} |\n`
md += `\n## 5. Why runs ended without banking\nNot banked: ${notBanked.length} (${pct(notBanked.length, N)})\n\n| ending | n |\n|---|---|\n`
const fc = {}
notBanked.forEach(a => { const k = `${a.reason} / last skill ${a.endSkill} / ${a.lastFailure ? a.lastFailure.skill + ':' + a.lastFailure.reason : 'no failure'}`; fc[k] = (fc[k] ?? 0) + 1 })
Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => md += `| ${k} | ${v} |\n`)
md += `\n## 6. Deaths\nTotal deaths ${A.reduce((t, a) => t + a.deathList.length, 0)}. Skill running just before the death was logged:\n\n| prev skill | n | median y | median minute |\n|---|---|---|---|\n`
const dg = {}
A.flatMap(a => a.deathList).forEach(d => (dg[d.prevSkill] ??= []).push(d))
Object.entries(dg).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => md += `| ${k} | ${v.length} | ${med(v.map(x => x.y))} | ${med(v.map(x => x.t))} |\n`)
md += `\n## 7. Failure signatures (runs that hit each at least once)\n| failSig | runs | % |\n|---|---|---|\n`
const f2 = {}; A.forEach(a => Object.keys(a.failSigs).forEach(k => f2[k] = (f2[k] ?? 0) + 1))
Object.entries(f2).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => md += `| ${k} | ${v} | ${pct(v, N)} |\n`)
md += `\n## 8. Banked vs not banked: median minute to milestone (among runs that reached it)\n| milestone | banked | not banked |\n|---|---|---|\n`
for (const k of ms) md += `| ${k} | ${med(banked.map(a => a.milestones[k]?.t))} | ${med(notBanked.map(a => a.milestones[k]?.t))} |\n`
md += `\n## 9. By arm\n| arm | n | banked | timeout | stuck | death-end | mean max diamonds held |\n|---|---|---|---|---|---|---|\n`
const arms = {}; A.forEach(a => (arms[a.arm] ??= []).push(a))
for (const [k, g] of Object.entries(arms)) md += `| ${k || '(none)'} | ${g.length} | ${pct(g.filter(a => a.deposited > 0).length, g.length)} | ${pct(g.filter(a => a.reason === 'timeout').length, g.length)} | ${pct(g.filter(a => a.reason === 'stuck').length, g.length)} | ${pct(g.filter(a => !['timeout', 'stuck'].includes(a.reason)).length, g.length)} | ${(g.reduce((t, a) => t + a.maxDiamondsHeld, 0) / g.length).toFixed(2)} |\n`

const pick = (f, n) => { const l = A.filter(f).sort((a, b) => a.slot - b.slot); const step = Math.max(1, Math.floor(l.length / n)); return l.filter((_, i) => i % step === 0).slice(0, n) }
const cases = [['FAST BANK', A.filter(a => a.deposited > 0).sort((a, b) => a.minutes - b.minutes).slice(0, 4)],
  ['SLOW BANK', A.filter(a => a.deposited > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 3)],
  ['STUCK no pickaxe', pick(a => a.reason === 'stuck' && !a.milestones.wooden_pick, 3)],
  ['STUCK stone pick no diamond', pick(a => a.reason === 'stuck' && a.milestones.stone_pick && !a.milestones.first_diamond, 4)],
  ['TIMEOUT no diamond', pick(a => a.reason === 'timeout' && !a.milestones.first_diamond, 4)],
  ['TIMEOUT diamond not banked', pick(a => a.reason === 'timeout' && a.milestones.first_diamond && !a.deposited, 3)],
  ['DIED not banked', pick(a => a.deaths > 0 && !a.deposited, 4)]]
md += `\n## 10. Case studies (full decision-by-decision timelines in timelines/)\n`
const tl = a => { const m = a.milestones; return `slot ${a.slot} [${a.arm}] ${a.reason}, deposited ${a.deposited}, deaths ${a.deaths}, ${a.minutes} min, stage "${a.stage}"\n` + ms.filter(k => m[k]).map(k => `  - ${k}: min ${m[k].t}, y ${m[k].y}, pos ${m[k].pos}`).join('\n') + `\n  - start ${a.startPos}, end ${a.endPos}, travelled ${a.travelBlocks} blocks (max ${a.maxFromStart} from spawn)\n  - time by skill: ${Object.entries(a.timeBySkill).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => k + ' ' + v.toFixed(1) + 'm').join(', ')}\n  - deaths: ${a.deathList.map(d => `${d.t}m y${d.y} after ${d.prevSkill}`).join('; ') || 'none'}\n  - failSigs: ${JSON.stringify(a.failSigs)}\n  - last decisions:\n${a.tail.map(x => '      ' + x).join('\n')}\n` }
for (const [title, list] of cases) {
  md += `\n### ${title}\n`
  for (const a of list) {
    md += '```\n' + tl(a) + '```\n'
    const full = runs.find(x => x.r.run === a.run).tr
    const t0 = Number(a.run.split('-')[1]) || full[0].ts
    const name = title.toLowerCase().replace(/ /g, '_')
    fs.writeFileSync(path.join(OUT, 'timelines', `${name}-slot${a.slot}.txt`), full.map(e => `${String(min(e.ts, t0)).padStart(6)}m ${e.skill.padEnd(10)} pos ${e.pos} hp${e.health} food${e.food} pick W${e.inv.pickaxes.wooden}/S${e.inv.pickaxes.stone}/I${e.inv.pickaxes.iron}/D${e.inv.pickaxes.diamond} cobble${e.inv.stone} wood${e.inv.wood} dia${e.inv.diamond} d${e.deaths} args=${JSON.stringify(e.args).slice(0, 90)} ${e.lastFailure ? 'FAIL ' + e.lastFailure.skill + ':' + e.lastFailure.reason : ''}`).join('\n'))
  }
}
fs.writeFileSync(path.join(OUT, 'REPORT.md'), md)
console.log(N, 'runs ->', OUT)
