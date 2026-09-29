const { test } = require('node:test')
const assert = require('node:assert')
const { spiral } = require('../bot/pregen.js')

test('test_slot_spiral', () => {
  const it = spiral()
  const points = Array.from({ length: 1000 }, () => it.next().value)
  assert.deepStrictEqual(points.slice(0, 9), [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]])
  assert.strictEqual(new Set(points.map(String)).size, 1000)
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]]
    assert.strictEqual(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1)
  }
})
