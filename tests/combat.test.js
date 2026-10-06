// Observational live test (needs the flat-world dev server): can the existing shelter/fight skills handle an adjacent zombie?
// It reports a table (and writes analysis/measure/combat_baseline.md); assertions are sanity checks only.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { connect, CENTER } = require('./harness.js')
const { runSkill, sealed } = require('../bot/skills.js')
const { observe, afterSkill } = require('../bot/agent.js')
const { nextAction, DEFAULT_PARAMS } = require('../bot/planner.js')

const RUNS = 10
const planRows = []
const OUT = path.join(__dirname, '../analysis/measure/combat_baseline.md')
const rows = []
const diag = []
const notes = []
let h
before(async () => { h = await connect() })
after(() => h?.end())

const mean = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-'
const tally = (xs) => Object.entries(xs.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).map(([k, v]) => `${k}x${v}`).join(' ')

// Right after reset the saturation effect makes regeneration heal ~2 hp/s, which would undo the damage within seconds.
// So the hungry bot is drained first (food < 18, no regen). Side effect: safeToLeave's "food < 18" branch is true for these runs.
async function setHealth(hp) {
  if (hp >= 20) return
  await h.cmd('/effect give DiamondBot hunger 10 100')
  await h.poll(() => h.bot.food < 17, 15000)
  await h.cmd('/effect clear DiamondBot hunger')
  try {
    await h.cmd(`/damage DiamondBot ${20 - hp} minecraft:generic`)
    if (!notes.includes('hp via /damage')) notes.push('hp via /damage')
  } catch {
    await h.cmd('/effect give DiamondBot instant_damage 1 1') // level II = 12 hp
    if (!notes.includes('hp via instant_damage (/damage failed)')) notes.push('hp via instant_damage (/damage failed)')
  }
  await h.poll(() => h.bot.health > 0 && h.bot.health <= hp + 0.5)
}

// Stone block with a 1x2 tunnel along x through CENTER (y = -60..-59). `west`/`east` = open cells beyond the bot's cell; the far ends are stone.
// Built while the bot waits in a corner so the fill cannot suffocate it.
async function buildTunnel({ west, east }) {
  const { x, y, z } = CENTER
  await h.reset({ x: 200, y: -60, z: 200 })
  await h.cmd(`/fill ${x - west - 1} ${y} ${z - 1} ${x + east + 1} ${y + 2} ${z + 1} stone`)
  await h.cmd(`/fill ${x - west} ${y} ${z} ${x + east} ${y + 1} ${z} air`)
  await h.teleport(CENTER)
}

// The 9 cells shelter() must fill, in skills.js order (DIRS = E S W N at feet, then head, then the roof).
const DIR_LABELS = [['E', 1, 0], ['S', 0, 1], ['W', -1, 0], ['N', 0, -1]]
const cellsOf = (feet) => [0, 1].flatMap(dy => DIR_LABELS.map(([l, dx, dz]) => ({ label: `${l}${dy}`, pos: feet.offset(dx, dy, dz) })))
  .concat([{ label: 'R', pos: feet.offset(0, 2, 0) }])
const isBlock = (b) => b?.boundingBox === 'block'

// The bot's chunk view can lag behind /fill. Asks the server (/execute if block) for each shelter cell and waits until the bot sees the same.
// Returns how many cells disagreed at first (stale view), 0 when it was already in sync.
async function syncView(bot, feet) {
  const truth = []
  for (const c of cellsOf(feet)) truth.push([c, !/passed/.test(await h.cmd(`/execute if block ${c.pos.x} ${c.pos.y} ${c.pos.z} minecraft:air`))])
  const stale = () => truth.filter(([c, solid]) => isBlock(bot.blockAt(c.pos)) !== solid).length
  const first = stale()
  if (first) await h.poll(() => stale() === 0, 3000).catch(() => {})
  return first
}

// Name of an entity (other than the bot) overlapping the cell; zombie hitbox 0.6 x 1.95.
const occupant = (bot, c) => Object.values(bot.entities).find(e => e !== bot.entity && e.username !== 'Owner' && e.position
  && Math.abs(e.position.x - (c.x + 0.5)) < 0.8 && Math.abs(e.position.z - (c.z + 0.5)) < 0.8
  && e.position.y < c.y + 1 && e.position.y + 1.95 > c.y)?.name

