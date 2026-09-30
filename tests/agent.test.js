const { test } = require('node:test')
const assert = require('node:assert')
const { createStuckTracker, stuckTracker, pickLeft, remember, isLost, resetLife, resetTrip } = require('../bot/agent.js')

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

test('remember: failed optional crafts are counted per item, successes and required steps are not', () => {
  const run = { memory: { optionalFails: {} } }
  const spare = { skill: 'craft', args: ['stone_pickaxe', 1], optional: true }
  remember(run, spare, { ok: false })
  remember(run, spare, { ok: false })
  remember(run, spare, { ok: true })
  remember(run, { skill: 'craft', args: ['iron_pickaxe', 1] }, { ok: false })
  assert.deepStrictEqual(run.memory.optionalFails, { stone_pickaxe: 2 })
})

test('stuck: successful skills that neither move the bot a block nor change the inventory count as idle', () => {
  const track = createStuckTracker()
  const results = Array.from({ length: 6 }, (_, i) => track(ok, snap(i * 0.1)))
  assert.deepStrictEqual(results, [false, false, false, false, false, true])
})

test('stuck: an idle streak is broken by moving a block or by an inventory change', () => {
  const track = createStuckTracker()
  const steps = [snap(0), snap(0), snap(0), snap(0), snap(2), snap(2), snap(2), snap(2), snap(2, '{"a":1}'), snap(2, '{"a":1}')]
  assert.ok(steps.map(s => track(ok, s)).every(r => !r))
})

test('isLost: a respawn more than 256 blocks from home', () => {
  const home = { x: 0, y: 70, z: 0 }
  assert.strictEqual(isLost({ x: 100, y: 70, z: 100 }, home), false)
  assert.strictEqual(isLost({ x: 250, y: 70, z: 100 }, home), true)
})

test('remember: a failed hunt is counted under its skill name', () => {
  const run = { memory: { optionalFails: {} } }
  remember(run, { skill: 'hunt', args: [], optional: true }, { ok: false })
  assert.deepStrictEqual(run.memory.optionalFails, { hunt: 1 })
})

test('remember: two shelters in a row pause sheltering for five decisions; another skill resets the count', () => {
  const run = { memory: { optionalFails: {}, shelters: 0, noShelter: 0 } }
  const step = (skill) => remember(run, { skill, args: [] }, { ok: false })
  step('shelter')
  step('go_up')
  step('shelter')
  assert.strictEqual(run.memory.noShelter, 0)
  step('shelter')
  assert.strictEqual(run.memory.noShelter, 5)
  step('fight')
  assert.strictEqual(run.memory.noShelter, 4)
  for (let i = 0; i < 4; i++) step('mine')
  assert.strictEqual(run.memory.noShelter, 0)
})

test('remember: consecutive drowning results are counted, any other result resets the count', () => {
  const run = { memory: { optionalFails: {}, shelters: 0, noShelter: 0, drownings: 0 } }
  const action = { skill: 'go_up', args: [1] }
  remember(run, action, { ok: false, reason: 'drowning' })
  remember(run, action, { ok: false, reason: 'drowning' })
  assert.strictEqual(run.memory.drownings, 2)
  remember(run, action, { ok: true })
  assert.strictEqual(run.memory.drownings, 0)
})

test('remember: two dig_down failures without descent arm a relocation, which resets the count and turns the direction', () => {
  const run = { memory: { leg: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {} } }
  const dig = { skill: 'dig_down', args: [-58] }
  remember(run, dig, { ok: false, reason: 'blocked' })
  remember(run, dig, { ok: false, reason: 'timeout', descended: true })
  assert.strictEqual(run.memory.digFails, 0)
  remember(run, dig, { ok: false, reason: 'timeout' })
  remember(run, dig, { ok: false, reason: 'blocked' })
  assert.strictEqual(run.memory.digFails, 2)
  remember(run, { skill: 'explore', args: [{ mode: 'branch' }], relocate: true }, { ok: true })
  assert.deepStrictEqual([run.memory.digFails, run.memory.relocations, run.memory.leg], [0, 1, 0])
})

