const { test } = require('node:test')
const assert = require('node:assert')
const { stuckEscalation, newHistory, clearLoopMemory, fruitlessDeaths, DEATH_LIMIT, armorPoints, gearSnapshot, longrunFields, MAX_ESCALATIONS, PROGRESS_MOVE } = require('../bot/longrun.js')
const { escalate, forceEscape, trackLongrun, finish, runObjective, resetLife, handleDeath } = require('../bot/agent.js')
const { EventEmitter } = require('node:events')
const { DEFAULT_PARAMS, normalizeParams } = require('../bot/planner.js')
const { summarize } = require('../bot/metrics.js')

const snap = (x = 0, inv = 'a', y = 70) => ({ pos: { x, y, z: 0 }, inv })
function repeat(n, make, history = newHistory()) {
  const steps = []
  for (let i = 0; i < n; i++) {
    const step = stuckEscalation(history, make(i))
    steps.push(step)
    history = step.history
  }
  return steps
}

test('stuckEscalation: levels advance 1, 2, 3 and stay at 3 while there is no progress', () => {
  const steps = repeat(MAX_ESCALATIONS, () => snap())
  assert.deepStrictEqual(steps.map(s => s.level), [1, 2, 3, 3, 3, 3])
  assert.deepStrictEqual(steps.at(-1).history.levels, { 1: 1, 2: 1, 3: 4 })
  assert.strictEqual(steps.at(-1).history.total, MAX_ESCALATIONS)
})

test('stuckEscalation: the escalation after K without progress ends the run', () => {
  const [last] = repeat(1, () => snap(), repeat(MAX_ESCALATIONS, () => snap()).at(-1).history)
  assert.strictEqual(last.end, true)
})

test('stuckEscalation: an inventory change or a move of PROGRESS_MOVE blocks resets the counter to level 1', () => {
  const base = repeat(3, () => snap()).at(-1).history
  assert.strictEqual(stuckEscalation(base, snap(0, 'b')).level, 1)
  assert.strictEqual(stuckEscalation(base, snap(PROGRESS_MOVE)).level, 1)
  assert.strictEqual(stuckEscalation(base, snap(PROGRESS_MOVE - 1)).level, 3)
})

test('stuckEscalation: progress now and then keeps a run alive indefinitely', () => {
  const steps = repeat(40, (i) => snap(0, `inv${Math.floor(i / 2)}`))
  assert.ok(steps.every(s => !s.end))
})

test('stuckEscalation: does not mutate the history it is given', () => {
  const h = newHistory()
  stuckEscalation(h, snap())
  assert.deepStrictEqual(h, newHistory())
})

test('clearLoopMemory: resets every life/trip field, keeps directions and the relocation budget', () => {
  const dirty = { ...resetLife({}), baseDir: 2, surfaceDir: 1, relocations: 4, digFails: 3, goUpFails: 2, goUpY: 60, homeTimeouts: 1, homePause: 5, branchMisses: 2, branchRelocs: 1, relocHazards: 2, failSigs: { s: 2 }, hazards: 2, optionalFails: { a: 2 }, recovered: { x: true }, nightDigs: 1 }
  clearLoopMemory(dirty, resetLife({}))
  assert.deepStrictEqual(dirty, { ...resetLife({}), baseDir: 2, surfaceDir: 1, relocations: 4 })
})

test('armorPoints: sums known pieces, ignores the rest', () => {
  assert.strictEqual(armorPoints(['iron_helmet', 'iron_chestplate', 'diamond_boots', 'elytra']), 2 + 6 + 3)
  assert.strictEqual(armorPoints([]), 0)
})