// Observes without touching bot/*.js: wraps this bot instance's placeBlock/equip and samples every physics tick.
function trace(bot, t, feet, zombie) {
  const cells = cellsOf(feet)
  const tr = { solidAt: {}, placements: [], equipErrors: [], zdist: [], adjTick: null, pre: cells.filter(c => isBlock(bot.blockAt(c.pos))).map(c => c.label), open: [] }
  t.trace = tr
  const { placeBlock, equip } = bot
  bot.placeBlock = async (ref, face, ...rest) => {
    const target = ref.position.offset(face.x, face.y, face.z)
    const cell = cells.find(c => c.pos.equals(target))?.label ?? `?${target.x - feet.x},${target.y - feet.y},${target.z - feet.z}`
    const rec = { tick: t.ticks, cell, occ: occupant(bot, target) ?? null }
    tr.placements.push(rec)
    try {
      const r = await placeBlock.call(bot, ref, face, ...rest)
      rec.ok = true
      return r
    } catch (e) {
      rec.ok = false
      rec.err = e.message.slice(0, 70)
      throw e
    } finally {
      rec.done = t.ticks
    }
  }
  bot.equip = async (...a) => {
    try { return await equip.apply(bot, a) } catch (e) { tr.equipErrors.push(e.message.slice(0, 70)); throw e }
  }
  const tick = () => {
    for (const c of cells) if (!(c.label in tr.solidAt) && !tr.pre.includes(c.label) && isBlock(bot.blockAt(c.pos))) tr.solidAt[c.label] = t.ticks
    const d = zombie.position.distanceTo(bot.entity.position)
    if (t.ticks % 5 === 0) tr.zdist.push(Math.round(d))
    if (tr.adjTick === null && d <= 1.6) tr.adjTick = t.ticks
  }
  bot.on('physicsTick', tick)
  return () => {
    bot.placeBlock = placeBlock; bot.equip = equip; bot.off('physicsTick', tick)
    tr.open = cells.filter(c => !isBlock(bot.blockAt(c.pos))).map(c => c.label)
  }
}

// Dominant cause of an unsealed run: b = a failed placement had an entity in the target cell, c = equip error / no item,
// d = another placement error, a = nothing failed (too slow, or the cell was never attempted because canHold said no).
function cause(r) {
  const fails = r.trace.placements.filter(p => !p.ok)
  if (r.sealedTick !== null) return 'sealed'
  if (fails.some(p => p.occ)) return 'b_entity'
  if (r.trace.equipErrors.length || r.res.reason === 'missing') return 'c_equip'
  if (fails.length) return 'd_error'
  return 'a_slow'
}

// One trial: fixture, then the skill while counting physics ticks, min hp and the first tick the cell is sealed.
async function trial({ items, hp = 20, zombieDx, skill, args = [], tunnel }) {
  await h.poll(() => h.bot.health > 0) // respawned after a death
  if (tunnel) await buildTunnel(tunnel)
  else await h.reset()
  for (const [item, n] of items) await h.give(item, n)
  await setHealth(hp)
  // /kill leaves the old zombie in bot.entities for a while; it would be taken for the new one (and look adjacent)
  await h.poll(() => !Object.values(h.bot.entities).some(e => e.name === 'zombie'), 5000)
  const staleCells = await syncView(h.bot, h.bot.entity.position.floored())
  await h.cmd(`/summon zombie ${CENTER.x + 0.5 + zombieDx} ${CENTER.y} ${CENTER.z + 0.5} {PersistenceRequired:1b}`)
  await h.poll(() => h.bot.nearestEntity(e => e.name === 'zombie'))
  const zombie = h.bot.nearestEntity(e => e.name === 'zombie')
  const bot = h.bot
  const feet = bot.entity.position.floored()
  const t = { staleCells, startHp: bot.health, minHp: bot.health, ticks: 0, sealedTick: null, sealedHp: null, died: false }
  const untrace = skill === 'shelter' ? trace(bot, t, feet, zombie) : () => {}
  const onTick = () => {
    t.ticks++
    if (t.sealedTick !== null || !sealed(bot, feet)) return
    t.sealedTick = t.ticks; t.sealedHp = bot.health
    if (skill === 'shelter') h.cmd('/kill @e[type=zombie]').catch(() => {}) // sealed: the 30 s wait is not under test, end it
  }
  const onHealth = () => { t.minHp = Math.min(t.minHp, bot.health) }
  const onDeath = () => { t.died = true }
  bot.on('physicsTick', onTick); bot.on('health', onHealth); bot.on('death', onDeath)
  const res = await runSkill(bot, skill, ...args)
  bot.off('physicsTick', onTick); bot.off('health', onHealth); bot.off('death', onDeath)
  untrace()
  const killed = await h.poll(() => !bot.entities[zombie.id] || zombie.metadata?.[9] <= 0, 2000).then(() => true, () => false)
  return { ...t, res, zombieAlive: !killed, held: bot.heldItem?.name ?? 'hands' }
}

