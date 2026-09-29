const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { runSkill } = require('../bot/skills.js')

function fakeBot(logPath) {
  return {
    username: 'DiamondBot',
    skillLogPath: logPath,
    health: 20,
    food: 18,
    time: { timeOfDay: 6000 },
    entity: { position: { x: 1.5, y: -60, z: 2.5 } },
    inventory: { items: () => [{ name: 'stick', count: 2 }, { name: 'stick', count: 3 }] },
    pathfinder: { setGoal() {} },
    clearControlStates() {},
    on() {},
    off() {},
  }
}

test('test_skill_log', async () => {
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skilllog-')), 'nested', 'skills.jsonl')
  const bot = fakeBot(logPath)
  const res = await runSkill(bot, 'equip', 'diamond_pickaxe')
  await runSkill(bot, 'approach', { id: 7, name: 'zombie', position: { x: 0, y: 0, z: 0 }, self: {} })

  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.strictEqual(lines.length, 2)
  const [first, second] = lines
  assert.strictEqual(first.bot, 'DiamondBot')
  assert.strictEqual(first.skill, 'equip')
  assert.deepStrictEqual(first.args, ['diamond_pickaxe'])
  assert.deepStrictEqual(first.result, res)
  assert.strictEqual(typeof first.t, 'number')
  assert.deepStrictEqual(first.before, { pos: [1.5, -60, 2.5], health: 20, food: 18, time: 6000, inv: { stick: 5 } })
  assert.deepStrictEqual(first.after, first.before)
  assert.deepStrictEqual(second.args, [{ entity: 'zombie', id: 7 }])
})

test('skill log: damage taken during the skill is logged beside the result, not inside it', async () => {
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skilllog-')), 'skills.jsonl')
  const position = { x: 1.5, y: -60, z: 2.5, floored: () => ({ offset: () => ({}) }) }
  const bot = Object.assign(new EventEmitter(), fakeBot(logPath), {
    entity: { position },
    blockAt: () => null,
    nearestEntity: () => null,
    stopDigging() {},
  })
  delete bot.on
  delete bot.off
  const pending = runSkill(bot, 'equip', 'stick')
  bot.health = 10
  bot.emit('health')
  const result = await pending
  const [line] = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.strictEqual(result.damage, undefined)
  assert.deepStrictEqual(line.damage, [{ hp: 10, cause: 'unknown' }])
  assert.strictEqual(line.result.damage, undefined)
})