test('remember: a failed relocation hop keeps digFails, still turns the direction and arms a climb that a reloc_up clears', () => {
  const run = { memory: { leg: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {}, digFails: 1 } }
  remember(run, { skill: 'explore', args: [{ mode: 'branch' }], relocate: true }, { ok: false, reason: 'hazard' })
  assert.deepStrictEqual([run.memory.digFails, run.memory.relocations, run.memory.relocFailed], [1, 1, true])
  remember(run, { skill: 'go_up', args: [70], key: 'reloc_up' }, { ok: true })
  assert.strictEqual(run.memory.relocFailed, false)
})

test('remember: a not_found relocation hop moved the bot, so it resets digFails; a hazard hop does not', () => {
  const hop = { skill: 'explore', args: [{ mode: 'surface' }], relocate: true }
  const run = { memory: { leg: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {}, digFails: 2 } }
  remember(run, hop, { ok: false, reason: 'not_found' })
  assert.deepStrictEqual([run.memory.digFails, run.memory.relocations, run.memory.relocFailed], [0, 1, false])
  run.memory.digFails = 2
  remember(run, hop, { ok: false, reason: 'hazard' })
  assert.deepStrictEqual([run.memory.digFails, run.memory.relocFailed], [2, true])
})

test('remember: finishing a hazard climb forces a relocation hop before the next dig_down', () => {
  const run = { memory: { optionalFails: {}, hazardUp: true } }
  remember(run, { skill: 'go_up', args: [-54], key: 'hazard_up' }, { ok: true })
  assert.strictEqual(run.memory.digFails, 1)
})

test('remember: keyed optional waits count under their key and do not trip the shelter pause; night digs are counted', () => {
  const run = { memory: { optionalFails: {}, shelters: 0, noShelter: 0 } }
  const dawn = { skill: 'shelter', args: [1, 'dawn'], optional: true, key: 'dawn' }
  for (let i = 0; i < 3; i++) remember(run, dawn, { ok: false, reason: 'not_sealed' })
  assert.deepStrictEqual([run.memory.optionalFails, run.memory.noShelter], [{ dawn: 3 }, 0])
  remember(run, { skill: 'dig_down', args: [66], key: 'night_dig' }, { ok: true })
  assert.strictEqual(run.memory.nightDigs, 1)
})

test('remember: no_tool counts as a stuck dig, and a finished upgrade craft clears the count', () => {
  const run = { memory: { leg: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {} } }
  remember(run, { skill: 'dig_down', args: [-58] }, { ok: false, reason: 'no_tool' })
  assert.deepStrictEqual([run.memory.digFails, run.memory.lastDigReason], [1, 'no_tool'])
  remember(run, { skill: 'craft', args: ['stone_pickaxe', 1], key: 'upgrade' }, { ok: true })
  assert.strictEqual(run.memory.digFails, 0)
})

test('remember: a branch hazard turns the heading and restarts the serpentine, two in a row also arm a climb', () => {
  const run = { memory: { leg: 5, baseDir: 3, surfaceDir: 0, surfaceLeg: 0, optionalFails: {} } }
  const explore = { skill: 'explore', args: [{ mode: 'branch' }] }
  remember(run, explore, { ok: false, reason: 'hazard' })
  assert.deepStrictEqual([run.memory.baseDir, run.memory.leg, run.memory.hazardUp], [0, 0, undefined])
  remember(run, explore, { ok: false, reason: 'hazard' })
  assert.deepStrictEqual([run.memory.baseDir, run.memory.hazardUp, run.memory.hazards], [1, true, 0])
  remember(run, { skill: 'go_up', args: [-54], key: 'hazard_up' }, { ok: true })
  assert.strictEqual(run.memory.hazardUp, false)
})

test('remember: a hazard streak is broken by any other explore result; other failures still advance the leg', () => {
  const run = { memory: { leg: 0, baseDir: 0, surfaceDir: 0, surfaceLeg: 0, optionalFails: {} } }
  const explore = { skill: 'explore', args: [{ mode: 'branch' }] }
  remember(run, explore, { ok: false, reason: 'hazard' })
  remember(run, explore, { ok: false, reason: 'not_found' })
  assert.deepStrictEqual([run.memory.leg, run.memory.hazards], [1, 0])
  remember(run, explore, { ok: false, reason: 'hazard' })
  assert.notStrictEqual(run.memory.hazardUp, true)
})