async function scenario(name, opts, win) {
  const rs = []
  for (let i = 0; i < RUNS; i++) rs.push(await trial(opts))
  const ok = rs.filter(win)
  rows.push({
    name, n: rs.length, wins: ok.length,
    startHp: mean(rs.map(r => r.startHp)),
    hpLost: mean(rs.map(r => r.startHp - r.minHp)),
    ticks: mean(rs.map(r => r.sealedTick ?? r.ticks)),
    deaths: rs.filter(r => r.died).length,
    reasons: tally(rs.map(r => `${r.res.reason ?? (r.res.ok && r.zombieAlive ? 'ok_but_zombie_alive' : 'ok')}${r.died ? '+died' : ''}`)),
    held: tally(rs.map(r => r.held)),
  })
  if (opts.skill === 'shelter') diag.push({ name, rs })
  assert.strictEqual(rs.length, RUNS)
}

const sealWin = (r) => r.sealedTick !== null && !r.died
const fightWin = (r) => r.res.ok && !r.zombieAlive && !r.died
const COBBLE = [['cobblestone', 16], ['iron_pickaxe', 1]] // the pickaxe lets the bot dig out afterwards, as in a real run

test('SEAL-ADJ', () => scenario('SEAL-ADJ (20hp, zombie 1 away)', { items: COBBLE, zombieDx: 1, skill: 'shelter', args: [0, 'threat'] }, sealWin))
test('SEAL-ADJ-LOW', () => scenario('SEAL-ADJ-LOW (8hp, zombie 1 away)', { items: COBBLE, hp: 8, zombieDx: 1, skill: 'shelter', args: [0, 'threat'] }, sealWin))
test('SEAL-FAR', () => scenario('SEAL-FAR (20hp, zombie 8 away)', { items: COBBLE, zombieDx: 8, skill: 'shelter', args: [0, 'threat'] }, sealWin))

// Zombie in the tunnel on the east side. CLOSED: 4 open cells behind the bot, then stone. OPEN-BOTH: a long tunnel on both sides.
const TUNNELS = [['TUNNEL-CLOSED', { west: 4, east: 12 }], ['TUNNEL-OPEN-BOTH', { west: 15, east: 14 }]]
for (const [label, tunnel] of TUNNELS) {
  for (const hp of [20, 8]) {
    for (const d of [1, 3, 8]) {
      const name = `${label} (${hp}hp, zombie ${d} away)`
      test(name, () => scenario(name, { items: COBBLE, hp, zombieDx: d, skill: 'shelter', args: [0, 'threat'], tunnel }, sealWin))
    }
  }
}

test('FIGHT-1 pickaxe only', () => scenario('FIGHT-1 iron_pickaxe', { items: [['iron_pickaxe', 1]], zombieDx: 2, skill: 'fight' }, fightWin))
test('FIGHT-1 stone sword', () => scenario('FIGHT-1 stone_sword', { items: [['iron_pickaxe', 1], ['stone_sword', 1]], zombieDx: 2, skill: 'fight' }, fightWin))
test('FIGHT-1 iron sword', () => scenario('FIGHT-1 iron_sword', { items: [['iron_pickaxe', 1], ['iron_sword', 1]], zombieDx: 2, skill: 'fight' }, fightWin))

