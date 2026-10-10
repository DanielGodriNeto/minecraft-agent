const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAuth } = require('../bot/chat/auth.js')

const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), 'owner.json')

function setup(extra = {}) {
  const clock = { t: 1_000_000 }
  const logs = []
  const storePath = extra.storePath ?? tmp()
  const make = () => createAuth({ mode: 'pairing', storePath, now: () => clock.t, random: () => 123456, log: m => logs.push(m), ...extra })
  return { clock, logs, storePath, make, auth: make() }
}

test('online mode: uuid match, name fallback, no presence needed', () => {
  const a = createAuth({ mode: 'online', owner: { name: 'Alice', uuid: U1 } })
  assert.equal(a.isOwner('Alice', U1), true)
  assert.equal(a.isOwner('Alice', U2), false)
  assert.equal(a.isOwner('Bob', U1), true) // uuid is the identity
  const byName = createAuth({ mode: 'online', owner: { name: 'Alice' } })
  assert.equal(byName.isOwner('alice', undefined), true)
  assert.equal(byName.isOwner('Bob', undefined), false)
  assert.equal(a.startPairingIfNeeded(), null)
})

test('correct pairing stores owner, burns code, requires presence', () => {
  const { auth, storePath, make } = setup()
  const p = auth.startPairingIfNeeded()
  assert.equal(p.code, '123456')
  const r = auth.handleWhisper('Alice', U1, 'parear 123456')
  assert.equal(r.ok, true)
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, 'utf8')), { name: 'Alice', uuid: U1 })
  assert.equal(auth.isOwner('Alice', U1), true) // paired in-session counts as present
  // burned
  assert.equal(auth.handleWhisper('Mallory', U2, 'pair 123456').ok, false)
  // restart persistence: owner kept, but absent until seen joining
  const again = make()
  assert.equal(again.startPairingIfNeeded(), null)
  assert.equal(again.isOwner('Alice', U1), false)
  again.onPlayerJoined('Alice', U1)
  assert.equal(again.isOwner('Alice', U1), true)
  again.onPlayerLeft('Alice')
  assert.equal(again.isOwner('Alice', U1), false)
})

test('wrong code fails and does not pair', () => {
  const { auth, storePath } = setup()
  auth.startPairingIfNeeded()
  assert.equal(auth.handleWhisper('Alice', U1, 'pair 000000').ok, false)
  assert.equal(fs.existsSync(storePath), false)
})

test('expiry after 10 minutes', () => {
  const { auth, clock } = setup()
  auth.startPairingIfNeeded()
  clock.t += 10 * 60_000 + 1
  assert.equal(auth.handleWhisper('Alice', U1, 'pair 123456').ok, false)
})

test('5 wrong attempts lock for 15 minutes, even with the right code', () => {
  const { auth, clock } = setup()
  auth.startPairingIfNeeded()
  for (let i = 0; i < 5; i++) auth.handleWhisper('Alice', U1, 'pair 999999')
  assert.equal(auth.handleWhisper('Alice', U1, 'pair 123456').ok, false)
  clock.t += 9 * 60_000 // still locked, and code not yet expired
  assert.equal(auth.handleWhisper('Alice', U1, 'pair 123456').ok, false)
  auth.startPairingIfNeeded() // terminal restarts pairing: fresh code window, lock still honoured
  clock.t += 7 * 60_000 // 16 min after lock
  auth.startPairingIfNeeded()
  assert.equal(auth.handleWhisper('Alice', U1, 'pair 123456').ok, true)
})

test('non-pair text and missing uuid never reveal anything or pair', () => {
  const { auth, storePath } = setup()
  auth.startPairingIfNeeded()
  assert.equal(auth.handleWhisper('Alice', U1, 'hello').reply, null)
  assert.equal(auth.handleWhisper('Alice', undefined, 'pair 123456').ok, false)
  assert.equal(fs.existsSync(storePath), false)
})

test('whisper pair before startPairing, or after paired, is silent', () => {
  const { auth } = setup()
  assert.deepEqual(auth.handleWhisper('Alice', U1, 'pair 123456'), { ok: false, reply: null })
})

test('replies never contain the code', () => {
  const { auth, logs } = setup()
  auth.startPairingIfNeeded()
  const replies = [auth.handleWhisper('A', U1, 'pair 111111'), auth.handleWhisper('A', U1, 'pair 123456')]
  for (const r of replies) assert.ok(!String(r.reply).includes('123456'))
  assert.ok(!logs.join('\n').includes('123456'))
})

