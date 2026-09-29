const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/eval.js'))
const { groundY, readDifficulty, assertSpawnSet, clearStandCommand, distribute, chunk, parseInstances } = req('./eval.js')
const { instanceSpec, maxInstances, assertDiskSpace, withPort } = req('./server.js')

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

test('assertSpawnSet: only the success reply passes', () => {
  assert.doesNotThrow(() => assertSpawnSet('[12:00:00 INFO]: Set spawn point to 1, 64, 2 [0.0] in minecraft:overworld for Bot0'))
  assert.throws(() => assertSpawnSet('[12:00:00 INFO]: No player was found'), /spawnpoint failed/)
})

test('clearStandCommand: clears the stand cell and the two above it', () => {
  assert.strictEqual(clearStandCommand({ x: 10, y: 64, z: -3 }), 'fill 10 64 -3 10 66 -3 air')
})

test('chunk + distribute: batches go round-robin to the workers, none lost', () => {
  const batches = chunk([1, 2, 3, 4, 5, 6, 7], 2)
  assert.deepStrictEqual(batches, [[1, 2], [3, 4], [5, 6], [7]])
  assert.deepStrictEqual(distribute(batches, 2), [[[1, 2], [5, 6]], [[3, 4], [7]]])
  assert.deepStrictEqual(distribute(batches, 1), [batches])
  assert.deepStrictEqual(distribute([], 2), [[], []])
})

test('instanceSpec: one instance keeps server/ on 25565, several get run-<n> and their own port', () => {
  const one = instanceSpec(0, 1)
  assert.strictEqual(one.port, 25565)
  assert.strictEqual(path.basename(one.dir), 'server')
  const [a, b] = [instanceSpec(0, 3), instanceSpec(1, 3)]
  assert.deepStrictEqual([a.port, b.port], [25566, 25567])
  assert.strictEqual(path.basename(a.dir), 'run-1')
  assert.strictEqual(path.basename(b.dir), 'run-2')
})

test('maxInstances / parseInstances: capped by RAM and the 24 GB heap budget', () => {
  assert.strictEqual(maxInstances(32), 4)
  assert.strictEqual(maxInstances(64), 4)
  assert.strictEqual(maxInstances(16), 1)
  assert.strictEqual(maxInstances(4), 1)
  assert.strictEqual(parseInstances('3', 32), 3)
  assert.throws(() => parseInstances('5', 32), /at most 4/)
  assert.throws(() => parseInstances('0', 32), /positive integer/)
  assert.throws(() => parseInstances('x', 32), /positive integer/)
})

test('assertDiskSpace: passes with margin, fails with a clear message otherwise', () => {
  const GB = 2 ** 30
  assert.doesNotThrow(() => assertDiskSpace(30 * GB, 14 * GB, 'x'))
  assert.throws(() => assertDiskSpace(20 * GB, 14 * GB, 'restoring w'), /not enough disk for restoring w: need 24\.0 GB.*free 20\.0 GB/)
})

test('withPort: overrides server and query ports only', () => {
  assert.strictEqual(withPort('a=1\nserver-port=25565\nquery.port=25565\nrcon.port=25575\n', 25567),
    'a=1\nserver-port=25567\nquery.port=25567\nrcon.port=25575\n')
})