// ---- planner decision scenarios: the real observe() -> nextAction() -> runSkill() loop, earlySeal off vs on ----
// Tunnel with a zombie coming from the east. Ends when the zombie is dead, the bot died, 35 s after the seal closed (the off arm
// digs out at 30 s, the on arm holds), or at 75 s. `dugOut` = the cell opened again while the zombie was alive.
const PLAN_SKILLS = new Set(['shelter', 'fight', 'flee', 'eat'])
const PLAN_CAP_MS = 75000
const PLAN_HOLD_MS = 35000
const PLAN_TUNNEL = { west: 15, east: 14 }

function planRun(earlySeal) {
  const home = { x: CENTER.x, y: CENTER.y, z: CENTER.z }
  return {
    params: { ...DEFAULT_PARAMS, earlySeal }, memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0 }, home, surfaceY: CENTER.y + 10, // underground: at night on the surface the planner shelters at any health, which would hide the switch
    objective: { item: 'diamond', count: 'max' }, deposited: 0, deadline: Date.now() + 10 * 60000, deaths: 0,
  }
}

async function planTrial({ hp, dist, earlySeal }) {
  await h.poll(() => h.bot.health > 0)
  await buildTunnel(PLAN_TUNNEL)
  for (const [item, n] of COBBLE) await h.give(item, n)
  await setHealth(hp)
  await h.poll(() => !Object.values(h.bot.entities).some(e => e.name === 'zombie'), 5000)
  await syncView(h.bot, h.bot.entity.position.floored())
  await h.cmd(`/summon zombie ${CENTER.x + 0.5 + dist} ${CENTER.y} ${CENTER.z + 0.5} {PersistenceRequired:1b}`)
  await h.poll(() => h.bot.nearestEntity(e => e.name === 'zombie'))
  const bot = h.bot
  const zombie = bot.nearestEntity(e => e.name === 'zombie')
  const feet = bot.entity.position.floored()
  const run = planRun(earlySeal)
  bot.objectiveRun = run
  const t = { startHp: bot.health, minHp: bot.health, ticks: 0, sealedTick: null, sealedAt: null, died: false, dugOut: false, actions: [], skillLog: [] }
  const onTick = () => {
    t.ticks++
    const closed = sealed(bot, feet)
    if (t.sealedTick === null && closed) { t.sealedTick = t.ticks; t.sealedAt = Date.now() }
    else if (t.sealedTick !== null && !closed && bot.entities[zombie.id]) t.dugOut = true
  }
  const onHealth = () => { t.minHp = Math.min(t.minHp, bot.health) }
  const onDeath = () => { t.died = true }
  bot.on('physicsTick', onTick); bot.on('health', onHealth); bot.on('death', onDeath)
  const t0 = Date.now()
  const zombieDead = () => !bot.entities[zombie.id]
  const over = () => t.died || zombieDead() || Date.now() - t0 > PLAN_CAP_MS || (t.sealedAt !== null && Date.now() - t.sealedAt > PLAN_HOLD_MS)
  try {
    while (!over()) {
      const action = nextAction(observe(bot, run))
      if (!action || !PLAN_SKILLS.has(action.skill)) { await bot.waitForTicks(5); continue }
      t.actions.push(action.key === 'early_seal' ? 'early_seal' : action.skill)
      const deathsBefore = run.deaths
      const exec = runSkill(bot, action.skill, ...action.args)
      let watch
      const ended = new Promise(resolve => { watch = setInterval(() => { if (over()) resolve(null) }, 200) })
      const result = await Promise.race([exec, ended])
      clearInterval(watch)
      if (!result) { bot.skillCancel && (bot.skillCancel.cancelled = true, bot.skillCancel.reason ??= 'test_end'); await exec; break }
      t.skillLog.push(`${action.skill}:${result.reason ?? 'ok'}`)
      afterSkill(run, action, result, deathsBefore)
    }
  } finally {
    bot.off('physicsTick', onTick); bot.off('health', onHealth); bot.off('death', onDeath)
    bot.objectiveRun = null
  }
  return { ...t, zombieKilled: zombieDead() && !t.died, sealedAtEnd: sealed(bot, feet) }
}

