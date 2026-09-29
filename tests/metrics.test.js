const { test } = require('node:test')
const assert = require('node:assert')
const { summarize } = require('../bot/metrics.js')

const run = (deposited, extra = {}) => ({ slot: 0, reason: 'timeout', deposited, deaths: 0, minutes: 60, ...extra })

test('test_metrics_summary', () => {
  const runs = [run(2), run(0, { reason: 'stuck', minutes: 30 }), run(1, { deaths: 1 }), run(0, { deaths: 3, reason: 'deaths', minutes: 30 })]
  const m = summarize(runs)
  assert.strictEqual(m.runs, 4)
  assert.strictEqual(m.successRate, 0.5)
  assert.strictEqual(m.diamondsPerHour, 1) // 3 diamonds over 3 hours
  assert.strictEqual(m.deathsPerHour, 4 / 3)
  assert.strictEqual(m.stuckRate, 0.25)
  assert.ok(m.successCI[0] <= 0.5 && m.successCI[1] >= 0.5)
  assert.deepStrictEqual(summarize([run(1), run(3)]).successCI, [1, 1])
})

test('test_metrics_ci_narrows_with_more_runs', () => {
  const few = summarize(Array.from({ length: 10 }, (_, i) => run(i % 2)))
  const many = summarize(Array.from({ length: 400 }, (_, i) => run(i % 2)))
  assert.ok(many.successCI[1] - many.successCI[0] < few.successCI[1] - few.successCI[0])
  assert.deepStrictEqual(summarize(Array.from({ length: 10 }, (_, i) => run(i % 2))).successCI, few.successCI) // seeded
})