test('gearSnapshot: reads tiers, shield, bucket, bed, food and diamonds', () => {
  const g = gearSnapshot({ counts: { stone_pickaxe: 1, iron_pickaxe: 2, water_bucket: 1, red_bed: 1, diamond: 3 }, worn: ['iron_chestplate'], offhand: 'shield', minute: 15, foodCount: 7, deposited: 4 })
  assert.deepStrictEqual(g, { minute: 15, armorPoints: 6, bestPickaxeTier: 'iron', pickaxeCount: 3, hasShield: true, hasBucket: true, hasBed: true, foodCount: 7, diamondsCarried: 3, diamondsDeposited: 4 })
  assert.strictEqual(gearSnapshot({ counts: {}, worn: [], minute: 0, foodCount: 0, deposited: 0 }).bestPickaxeTier, null)
})

test('LONGRUN is off by default, an arm param turns it on, and an off run adds nothing to its result', () => {
  assert.ok(!DEFAULT_PARAMS.longrun)
  assert.strictEqual(normalizeParams({ longrun: 1 }).longrun, true)
  assert.deepStrictEqual(longrunFields({ params: { longrun: false } }), {})
  const row = finish({ deposited: 0, deaths: 0, decisions: 0, params: { longrun: false }, recoveries: [] }, 'stuck')
  assert.ok(!('longrun' in row) && !('gear' in row))
})

function fakeBot(y = 70, items = []) {
  return {
    entity: { position: { clone() { return { x: 0, y, z: 0 } }, y } },
    inventory: { items: () => items, slots: [] },
    registry: { foodsByName: { bread: {} } },
  }
}
const fakeRun = () => ({
  surfaceY: 64, deposited: 0, params: { longrun: true, recovery: false }, recoveries: [],
  memory: { ...resetLife({}), digFails: 3, baseDir: 0, surfaceDir: 0, leg: 2, recovered: {}, failSigs: {}, optionalFails: {} },
  longrun: { history: newHistory(), gear: [], deposits: [], startedAt: 0, nextGearMin: 15, deathLog: [], diamondsFound: 0, hopeless: false },
})

test('escalate: level 1 without an applicable routine clears memory; level 3 forces a surface escape above y=0', async () => {
  const calls = []
  const exec = async (_b, skill, arg) => { calls.push([skill, arg?.mode ?? arg]) }
  const run = fakeRun()
  const bot = fakeBot(70)
  const action = { skill: 'dig_down', args: [] }
  assert.strictEqual(await escalate(bot, run, action, { ok: false, reason: 'blocked' }, exec), true)
  assert.strictEqual(run.memory.digFails, 0)
  assert.deepStrictEqual(calls, [])
  await escalate(bot, run, action, { ok: false, reason: 'blocked' }, exec)
  await escalate(bot, run, action, { ok: false, reason: 'blocked' }, exec)
  assert.deepStrictEqual(calls, [['go_up', 64], ['explore', 'surface']])
  assert.strictEqual(run.memory.surfaceDir, 1)
  assert.deepStrictEqual(run.longrun.history.levels, { 1: 1, 2: 1, 3: 1 })
})

test('escalate: level 1 runs the recovery routine for the signature even with RECOVERY off', async () => {
  const calls = []
  const run = fakeRun()
  run.memory.failSigs = { 'explore:hazard': 2 }
  await escalate(fakeBot(), run, { skill: 'explore', args: [] }, { ok: false, reason: 'hazard' }, async (_b, skill, arg) => { calls.push([skill, arg]) })
  assert.deepStrictEqual(calls, [['recover', 'retreat']])
})

test('forceEscape underground: one 16-block tunnel hop in a new direction', async () => {
  const calls = []
  const run = fakeRun()
  await forceEscape(fakeBot(-50), run, async (_b, skill, arg) => { calls.push([skill, arg]) })
  assert.strictEqual(run.memory.baseDir, 1)
  assert.strictEqual(calls[0][1].mode, 'branch')
  assert.strictEqual(calls[0][1].maxBlocks, 16)
})