async function planScenario(name, opts) {
  const rs = []
  for (let i = 0; i < RUNS; i++) rs.push(await planTrial(opts))
  const sealedRuns = rs.filter(r => r.sealedTick !== null)
  planRows.push({
    name, n: rs.length,
    survived: rs.filter(r => !r.died).length,
    sealed: sealedRuns.length,
    ticks: mean(sealedRuns.map(r => r.sealedTick)),
    hpLost: mean(rs.map(r => r.startHp - r.minHp)),
    dugOut: rs.filter(r => r.dugOut).length,
    killed: rs.filter(r => r.zombieKilled).length,
    first: tally(rs.map(r => r.actions[0] ?? 'none')),
  })
  assert.strictEqual(rs.length, RUNS)
}

for (const hp of [12, 20]) {
  for (const dist of [8, 5]) {
    for (const earlySeal of [false, true]) {
      const name = `PLAN earlySeal=${earlySeal ? 'on' : 'off'} (${hp}hp, zombie ${dist} away)`
      test(name, () => planScenario(name, { hp, dist, earlySeal }))
    }
  }
}

const runLine = (r, i) => {
  const p = r.trace.placements
  const errs = [...new Set(p.filter(x => !x.ok).map(x => `${x.cell}${x.occ ? `(${x.occ})` : ''}:${x.err}`))].slice(0, 3).join(' | ')
  return `- #${i + 1} ${cause(r)} sealed@${r.sealedTick ?? '-'} end@${r.ticks} adj@${r.trace.adjTick ?? '-'} stale=${r.staleCells} placeCalls ok/fail=${p.filter(x => x.ok).length}/${p.filter(x => !x.ok).length} first@${p[0]?.tick ?? '-'} pre=[${r.trace.pre}] open=[${r.trace.open}] solidAt=${JSON.stringify(r.trace.solidAt)} zdist/5t=[${r.trace.zdist.slice(0, 12)}] errs=${errs || '-'}`
}

function diagnosis() {
  const sumRows = diag.map(({ name, rs }) => {
    const c = rs.map(cause)
    const n = (k) => c.filter(x => x === k).length
    const adj = rs.map(r => r.trace.adjTick).filter(x => x !== null)
    return `| ${name} | ${n('sealed')} | ${n('a_slow')} | ${n('b_entity')} | ${n('c_equip')} | ${n('d_error')} | ${mean(adj)} | ${rs.length - adj.length} | ${mean(rs.map(r => r.trace.placements.length))} | ${rs.filter(r => r.staleCells).length} |`
  })
  const detail = diag.filter(d => /SEAL-FAR|TUNNEL/.test(d.name)).map(({ name, rs }) => `### ${name}\n${rs.map(runLine).join('\n')}`)
  return `\n## Failure diagnosis (shelter runs)\n\nCause per unsealed run: a_slow = no placement failed (too slow, or a cell never attempted); b_entity = a failed placement had an entity overlapping the target cell; c_equip = equip error or missing item; d_error = another placement error. Once sealed the zombie is killed to skip the 30 s wait, so hp lost is up to the seal. Adjacent = zombie within 1.6 blocks of the bot.\n\n| scenario | sealed | a_slow | b_entity | c_equip | d_error | mean adjacent tick | never adjacent | mean placeBlock calls |\n|---|---|---|---|---|---|---|---|---|\n${sumRows.join('\n')}\n\n${detail.join('\n\n')}\n`
}

