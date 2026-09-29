const { test } = require('node:test')
const assert = require('node:assert')
const { createStuckTracker, pickLeft } = require('../bot/agent.js')

const ok = { ok: true }
const fail = { ok: false, reason: 'timeout' }
const snap = (x, inv = '{}') => ({ pos: { x, y: 70, z: 0 }, inv })

test('stuck: three failures in place trip the tracker, a success resets it', () => {
  const track = createStuckTracker()
  assert.deepStrictEqual([track(fail, snap(0)), track(fail, snap(0)), track(fail, snap(0))], [false, false, true])
  const again = createStuckTracker()
  again(fail, snap(0)); again(fail, snap(0))
  assert.strictEqual(again(ok, snap(0)), false)
  assert.strictEqual(again(fail, snap(0)), false)
})

test('stuck: twelve failures while moving and looting is still stuck', () => {
  const track = createStuckTracker()
  const results = Array.from({ length: 12 }, (_, i) => track(fail, snap(i * 10, JSON.stringify({ n: i }))))
  assert.deepStrictEqual([results[10], results[11]], [false, true])
})

test('stuck: oscillation with occasional successes but no net progress', () => {
  const track = createStuckTracker()
  const results = Array.from({ length: 12 }, (_, i) => track(i % 2 ? ok : fail, snap(i % 4 < 2 ? 0 : 3)))
  assert.deepStrictEqual([results[10], results[11]], [false, true])
})

test('stuck: real progress or inventory changes are not stuck', () => {
  const walking = createStuckTracker()
  assert.ok(Array.from({ length: 24 }, (_, i) => walking(ok, snap(i * 8))).every(r => !r))
  const looting = createStuckTracker()
  assert.ok(Array.from({ length: 24 }, (_, i) => looting(ok, snap(0, JSON.stringify({ n: i })))).every(r => !r))
})

test('pickLeft: wear of the cheapest pickaxe that can dig stone, 0 without one', () => {
  const tool = (name, type, used) => ({ name, type, maxDurability: 250, durabilityUsed: used })
  const bot = (...items) => ({
    inventory: { items: () => items },
    registry: { blocksByName: { stone: { harvestTools: { 1: true, 2: true, 3: true } } } },
  })
  const all = [tool('iron_pickaxe', 3, 10), tool('stone_pickaxe', 2, 200), tool('wooden_pickaxe', 1, 50)]
  assert.strictEqual(pickLeft(bot(...all)), 200)
  assert.strictEqual(pickLeft(bot(all[0], all[1])), 50)
  assert.strictEqual(pickLeft(bot(all[0])), 240)
  assert.strictEqual(pickLeft(bot({ name: 'stick', type: 9 })), 0)
})