test('remember: an undiggable branch leg (bedrock) is handled like a hazard: turn, restart, then climb', () => {
  const run = { memory: { leg: 5, baseDir: 3, surfaceDir: 0, surfaceLeg: 0, optionalFails: {} } }
  const explore = { skill: 'explore', args: [{ mode: 'branch' }] }
  remember(run, explore, { ok: false, reason: 'undiggable' })
  assert.deepStrictEqual([run.memory.baseDir, run.memory.leg], [0, 0])
  remember(run, explore, { ok: false, reason: 'undiggable' })
  assert.strictEqual(run.memory.hazardUp, true)
})

test('stuck: a successful toss neither resets the failure count nor looks like progress', () => {
  let items = [{ name: 'dirt', count: 10 }]
  const bot = { entity: { position: { clone: () => ({ x: 0, y: 70, z: 0 }) } }, inventory: { items: () => items } }
  const track = stuckTracker(bot)
  const before = { dirt: 10 }
  const failed = { skill: 'mine' }
  assert.strictEqual(track({ ok: false }, failed, before), false)
  assert.strictEqual(track({ ok: false }, failed, before), false)
  items = []
  assert.strictEqual(track({ ok: true }, { skill: 'toss' }, before), false)
  assert.strictEqual(track({ ok: false }, failed, {}), true)
})

test('remember: restock steps and failures are counted per item, on the item that was restocked', () => {
  const run = { memory: { optionalFails: {} } }
  remember(run, { skill: 'mine', args: [], restock: 'stone' }, { ok: true })
  remember(run, { skill: 'mine', args: [], restock: 'stone' }, { ok: false })
  remember(run, { skill: 'hunt', args: [], restock: 'food', optional: true }, { ok: false })
  assert.deepStrictEqual(run.memory.restock, { stone: { steps: 2, fails: 1 }, food: { steps: 1, fails: 1 } })
})

test('resetLife: per-life counters go back to their start, per-run direction and relocation state is kept', () => {
  const memory = {
    leg: 3, baseDir: 2, surfaceDir: 1, surfaceLeg: 4, optionalFails: { hunt: 4, rest: 4 }, shelters: 1, noShelter: 3, drownings: 2,
    digFails: 1, relocations: 5, hazards: 1, hazardUp: true, relocFailed: true, lastDigReason: 'blocked', nightDigs: 6,
    restock: { food: { steps: 12, fails: 2 } }, homeFails: 2, hopsSinceDescent: 2, foodRests: 2,
  }
  const fresh = resetLife(memory)
  assert.deepStrictEqual([fresh.baseDir, fresh.surfaceDir, fresh.relocations], [2, 1, 5])
  assert.deepStrictEqual(
    [fresh.leg, fresh.surfaceLeg, fresh.shelters, fresh.noShelter, fresh.drownings, fresh.digFails, fresh.hazards, fresh.hazardUp, fresh.relocFailed, fresh.nightDigs, fresh.homeFails, fresh.hopsSinceDescent, fresh.foodRests],
    [0, 0, 0, 0, 0, 0, 0, false, false, 0, 0, 0, 0])
  assert.deepStrictEqual([fresh.optionalFails, fresh.restock, fresh.lastDigReason], [{}, {}, undefined])
  assert.strictEqual(memory.nightDigs, 6) // pure: the input is untouched
})

test('resetTrip: a deposit refills the night-dig, optional-failure and restock budgets and leaves the rest', () => {
  const memory = { nightDigs: 6, optionalFails: { hunt: 4 }, restock: { food: { steps: 3, fails: 1 } }, digFails: 1, relocations: 2 }
  resetTrip(memory)
  assert.deepStrictEqual(memory, { nightDigs: 0, optionalFails: {}, restock: {}, digFails: 1, relocations: 2 })
})
