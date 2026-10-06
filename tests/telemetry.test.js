const { test } = require('node:test')
const assert = require('node:assert')
const T = require('../bot/telemetry.js')
const { escalate, finish } = require('../bot/agent.js')
const { newHistory } = require('../bot/longrun.js')
const { DEFAULT_PARAMS } = require('../bot/planner.js')

const pos = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z) } })
const pick = (name, used = 0, max = 100, enchants = []) => ({ name, durabilityUsed: used, maxDurability: max, enchants })

test('telemetryOn is only true for the explicit param', () => {
  assert.strictEqual(T.telemetryOn({}), false)
  assert.strictEqual(T.telemetryOn({ objectiveRun: { params: {} } }), false)
  assert.strictEqual(T.telemetryOn({ objectiveRun: { params: { telemetry: true } } }), true)
})

test('off: the param key is absent and the row has no telemetry field', () => {
  assert.ok(!('telemetry' in DEFAULT_PARAMS))
  const run = { deposited: 0, deaths: 0, decisions: 0, params: {}, recoveries: [] }
  assert.ok(!('telemetry' in finish(run, 'done')))
})

test('damageFields: amount, attacker with distance and relative position, health and food after', () => {
  const mob = { id: 7, type: 'hostile', name: 'zombie', position: pos(3, 0, 4) }
  const f = T.damageFields({ now: 5, tick: 9, lost: 2, mob, pos: pos(0, 0, 0), health: 12, food: 18 })
  assert.deepStrictEqual(f, { t: 5, tick: 9, amount: 2, attacker: { id: 7, type: 'hostile', name: 'zombie', dist: 5, rel: [3, 0, 4] }, healthAfter: 12, foodAfter: 18 })
  assert.ok(!('attacker' in T.damageFields({ now: 5, tick: 9, lost: 2, mob: null, pos: pos(0, 0, 0), health: 12, food: 18 })))
})

test('itemInfo and pickList: enchants normalised, only pickaxes listed, null for no item', () => {
  const registry = { enchantments: { 5: { name: 'fortune' } } }
  const raw = { name: 'diamond_pickaxe', durabilityUsed: 4, maxDurability: 1561, enchants: { enchantments: [{ id: 5, level: 2 }] } }
  assert.deepStrictEqual(T.itemInfo(raw, registry), { name: 'diamond_pickaxe', enchants: [{ name: 'fortune', lvl: 2 }], durabilityUsed: 4, maxDurability: 1561 })
  assert.strictEqual(T.itemInfo(null, registry), null)
  assert.deepStrictEqual(T.pickList([raw, { name: 'stick' }], registry).map(p => p.name), ['diamond_pickaxe'])
})

test('occupant: finds a non-self entity inside the cell, else null', () => {
  const entities = { 1: { id: 1, type: 'player', position: pos(0.5, 64, 0.5), height: 1.8 }, 2: { id: 2, type: 'hostile', name: 'zombie', position: pos(3.5, 64, 3.5), height: 1.95 } }
  assert.deepStrictEqual(T.occupant(entities, { x: 3, y: 65, z: 3 }, 1), { type: 'hostile', id: 2, name: 'zombie' })
  assert.strictEqual(T.occupant(entities, { x: 0, y: 64, z: 0 }, 1), null)
  assert.strictEqual(T.occupant(entities, { x: 3, y: 67, z: 3 }, 1), null)
})

test('noteSealFail is pure and capped', () => {
  const first = []
  const next = T.noteSealFail(first, { cell: { x: 1, y: 2, z: 3 }, error: 'e', occupied: null, sealedCount: 4, ticks: 10 })
  assert.deepStrictEqual(first, [])
  assert.deepStrictEqual(next, [{ cell: [1, 2, 3], error: 'e', occupant: null, sealedCount: 4, ticks: 10 }])
  const full = Array.from({ length: T.SEAL_FAILS_MAX }, () => ({}))
  assert.strictEqual(T.noteSealFail(full, { cell: { x: 0, y: 0, z: 0 } }), full)
})

test('lostPicks: reports the missing pickaxe with its last durability and a cause', () => {
  const before = [pick('iron_pickaxe', 10, 250), pick('stone_pickaxe', 0, 131)]
  const after = [pick('stone_pickaxe')]
  assert.deepStrictEqual(T.lostPicks(before, after, { iron_pickaxe: 249 }, 'mine'), [{ name: 'iron_pickaxe', durabilityUsed: 249, maxDurability: 250, cause: 'worn_out' }])
  assert.strictEqual(T.lostPicks(before, after, {}, 'toss')[0].cause, 'toss')
  assert.strictEqual(T.lostPicks(before, after, {}, 'fight')[0].cause, 'unknown')
  assert.deepStrictEqual(T.lostPicks(before, before, {}, 'mine'), [])
})

test('pushRecent keeps the last 5 skills', () => {
  const recent = []
  for (let i = 0; i < 8; i++) T.pushRecent(recent, { skill: `s${i}` }, { ok: i % 2 === 0 }, i)
  assert.deepStrictEqual(recent.map(r => r.skill), ['s3', 's4', 's5', 's6', 's7'])
  assert.strictEqual(recent[0].reason, null)
})

