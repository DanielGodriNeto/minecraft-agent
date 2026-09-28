const { test } = require('node:test')
const assert = require('node:assert')
const { parseCommand, isOwner } = require('../bot/commands.js')

test('test_command_parse', () => {
  assert.deepStrictEqual(parseCommand('!get diamond 5'), { cmd: 'get', item: 'diamond', count: 5 })
  assert.deepStrictEqual(parseCommand('!get diamond max'), { cmd: 'get', item: 'diamond', count: 'max' })
  assert.deepStrictEqual(parseCommand('  !get   diamond  3 '), { cmd: 'get', item: 'diamond', count: 3 })
  assert.deepStrictEqual(parseCommand('!store'), { cmd: 'store' })
  assert.deepStrictEqual(parseCommand('!store 10 -60 -3'), { cmd: 'store', pos: { x: 10, y: -60, z: -3 } })
  assert.deepStrictEqual(parseCommand('!status'), { cmd: 'status' })
  assert.deepStrictEqual(parseCommand('!come'), { cmd: 'come' })
  assert.deepStrictEqual(parseCommand('!stop'), { cmd: 'stop' })
  for (const bad of ['', 'hello', 'get diamond 5', '!get', '!get diamond', '!get diamond 0', '!get diamond -1',
    '!get diamond 2.5', '!get diamond lots', '!get iron 5', '!get diamond 5 extra', '!store 1 2',
    '!store 1 2 z', '!store 1.5 2 3', '!status now', '!dance']) {
    assert.strictEqual(parseCommand(bad), null, bad)
  }
})

const OFFLINE_OWNER_UUID = '9e6c5a8b-6c53-3c5e-9a2a-1e4c7f0b2d11' // v3 = offline-mode
const ONLINE_OWNER_UUID = '069a79f4-44e9-4726-a5be-fca90e38aaf5' // v4 = Mojang-authenticated

test('test_command_owner_only', () => {
  const cfg = { ownerName: 'Owner', ownerUuid: ONLINE_OWNER_UUID, allowOffline: false }
  assert.strictEqual(isOwner({ username: 'Owner', uuid: ONLINE_OWNER_UUID }, cfg), true)
  assert.strictEqual(isOwner({ username: 'Stranger', uuid: '11111111-2222-4333-8444-555555555555' }, cfg), false)
  assert.strictEqual(isOwner(undefined, cfg), false)
})

test('test_uuid_auth', () => {
  const cfg = { ownerName: 'Owner', ownerUuid: ONLINE_OWNER_UUID, allowOffline: false }
  assert.strictEqual(isOwner({ username: 'Owner', uuid: '11111111-2222-4333-8444-555555555555' }, cfg), false)
  assert.strictEqual(isOwner({ username: 'Owner', uuid: ONLINE_OWNER_UUID }, { ...cfg, ownerUuid: undefined }), false)
})

test('test_offline_refuses_commands', () => {
  const player = { username: 'Owner', uuid: OFFLINE_OWNER_UUID }
  assert.strictEqual(isOwner(player, { ownerName: 'Owner', allowOffline: false }), false)
  assert.strictEqual(isOwner(player, { ownerName: 'Owner', allowOffline: true }), true)
  assert.strictEqual(isOwner({ username: 'Other', uuid: OFFLINE_OWNER_UUID }, { ownerName: 'Owner', allowOffline: true }), false)
})
