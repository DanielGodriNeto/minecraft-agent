// Observational live test (needs the flat-world dev server): can the existing shelter/fight skills handle an adjacent zombie?
// It reports a table (and writes analysis/measure/combat_baseline.md); assertions are sanity checks only.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { connect, CENTER } = require('./harness.js')
const { runSkill, sealed } = require('../bot/skills.js')

const RUNS = 10
const OUT = path.join(__dirname, '../analysis/measure/combat_baseline.md')
const rows = []
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

// One trial: fixture, then the skill while counting physics ticks, min hp and the first tick the cell is sealed.
async function trial({ items, hp = 20, zombieDx, skill, args = [] }) {
  await h.poll(() => h.bot.health > 0) // respawned after a death
  await h.reset()
  for (const [item, n] of items) await h.give(item, n)
  await setHealth(hp)
  await h.cmd(`/summon zombie ${CENTER.x + 0.5 + zombieDx} ${CENTER.y} ${CENTER.z + 0.5} {PersistenceRequired:1b}`)
  await h.poll(() => h.bot.nearestEntity(e => e.name === 'zombie'))
  const zombie = h.bot.nearestEntity(e => e.name === 'zombie')
  const bot = h.bot
  const feet = bot.entity.position.floored()
  const t = { startHp: bot.health, minHp: bot.health, ticks: 0, sealedTick: null, sealedHp: null, died: false }
  const onTick = () => {
    t.ticks++
    if (t.sealedTick === null && sealed(bot, feet)) { t.sealedTick = t.ticks; t.sealedHp = bot.health }
  }
  const onHealth = () => { t.minHp = Math.min(t.minHp, bot.health) }
  const onDeath = () => { t.died = true }
  bot.on('physicsTick', onTick); bot.on('health', onHealth); bot.on('death', onDeath)
  const res = await runSkill(bot, skill, ...args)
  bot.off('physicsTick', onTick); bot.off('health', onHealth); bot.off('death', onDeath)
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
  assert.strictEqual(rs.length, RUNS)
}

const sealWin = (r) => r.sealedTick !== null && !r.died
const fightWin = (r) => r.res.ok && !r.zombieAlive && !r.died
const COBBLE = [['cobblestone', 16], ['iron_pickaxe', 1]] // the pickaxe lets the bot dig out afterwards, as in a real run

test('SEAL-ADJ', () => scenario('SEAL-ADJ (20hp, zombie 1 away)', { items: COBBLE, zombieDx: 1, skill: 'shelter', args: [0, 'threat'] }, sealWin))
test('SEAL-ADJ-LOW', () => scenario('SEAL-ADJ-LOW (8hp, zombie 1 away)', { items: COBBLE, hp: 8, zombieDx: 1, skill: 'shelter', args: [0, 'threat'] }, sealWin))
test('SEAL-FAR', () => scenario('SEAL-FAR (20hp, zombie 8 away)', { items: COBBLE, zombieDx: 8, skill: 'shelter', args: [0, 'threat'] }, sealWin))
test('FIGHT-1 pickaxe only', () => scenario('FIGHT-1 iron_pickaxe', { items: [['iron_pickaxe', 1]], zombieDx: 2, skill: 'fight' }, fightWin))
test('FIGHT-1 stone sword', () => scenario('FIGHT-1 stone_sword', { items: [['iron_pickaxe', 1], ['stone_sword', 1]], zombieDx: 2, skill: 'fight' }, fightWin))
test('FIGHT-1 iron sword', () => scenario('FIGHT-1 iron_sword', { items: [['iron_pickaxe', 1], ['iron_sword', 1]], zombieDx: 2, skill: 'fight' }, fightWin))

test('report', () => {
  const lines = ['| scenario | n | win/seal | start hp | mean hp lost | mean ticks | deaths | reasons | held |', '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.name} | ${r.n} | ${r.wins}/${r.n} | ${r.startHp} | ${r.hpLost} | ${r.ticks} | ${r.deaths} | ${r.reasons} | ${r.held} |`)]
  const md = `# Combat baseline (existing shelter/fight skills)\n\nSEAL ticks = ticks to first sealed state (else whole skill). Seal win = sealed at some tick and not dead. Fight win = ok, zombie dead or despawned, not dead.\n${notes.join('; ')}\n\n${lines.join('\n')}\n`
  console.log('\n' + md)
  fs.writeFileSync(OUT, md)
  assert.ok(rows.length > 0)
})