test('escalate: after K no-progress escalations the run ends as stuck', async () => {
  const run = fakeRun()
  const results = []
  for (let i = 0; i <= MAX_ESCALATIONS; i++) results.push(await escalate(fakeBot(-50), run, { skill: 'dig_down', args: [] }, { ok: false, reason: 'blocked' }, async () => {}))
  assert.deepStrictEqual(results, [...Array(MAX_ESCALATIONS).fill(true), false])
})

test('trackLongrun: logs deposits with their minute and a gear snapshot every 15 minutes', () => {
  const run = fakeRun()
  const bot = fakeBot(70, [{ name: 'bread', count: 4 }, { name: 'diamond', count: 2 }])
  trackLongrun(bot, run, 0, 5 * 60000)
  assert.strictEqual(run.longrun.gear.length, 0)
  trackLongrun(bot, run, 3, 16 * 60000)
  assert.deepStrictEqual(run.longrun.deposits, [{ minute: 16, count: 3 }])
  assert.strictEqual(run.longrun.gear.length, 1)
  assert.strictEqual(run.longrun.gear[0].foodCount, 4)
  assert.strictEqual(run.longrun.gear[0].diamondsCarried, 2)
  trackLongrun(bot, run, 0, 20 * 60000)
  assert.strictEqual(run.longrun.gear.length, 1)
  trackLongrun(bot, run, 0, 31 * 60000)
  assert.strictEqual(run.longrun.gear.length, 2)
})

test('summarize: diamondsBanked60to only appears with longrun rows and counts deposits from minute 60 on', () => {
  const plain = { deposited: 2, deaths: 0, reason: 'timeout', minutes: 60 }
  assert.ok(!('diamondsBanked60to' in summarize([plain])))
  const long = { ...plain, longrun: true, deposited: 5, minutes: 240, deposits: [{ minute: 30, count: 2 }, { minute: 60, count: 1 }, { minute: 200, count: 2 }] }
  const sum = summarize([plain, long, { ...long, minutes: 50 }])
  assert.strictEqual(sum.diamondsBanked60to, 3)
  assert.strictEqual(sum.diamondsBanked60toRuns, 1)
})

test('escalate: the 1-2-3-1-2-3 cycle on the surface ends the run, because the escape itself is not progress', async () => {
  const pos = { x: 0, y: 70, z: 0 }
  const bot = { entity: { position: { clone: () => ({ ...pos }), y: 70 } }, inventory: { items: () => [] }, registry: {} }
  const exec = async (_b, skill) => { if (skill === 'explore') pos.x += 64 }
  const run = fakeRun()
  const levels = []
  let alive = true
  for (let i = 0; i <= MAX_ESCALATIONS && alive; i++) {
    alive = await escalate(bot, run, { skill: 'dig_down', args: [] }, { ok: false, reason: 'blocked' }, exec)
    levels.push(run.longrun.history.count)
  }
  assert.strictEqual(alive, false)
  assert.strictEqual(levels.at(-1), MAX_ESCALATIONS + 1)
})

test('escalate: a change made by the escalation itself (recovery) is not progress; later movement is', async () => {
  const pos = { x: 0, y: 70, z: 0 }
  const bot = { entity: { position: { clone: () => ({ ...pos }), y: 70 } }, inventory: { items: () => [] }, registry: {} }
  const run = fakeRun()
  run.memory.failSigs = { 'explore:hazard': 2 }
  const hazard = { ok: false, reason: 'hazard' }
  await escalate(bot, run, { skill: 'explore', args: [] }, hazard, async () => { pos.x = 100 })
  assert.deepStrictEqual(run.longrun.history.last.pos, { x: 100, y: 70, z: 0 })
  await escalate(bot, run, { skill: 'dig_down', args: [] }, { ok: false, reason: 'blocked' }, async () => {})
  assert.strictEqual(run.longrun.history.count, 2)
  pos.x = 140
  await escalate(bot, run, { skill: 'dig_down', args: [] }, { ok: false, reason: 'blocked' }, async () => {})
  assert.strictEqual(run.longrun.history.count, 1)
})

