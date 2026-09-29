const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/eval.js'))
const { groundY, readDifficulty } = req('./eval.js')

const solid = (name) => ({ name, boundingBox: 'block' })
const empty = (name) => ({ name, boundingBox: 'empty' })

// column: y -> block; everything above the highest entry is air.
const column = (blocks) => (x, y) => blocks[y] ?? (y > 64 ? empty('air') : null)

test('groundY: finds the ground under a tree canopy', () => {
  const blockAt = column({ 70: empty('air'), 69: solid('oak_leaves'), 68: solid('oak_leaves'), 67: solid('oak_log'), 66: empty('vine'),
    65: empty('snow'), 64: solid('grass_block') })
  assert.strictEqual(groundY(blockAt, 0, 0, 70), 64)
})

test('groundY: skips liquid, non-full blocks and snow layers', () => {
  const blockAt = column({ 66: empty('water'), 65: { name: 'snow', boundingBox: 'block' }, 64: empty('short_grass'), 63: solid('dirt') })
  assert.strictEqual(groundY(blockAt, 0, 0, 66), 63)
})

test('groundY: throws on an unloaded chunk and on a column with no ground', () => {
  assert.throws(() => groundY(() => null, 0, 0, 70), /not loaded/)
  assert.throws(() => groundY(() => empty('air'), 0, 0, 70), /no ground/)
})

test('readDifficulty: reads the properties file', () => {
  assert.strictEqual(readDifficulty('a=b\ndifficulty=hard\nx=y'), 'hard')
  assert.strictEqual(readDifficulty('a=b'), undefined)
})