// Static findings appended to the generated md (kept in sync with the last run by hand).
const FINDINGS = '\n## Findings (shelter)\n\n- Dominant failure: (b) entity in the target cell, in every unsealed run (a/c/d = 0 in all 15 scenarios; no equip errors, no missing items, no other placement errors; all failures are "Server refused to place cobblestone"). Those failures are the zombie standing in E0/E1 (or N1 once) when the bot tries the cell, so it is a race lost to arrival time: placing costs ~11 ticks per block on the flat (~92 ticks for 9 cells), ~21 ticks per block in a tunnel (4 blocks, seal ~66 ticks), and a zombie 8 away is adjacent at ~85 ticks.\n- Zombie 1 away in a tunnel or flat world: never sealed (0/10 everywhere). The zombie spawns inside the first cell to fill (E0), so the cell can never be placed; without killing it, shelter cannot work here. At 8 hp 7-10 of 10 died.\n- Zombie 3 or 8 away in a tunnel: 10/10 sealed at 20 hp and at 8 hp, closed and open-both alike, zero hp lost; the first placement lands at tick 1-4 and the zombie never reaches the bot.\n- Flat SEAL-FAR (8 away) is a coin-flip race: 8/10 here (the unsealed ones are one ghost-zombie fixture artifact and one real loss at adj@68).\n- Fixture artifacts found (both fixed in the test): (1) a killed zombie stays in bot.entities for ~1-2 s and `nearestEntity` returned it as the adjacent zombie of the next trial; (2) the bot\'s chunk view lags behind /fill, so wall cells were seen stale (column `stale=` / "runs with stale view"; the test now waits until the bot\'s view matches `/execute if block`). The earlier "SEAL-FAR 0/10 and 6/10" swings and the first run of this task (9/10) came from these. The FIGHT rows changed after the ghost wait (0-1/10 "ok_but_zombie_alive"): the old 3-6/10 wins probably counted ghost zombies vanishing from bot.entities as kills, and the fight win check is not trustworthy; unverified.\n- Once sealed, the test kills the zombie to skip the 30 s wait, so hp lost and ticks are up to the seal.\n'

const PLAN_MARK = '\n## Planner decision scenarios'

// Real planner loop (observe -> nextAction -> runSkill), tunnel, one zombie. Survived = not dead; sealed = the cell closed at some tick; dug out = the cell opened again with the zombie alive; first = first planner action.
function planSection() {
  const lines = planRows.map(r => `| ${r.name} | ${r.n} | ${r.survived}/${r.n} | ${r.sealed}/${r.n} | ${r.ticks} | ${r.hpLost} | ${r.dugOut} | ${r.killed} | ${r.first} |`)
  return `${PLAN_MARK} (earlySeal off vs on)\n\nEnds at zombie dead, death, 35 s after the seal closed (off digs out at 30 s, on holds up to 90 s) or 75 s. Start hp is set with hunger drained (no regen), no food carried; 16 cobblestone + iron pickaxe.\n\n| scenario | n | survived | sealed | mean ticks to seal | mean hp lost | dug out | zombie killed | first action |\n|---|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n`
}

test('report', () => {
  if (!rows.length && planRows.length) { // only some planner scenarios ran: keep the baseline and the other planner rows, replace the rows that ran
    const [base, old = ''] = fs.readFileSync(OUT, 'utf8').split(PLAN_MARK)
    const ran = new Set(planRows.map(r => r.name))
    const kept = old.split('\n').filter(l => l.startsWith('| PLAN') && !ran.has(l.split(' | ')[0].slice(2)))
    const fresh = planSection().split('\n')
    const at = fresh.findIndex(l => l.startsWith('|---'))
    fs.writeFileSync(OUT, base + [...fresh.slice(0, at + 1), ...kept, ...fresh.slice(at + 1)].join('\n'))
    return
  }
  const lines = ['| scenario | n | win/seal | start hp | mean hp lost | mean ticks | deaths | reasons | held |', '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.name} | ${r.n} | ${r.wins}/${r.n} | ${r.startHp} | ${r.hpLost} | ${r.ticks} | ${r.deaths} | ${r.reasons} | ${r.held} |`)]
  const md = `# Combat baseline (existing shelter/fight skills)\n\nSEAL ticks = ticks to first sealed state (else whole skill). Seal win = sealed at some tick and not dead. Fight win = ok, zombie dead or despawned, not dead.\n${notes.join('; ')}\n\n${lines.join('\n')}\n${diagnosis()}${FINDINGS}${planRows.length ? planSection() : ''}`
  console.log('\n' + md)
  fs.writeFileSync(OUT, md)
  assert.ok(rows.length > 0)
})
