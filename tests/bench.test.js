const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/bench.js'))
const { parseTps, cpuPercent, evaluate, recommend, parseCounts, median } = req('./bench.js')

test('parseTps reads the 1m value from plain, coloured and capped lines', () => {
  assert.strictEqual(parseTps('[12:00:00 INFO]: TPS from last 1m, 5m, 15m: 19.8, 20.0, 20.0'), 19.8)
  assert.strictEqual(parseTps('[12:00:00 INFO]: TPS from last 1m, 5m, 15m: *20.0, *20.0, *20.0'), 20)
  assert.strictEqual(parseTps('[12:00:00 INFO]: §6TPS from last 1m, 5m, 15m: §a*20.0§6, §a20.0'), 20)
  assert.strictEqual(parseTps('\u001b[33mTPS from last 1m, 5m, 15m: \u001b[32m17.25\u001b[m, 20.0, 20.0'), 17.25)
})

test('parseTps returns null for other lines', () => {
  assert.strictEqual(parseTps('[12:00:00 INFO]: Done (3.2s)!'), null)
  assert.strictEqual(parseTps('TPS from last 1m, 5m, 15m: n/a'), null)
})

test('cpuPercent is busy share of the delta, 0 without elapsed time', () => {
  assert.strictEqual(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 300 }), 50)
  assert.strictEqual(cpuPercent({ idle: 1, total: 2 }, { idle: 1, total: 2 }), 0)
})

test('median handles odd and even lengths', () => {
  assert.strictEqual(median([3, 1, 2]), 2)
  assert.strictEqual(median([4, 1, 3, 2]), 2.5)
})

const sample = (t, tps, cpu) => ({ t, tps, cpu, rssMb: 100 })

test('evaluate skips warmup and passes on healthy steady state', () => {
  const row = evaluate(8, 8, [sample(30, 5, 99), sample(60, 20, 60), sample(90, 19.5, 70)])
  assert.deepStrictEqual([row.samples, row.tpsMin, row.cpuMedian, row.cpuMax, row.pass], [2, 19.5, 65, 70, true])
})

test('evaluate fails on a TPS dip or high median CPU', () => {
  assert.strictEqual(evaluate(8, 8, [sample(60, 20, 60), sample(90, 18.9, 60)]).pass, false)
  assert.strictEqual(evaluate(8, 8, [sample(60, 20, 90), sample(90, 20, 88)]).pass, false)
})

test('evaluate rejects runs with no post-warmup samples', () => {
  assert.throws(() => evaluate(8, 8, [sample(30, 20, 10)]), /no samples/)
})

test('recommend picks the largest passing count', () => {
  assert.strictEqual(recommend([{ bots: 4, pass: true }, { bots: 12, pass: true }, { bots: 8, pass: false }]), 12)
  assert.strictEqual(recommend([{ bots: 4, pass: false }]), null)
})

test('parseCounts enforces the whitelist size', () => {
  assert.deepStrictEqual(parseCounts('4,8,16'), [4, 8, 16])
  assert.throws(() => parseCounts('4,17'))
  assert.throws(() => parseCounts('x'))
})
