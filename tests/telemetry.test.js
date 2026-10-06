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
