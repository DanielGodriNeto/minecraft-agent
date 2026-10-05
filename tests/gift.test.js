const { test } = require('node:test')
const assert = require('node:assert')
const { giveCommands, equipGift, wornPoints } = require('../bot/gift.js')
const { parseArm, giftOf } = require('../bot/eval.js')

test('giveCommands: one command per preset item, 1.21.5+ enchantment component syntax', () => {
  assert.deepStrictEqual(giveCommands('Bot0', 'base'), ['give Bot0 iron_pickaxe 1'])
  assert.deepStrictEqual(giveCommands('Bot0', 'spare'), ['give Bot0 iron_pickaxe 3'])
  assert.deepStrictEqual(giveCommands('Bot0', 'diamondpick'), ['give Bot0 diamond_pickaxe 1'])
  assert.deepStrictEqual(giveCommands('Bot0', 'fortune2'), ['give Bot0 iron_pickaxe[enchantments={"minecraft:fortune":2}] 1'])
  assert.deepStrictEqual(giveCommands('Bot0', 'armor').slice(1), ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'].map(n => `give Bot0 ${n} 1`))
  assert.throws(() => giveCommands('Bot0', 'nope'), /unknown gift/)
})

test('giftOf: reads gift from the arm text, absent otherwise', () => {
  assert.strictEqual(giftOf('gift=armor'), 'armor')
  assert.strictEqual(giftOf('shaft=0'), undefined)
  assert.strictEqual(giftOf(), undefined)
  assert.strictEqual(parseArm('gift=base').gift, 'base')
})

function fakeBot(names, { failEquip = false } = {}) {
  const slots = []
  const bot = {
    username: 'Bot0',
    inventory: { slots, items: () => names.map(name => ({ name })) },
    equip: async (item, dest) => {
      if (failEquip) throw new Error('boom')
      slots[{ head: 5, torso: 6, legs: 7, feet: 8 }[dest]] = item
    },
  }
  return bot
}

test('equipGift: wears all four pieces and verifies the slots', async () => {
  const bot = fakeBot(['iron_pickaxe', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'])
  const res = await equipGift(bot, 'armor', { waitMs: 0 })
  assert.strictEqual(res.ok, true)
  assert.strictEqual(wornPoints(bot), 15) // 2 + 6 + 5 + 2
})

test('equipGift: a failing equip is logged, not thrown; non-armor gifts do nothing', async () => {
  const logs = []
  const bot = fakeBot(['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'], { failEquip: true })
  const res = await equipGift(bot, 'armor', { waitMs: 0, log: m => logs.push(m) })
  assert.strictEqual(res.ok, false)
  assert.ok(logs.some(l => /equip failed/.test(l)))
  assert.deepStrictEqual(await equipGift(fakeBot([]), 'spare', { waitMs: 0 }), { ok: true, worn: [] })
})