test('fruitlessDeaths: DEATH_LIMIT deaths inside the window with nothing banked or found', () => {
  const log = (f) => Array.from({ length: DEATH_LIMIT }, (_, i) => ({ t: i * 60000, banked: 0, found: 0, ...f(i) }))
  assert.strictEqual(fruitlessDeaths(log(() => ({}))), true)
  assert.strictEqual(fruitlessDeaths(log(() => ({})).slice(1)), false)
  assert.strictEqual(fruitlessDeaths(log(i => ({ banked: i >= 5 ? 1 : 0 }))), false)
  assert.strictEqual(fruitlessDeaths(log(i => ({ found: i >= 3 ? 1 : 0 }))), false)
  assert.strictEqual(fruitlessDeaths(log(i => ({ t: i * 10 * 60000 }))), false)
})

// A fake bot and skill runner driving the real loop.
function loopBot() {
  const bot = new EventEmitter()
  const pos = { x: 0, y: 70, z: 0 }
  Object.assign(bot, {
    entity: { position: { clone: () => ({ ...pos }), y: 70 } }, health: 20, trail: [], pathfinder: { setGoal() {} }, clearControlStates() {},
    inventory: { items: () => [] }, registry: { foodsByName: {} }, pos,
  })
  return bot
}
const loopDeps = (bot, exec) => ({
  runSkill: exec,
  observe: () => ({ params: { longrun: true }, memory: {} }),
  nextAction: () => ({ skill: 'dig_down', args: [] }),
})
const loopRun = (bot, exec, extra = {}) => runObjective(bot, {
  objective: { item: 'diamond', count: 'max' }, home: { x: 0, y: 70, z: 0 }, params: { longrun: true }, deadline: Date.now() + 5000, deps: loopDeps(bot, exec), ...extra,
})
const blocked = { ok: false, reason: 'blocked' }

test('loop: LONGRUN repeated stuck ends as stuck only after the no-progress escalations', async () => {
  const bot = loopBot()
  let calls = 0
  const row = await loopRun(bot, async (_b, skill) => { if (skill === 'dig_down') calls++; return blocked })
  assert.strictEqual(row.reason, 'stuck')
  assert.strictEqual(row.stuckResets.count, MAX_ESCALATIONS)
  assert.ok(calls > MAX_ESCALATIONS)
})

test('loop: LONGRUN deaths do not end the run (beyond maxDeaths) and the stuck check skips the skill that died', async () => {
  const bot = loopBot()
  let n = 0
  let diamonds = 0
  bot.inventory.items = () => (diamonds ? [{ name: 'diamond', count: diamonds }] : [])
  const row = await loopRun(bot, async () => {
    n++
    diamonds++ // diamonds keep turning up, so these deaths are not fruitless
    bot.emit('death') // every skill call dies and fails: a stuck check on them would escalate
    return blocked
  }, { maxDeaths: 2, deadline: Date.now() + 200 })
  assert.strictEqual(row.reason, 'timeout')
  assert.ok(row.deaths > 2)
  assert.strictEqual(row.stuckResets.count, 0)
})

test('loop: LONGRUN ends as deaths after DEATH_LIMIT fruitless deaths', async () => {
  const bot = loopBot()
  const row = await loopRun(bot, async () => { bot.emit('death'); return { ok: true } })
  assert.strictEqual(row.reason, 'deaths')
  assert.strictEqual(row.deaths, DEATH_LIMIT)
})

test('loop: without LONGRUN, maxDeaths still ends the run', async () => {
  const bot = loopBot()
  const row = await loopRun(bot, async () => { bot.emit('death'); return { ok: true } }, { params: {}, maxDeaths: 2 })
  assert.strictEqual(row.reason, 'deaths')
  assert.strictEqual(row.deaths, 2)
})
