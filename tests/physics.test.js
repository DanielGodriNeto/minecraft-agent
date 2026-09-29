const { test } = require('node:test')
const assert = require('node:assert')
const { nudgeOffEdges } = require('../bot/physicsfix.js')

test('test_nudge_off_block_edges', () => {
  const pressed = { x: 0.7000000000000001, y: 87, z: 7168.54 }
  nudgeOffEdges(pressed, 0.3)
  assert.ok(pressed.x + 0.3 < 1, `hitbox still inside the block: ${pressed.x + 0.3}`)
  assert.ok(Math.abs(pressed.x - 0.7) < 1e-5)
  const negative = { x: -3.6999999999999997, y: 64, z: 2.3000000000000003 }
  nudgeOffEdges(negative, 0.3)
  assert.ok(negative.x - 0.3 > -4 && negative.z - 0.3 > 2)
  const free = { x: 5.5, y: 64, z: -2.25 }
  nudgeOffEdges(free, 0.3)
  assert.deepStrictEqual(free, { x: 5.5, y: 64, z: -2.25 })
})