test('escalate with telemetry adds a stuck row (last skills, pickaxes); finish carries it; without telemetry nothing is added', async () => {
  const bot = { inventory: { items: () => [{ name: 'iron_pickaxe', durabilityUsed: 3, maxDurability: 250, enchants: [] }] }, registry: {}, entity: { position: { x: 0, y: 70, z: 0 } } }
  const make = (telemetry) => ({ longrun: { history: newHistory() }, memory: {}, params: {}, stuckSnapshot: () => ({ pos: { x: 0, y: 70, z: 0 }, inv: 'a' }), deposited: 0, deaths: 0, decisions: 0, recoveries: [], ...(telemetry && { telemetry: { recent: [{ skill: 'mine', ok: false, reason: 'no_tool' }], stuck: [] } }) })
  const on = make(true)
  await escalate(bot, on, { skill: 'mine' }, { ok: false }, async () => ({ ok: true }))
  assert.strictEqual(on.telemetry.stuck.length, 1)
  assert.strictEqual(on.telemetry.stuck[0].level, 1)
  assert.deepStrictEqual(on.telemetry.stuck[0].recent[0].skill, 'mine')
  assert.strictEqual(on.telemetry.stuck[0].pickaxes[0].name, 'iron_pickaxe')
  assert.strictEqual(finish(on, 'stuck').telemetry.stuck.length, 1)
  const off = make(false)
  await escalate(bot, off, { skill: 'mine' }, { ok: false }, async () => ({ ok: true }))
  assert.ok(!('telemetry' in off) && !('telemetry' in finish(off, 'stuck')))
})

// ---- runSkill: off/on and failure paths ----
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('../bot/node_modules/vec3')
const { runSkill } = require('../bot/skills.js')

// Flat stone world (floor y=9, feet y=10). placeError: what placeBlock throws (symbol NONE = places fine).
const NONE = Symbol('none')
function skillBot({ on, placeError = NONE, hostile = null, heldItem } = {}) {
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tele-')), 'skills.jsonl')
  const placed = new Set()
  const solid = (p) => p.y < 10 || placed.has(`${p.x},${p.y},${p.z}`)
  const slotListeners = new Set()
  const bot = Object.assign(new EventEmitter(), {
    username: 'Bot', skillLogPath: logPath, health: 20, food: 20, time: { timeOfDay: 6000 }, entities: {},
    objectiveRun: on === undefined ? undefined : { params: { telemetry: on } },
    entity: { id: 1, position: new Vec3(0.5, 10, 0.5) },
    registry: { items: {}, enchantments: {} },
    heldItem,
    inventory: {
      items: () => [{ name: 'cobblestone', count: 12, type: 1 }, { name: 'iron_pickaxe', count: 1, durabilityUsed: 3, maxDurability: 250, enchants: [] }],
      on: (_e, fn) => slotListeners.add(fn),
      off: (_e, fn) => slotListeners.delete(fn),
    },
    blockAt: (p) => ({ name: solid(p) ? 'stone' : 'air', position: p, diggable: true, boundingBox: solid(p) ? 'block' : 'empty' }),
    equip: async () => {},
    placeBlock: async (ref, face) => {
      if (placeError !== NONE) throw placeError
      placed.add(`${ref.position.x + face.x},${ref.position.y + face.y},${ref.position.z + face.z}`)
    },
    dig: async () => {}, digTime: () => 0, stopDigging() {}, waitForTicks: async () => {}, clearControlStates() {},
    pathfinder: { bestHarvestTool: () => null, setGoal() {} },
    nearestEntity: (match) => [hostile].filter(Boolean).find(match) ?? null,
  })
  bot.listeners_ = slotListeners
  return bot
}
const readLog = (bot) => fs.readFileSync(bot.skillLogPath, 'utf8').trim().split('\n').map(l => JSON.parse(l))
const hit = (bot) => { bot.health -= 2; bot.emit('health') }
const TELE_KEYS = ['telemetry', 'tick', 'attacker', 'hostileDist', 'healthAfter', 'foodAfter', 'amount', 'sealFails']
const hasKey = (obj, k) => JSON.stringify(obj).includes(`"${k}"`)

async function equipWithHit(bot) {
  const pending = runSkill(bot, 'equip', 'stick')
  hit(bot)
  const result = await pending
  return { result, line: readLog(bot)[0] }
}

test('runSkill off: the log entry, damage entries and result carry no telemetry keys', async () => {
  for (const on of [undefined, false]) {
    const { result, line } = await equipWithHit(skillBot({ on }))
    assert.strictEqual(line.damage.length, 1)
    for (const k of TELE_KEYS) assert.ok(!hasKey({ result, line }, k), `leaked ${k}`)
  }
})