test('spoofed name with different uuid is rejected and logged', () => {
  const { auth, logs } = setup()
  auth.startPairingIfNeeded()
  auth.handleWhisper('Alice', U1, 'pair 123456')
  auth.onPlayerLeft('Alice')
  auth.onPlayerJoined('Alice', U2) // spoofer
  assert.equal(auth.isOwner('Alice', U2), false)
  assert.equal(auth.isOwner('Alice', U1), false) // real owner not present
  assert.ok(logs.some(l => /spoof/i.test(l)))
  auth.onPlayerJoined('Alice', U1)
  assert.equal(auth.isOwner('Alice', U2), false)
  assert.equal(auth.isOwner('Alice', U1), true)
})

test('online owner with uuid requires a matching uuid (no name fallback)', () => {
  const a = createAuth({ mode: 'online', owner: { name: 'Alice', uuid: U1 } })
  assert.equal(a.isOwner('Alice', undefined), false)
  assert.equal(a.isOwner('Alice'), false)
  assert.equal(a.isOwner('Alice', U1), true)
})

test('rejoin with same name but different uuid never regains presence; same uuid does', () => {
  const { auth, make } = setup()
  auth.startPairingIfNeeded()
  auth.handleWhisper('Alice', U1, 'pair 123456')
  const again = make()
  again.onPlayerJoined('Alice', U2)
  assert.equal(again.isOwner('Alice', U2), false)
  assert.equal(again.isOwner('Alice', U1), false)
  again.onPlayerJoined('Alice', U1)
  assert.equal(again.isOwner('Alice', U1), true)
})

test('onPlayerLeft only clears presence on matching uuid (name when uuid absent)', () => {
  const { auth } = setup()
  auth.startPairingIfNeeded()
  auth.handleWhisper('Alice', U1, 'pair 123456')
  auth.onPlayerLeft('Alice', U2) // spoofer leaving
  assert.equal(auth.isOwner('Alice', U1), true)
  auth.onPlayerLeft('Alice', U1)
  assert.equal(auth.isOwner('Alice', U1), false)
  auth.onPlayerJoined('Alice', U1)
  auth.onPlayerLeft('Alice')
  assert.equal(auth.isOwner('Alice', U1), false)
})

function offlineUuid(name) {
  const h = require('node:crypto').createHash('md5').update('OfflinePlayer:' + name).digest()
  h[6] = (h[6] & 0x0f) | 0x30
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

test('pairing with an offline-style uuid exposes a one-time warning', () => {
  const { auth, logs } = setup()
  assert.deepEqual(auth.warnings, [])
  auth.startPairingIfNeeded()
  auth.handleWhisper('Alice', offlineUuid('Alice'), 'pair 123456')
  assert.equal(auth.warnings.length, 1)
  assert.match(auth.warnings[0], /whitelist/i)
  auth.onPlayerJoined('Alice', offlineUuid('Alice'))
  assert.equal(auth.warnings.length, 1)
  assert.equal(logs.filter(l => /whitelist/i.test(l)).length, 1)
  const ok = setup()
  ok.auth.startPairingIfNeeded()
  ok.auth.handleWhisper('Alice', U1, 'pair 123456')
  assert.deepEqual(ok.auth.warnings, [])
})

test('lockout survives restart (and stays locked with the right code)', () => {
  const { auth, make, clock } = setup()
  auth.startPairingIfNeeded()
  for (let i = 0; i < 5; i++) auth.handleWhisper('Alice', U1, 'pair 999999')
  clock.t += 60_000
  const again = make()
  again.startPairingIfNeeded()
  assert.equal(again.handleWhisper('Alice', U1, 'pair 123456').ok, false)
  clock.t += 15 * 60_000
  again.startPairingIfNeeded()
  assert.equal(again.handleWhisper('Alice', U1, 'pair 123456').ok, true)
})

test('failed attempts carry over a restart with decay', () => {
  const { auth, make } = setup()
  auth.startPairingIfNeeded()
  for (let i = 0; i < 3; i++) auth.handleWhisper('Alice', U1, 'pair 999999')
  const again = make() // 3 -> decays to 1
  again.startPairingIfNeeded()
  for (let i = 0; i < 3; i++) again.handleWhisper('Alice', U1, 'pair 999999') // total 4: not locked
  assert.equal(again.handleWhisper('Alice', U1, 'pair 999999').ok, false) // 5th: locks
  assert.match(again.handleWhisper('Alice', U1, 'pair 123456').reply, /locked/i)
})

test('state file is written atomically with no temp leftovers', () => {
  const { auth, storePath } = setup()
  auth.startPairingIfNeeded()
  auth.handleWhisper('Alice', U1, 'pair 999999')
  const files = fs.readdirSync(path.dirname(storePath))
  assert.ok(files.every(f => !f.endsWith('.tmp')), files.join())
  assert.ok(files.length >= 1)
})
