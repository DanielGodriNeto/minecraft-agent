const test = require('node:test')
const assert = require('node:assert')
const { normalizeEnchants, patchItemEnchants } = require('../bot/physicsfix.js')

const registry = { enchantments: { 35: { name: 'fortune' } } }

test('normalizeEnchants maps the 1.21 component to [{name,lvl}]', () => {
  assert.deepStrictEqual(normalizeEnchants({ enchantments: [{ id: 35, level: 2 }] }, registry), [{ name: 'fortune', lvl: 2 }])
})

test('normalizeEnchants passes arrays and empties through', () => {
  assert.deepStrictEqual(normalizeEnchants([], registry), [])
  assert.deepStrictEqual(normalizeEnchants(undefined, registry), [])
})

test('patched Item.enchants is iterable for an enchanted 1.21 item', () => {
  patchItemEnchants()
  const Item = require(require.resolve('prismarine-item', { paths: ['../bot'] }))('1.21.11')
  const reg = require(require.resolve('prismarine-registry', { paths: ['../bot'] }))('1.21.11')
  const item = new Item(reg.itemsByName.iron_pickaxe.id, 1)
  item.componentMap.set('enchantments', { data: { enchantments: [{ id: reg.enchantmentsByName.fortune.id, level: 2 }] } })
  assert.deepStrictEqual([...item.enchants], [{ name: 'fortune', lvl: 2 }])
})