test('runSkill on: the log entry and damage entries carry telemetry keys', async () => {
  const hostile = { id: 9, type: 'hostile', name: 'zombie', position: new Vec3(1.5, 10, 0.5) }
  const { result, line } = await equipWithHit(skillBot({ on: true, hostile }))
  const d = line.damage[0]
  assert.strictEqual(d.amount, 2)
  assert.strictEqual(typeof d.tick, 'number')
  assert.strictEqual(d.attacker.name, 'zombie')
  assert.strictEqual(d.healthAfter, 18)
  assert.ok(!hasKey(result, 'amount'))
})

test('runSkill on: a skill that loses nothing and mines nothing still logs fine and cleans up', async () => {
  const bot = skillBot({ on: true })
  await runSkill(bot, 'equip', 'stick')
  assert.strictEqual(bot.skillTele, null)
  assert.strictEqual(bot.listeners_.size, 0)
})

test('runSkill on: shelter records hostileDist, startHealth, startFood', async () => {
  const hostile = { id: 9, type: 'hostile', name: 'zombie', position: new Vec3(20.5, 10, 0.5), height: 1.9 }
  const bot = skillBot({ on: true, hostile })
  await runSkill(bot, 'shelter', 0, 'threat')
  const [line] = readLog(bot)
  assert.strictEqual(line.telemetry.hostileDist, 20)
  assert.strictEqual(line.telemetry.startHealth, 20)
  assert.strictEqual(line.telemetry.startFood, 20)
})

test('shelter with a non-Error placement throw: on records sealFails, off behaves the same and leaks nothing', async () => {
  const run1 = async (on) => {
    const bot = skillBot({ on, placeError: undefined })
    const result = await runSkill(bot, 'shelter', 0, 'threat')
    return { result, line: readLog(bot)[0] }
  }
  const off = await run1(false)
  const on = await run1(true)
  assert.ok(!hasKey(off.line, 'sealFails') && !hasKey(off.line, 'telemetry'))
  assert.notStrictEqual(off.result.reason, 'error', `off path raised ${off.result.detail}`)
  assert.deepStrictEqual({ ...off.result, ticks: 0 }, { ...on.result, ticks: 0 })
  assert.ok(on.line.telemetry.sealFails.length > 0)
  assert.ok(on.line.telemetry.sealFails.every(f => f.error === undefined || typeof f.error === 'string'))
})

test('runSkill on: a broken heldItem/registry does not throw and does not change the result', async () => {
  const good = await equipWithHit(skillBot({ on: true }))
  const broken = skillBot({ on: true })
  Object.defineProperty(broken, 'heldItem', { get() { throw new Error('boom') } })
  const bad = await equipWithHit(broken)
  assert.deepStrictEqual(bad.result, good.result)
  assert.ok(!broken.skillTele)
  assert.strictEqual(broken.listeners_.size, 0)
})

test('runSkill on: a throw in endTelemetry still clears bot.skillTele and the listener', async () => {
  const bot = skillBot({ on: true })
  const items = bot.inventory.items
  let calls = 0
  bot.inventory.items = () => { if (++calls === 3) throw new Error('late boom'); return items() }
  const result = await runSkill(bot, 'equip', 'stick')
  assert.strictEqual(typeof result.ok, 'boolean')
  assert.strictEqual(bot.skillTele, null)
  assert.strictEqual(bot.listeners_.size, 0)
  assert.strictEqual(readLog(bot).length, 1)
})

test('runSkill on: attacker() throwing inside the health handler keeps the damage entry', async () => {
  const bot = skillBot({ on: true })
  let calls = 0
  bot.nearestEntity = () => { if (++calls === 2) throw new Error('boom'); return null }
  const { line } = await equipWithHit(bot)
  assert.strictEqual(line.damage.length, 1)
  assert.strictEqual(line.damage[0].hp, 18)
})

test('safe: returns the value, or the fallback when fn throws', () => {
  assert.strictEqual(T.safe(() => 5), 5)
  assert.strictEqual(T.safe(() => { throw undefined }, 'x'), 'x')
  assert.strictEqual(T.safe(() => { throw new Error('e') }), null)
})

test('runSkill: a shelter with until=early logs early:true and the reason in telemetry only when TELEMETRY is on', async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const { runSkill } = require('../bot/skills.js')
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'early-')), 'skills.jsonl')
  const bot = (on) => ({
    username: 'b', skillLogPath: logPath, health: 20, food: 20, time: { timeOfDay: 6000 }, heldItem: null, registry: { foodsByName: {} },
    objectiveRun: { params: { telemetry: on } }, entity: { position: { x: 0, y: 10, z: 0 } },
    inventory: { items: () => [], on() {}, off() {} }, pathfinder: { setGoal() {} }, clearControlStates() {}, on() {}, off() {}, nearestEntity: () => null,
  })
  await runSkill(bot(true), 'shelter', 0, 'early', 'crowd') // no blocks: falls back to flee, which has nothing to flee
  await runSkill(bot(false), 'shelter', 0, 'early', 'crowd')
  const [on, off] = fs.readFileSync(logPath, 'utf8').trim().split(String.fromCharCode(10)).map(l => JSON.parse(l))
  assert.deepStrictEqual([on.telemetry.early, on.telemetry.earlyReason], [true, 'crowd'])
  assert.strictEqual(off.telemetry, undefined)
})
