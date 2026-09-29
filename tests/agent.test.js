const { test } = require('node:test')
const assert = require('node:assert')
const { createStuckTracker } = require('../bot/agent.js')

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
