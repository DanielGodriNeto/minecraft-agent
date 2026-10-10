const { test } = require('node:test')
const assert = require('node:assert')
const { parseChat, createRateLimiter } = require('../bot/chat/parse.js')

const base = { botName: 'Bot', owners: ['Owner'] }
const say = (text, sender = 'Owner', extra = {}) => parseChat({ ...base, sender, text, ...extra })
const goal = (item, count) => ({ kind: 'goal', item, count })

const CASES = [
  // goals pt
  ['Bot, pegue diamantes', goal('diamond', 'max')],
  ['Bot, pegue 5 diamantes', goal('diamond', 5)],
  ['bot: consiga um diamante', goal('diamond', 1)],
  ['@Bot me traga dois diamantes', goal('diamond', 2)],
  ['Bot, minere todos os diamantes', goal('diamond', 'max')],
  ['Bot pega tudo de diamante', goal('diamond', 'max')],
  ['Bot, minere 10 diamantes por favor', goal('diamond', 10)],
  ['Bot, pegue diamantes para mim', goal('diamond', 'max')],
  ['Bot, me traga um monte de diamantes', goal('diamond', 'max')],
  ['Bot, pegue 3 ferro', goal('iron_ingot', 3)],
  ['Bot, consiga uma picareta de ferro', goal('iron_pickaxe', 1)],
  ['Bot, faça um escudo', goal('shield', 1)],
  ['Bot, consiga um balde', goal('bucket', 1)],
  // goals en
  ['Bot, get diamond max', goal('diamond', 'max')],
  ['Bot, get 3 diamonds', goal('diamond', 3)],
  ['Bot, mine all diamonds', goal('diamond', 'max')],
  ['Bot: get me five iron', goal('iron_ingot', 5)],
  ['Bot, craft an iron pickaxe', goal('iron_pickaxe', 1)],
  ['Bot, bring me a furnace', goal('furnace', 1)],
  // fuzzy typos
  ['Bot, pegue diamnates', goal('diamond', 'max')],
  ['Bot, get diamnod', goal('diamond', 1)],
  ['Bot, get 2 dimaond', goal('diamond', 2)],
  ['Bot, consiga picareta de fero', goal('iron_pickaxe', 1)],
  ['Bot, get irno', goal('iron_ingot', 1)],
  // stop
  ['Bot, para', { kind: 'stop' }],
  ['Bot, pare', { kind: 'stop' }],
  ['Bot stop', { kind: 'stop' }],
  ['bot: STOP!', { kind: 'stop' }],
  ['Bot, para de minerar', { kind: 'stop' }],
  ['Bot, cancela tudo', { kind: 'stop' }],
  // status
  ['Bot, status', { kind: 'status' }],
  ['Bot, como está?', { kind: 'status' }],
  ['Bot, o que está fazendo?', { kind: 'status' }],
  ['Bot, what are you doing?', { kind: 'status' }],
  // come
  ['Bot, vem aqui', { kind: 'come' }],
  ['Bot, venha', { kind: 'come' }],
  ['Bot, come here', { kind: 'come' }],
  ['@Bot vem cá aqui', { kind: 'come' }],
  // unknown (owner + addressed, no rule matched)
  ['Bot, construa uma casa', { kind: 'unknown', text: 'Bot, construa uma casa' }],
  ['Bot, traga uma casa', { kind: 'unknown', text: 'Bot, traga uma casa' }],
  ['Bot, tudo bem?', { kind: 'unknown', text: 'Bot, tudo bem?' }],
  ['Bot, não pegue diamantes', { kind: 'unknown', text: 'Bot, não pegue diamantes' }],
  ["Bot, don't stop mining", { kind: 'unknown', text: "Bot, don't stop mining" }],
  ['Bot, pegue 0 diamantes', { kind: 'unknown', text: 'Bot, pegue 0 diamantes' }],
  ['Bot, pegue 99999 diamantes', { kind: 'unknown', text: 'Bot, pegue 99999 diamantes' }],
  ['Bot', { kind: 'unknown', text: 'Bot' }],
]

for (const [text, expected] of CASES) {
  test(`chat: ${text}`, () => assert.deepStrictEqual(say(text), expected))
}

test('chat: ignores non-owners, unaddressed, spoofed text, bad input', () => {
  const ignored = [
    say('Bot, pegue diamantes', 'Stranger'),
    say('Bot, stop', 'Stranger'),
    say('<Owner> Bot, pegue diamantes', 'Stranger'),
    say('Owner: Bot, para', 'Stranger'),
    say('pegue diamantes'),
    say('stop'),
    say('Robot, pegue diamantes'),
    say('Botanist, stop'),
    say('oi pessoal'),
    say(''),
    say('Bot, pegue diamantes', null),
    parseChat({ ...base, sender: 'Owner', text: 42 }),
  ]
  for (const r of ignored) assert.deepStrictEqual(r, { kind: 'ignore' })
})

test('chat: owner and name match is case-insensitive; name anywhere', () => {
  assert.deepStrictEqual(say('Bot, pegue diamantes', 'owner'), goal('diamond', 'max'))
  assert.deepStrictEqual(say('pegue diamantes, BOT'), goal('diamond', 'max'))
  assert.deepStrictEqual(say('Bot, pegue diamantes', 'Boss', { owners: ['Owner', 'Boss'] }), goal('diamond', 'max'))
})

test('chat: rate limiter throttles per sender, never stop, unaddressed does not consume', () => {
  let t = 1000
  const limiter = createRateLimiter({ minIntervalMs: 2000, now: () => t })
  const owners = ['Owner', 'Boss']
  const run = (text, sender = 'Owner') => say(text, sender, { limiter, owners })
  assert.strictEqual(run('Bot, status').kind, 'status')
  assert.strictEqual(run('Bot, status').kind, 'ignore')
  assert.strictEqual(run('Bot, status', 'Boss').kind, 'status') // separate sender
  assert.strictEqual(run('Bot, stop').kind, 'stop') // stop bypasses
  t += 1999
  assert.strictEqual(run('Bot, status').kind, 'ignore')
  t += 1
  assert.strictEqual(run('Bot, status').kind, 'status')
  assert.strictEqual(run('ola pessoal').kind, 'ignore')
  assert.strictEqual(run('Bot, status').kind, 'ignore') // the earlier chatter did not reset the window wrongly
})

test('inherited object keys are not number words', () => {
  for (const t of ['bot pegue __proto__ diamante', 'bot pegue constructor diamantes', 'bot pegue toString diamante']) {
    const r = say(t)
    assert.equal(r.kind, 'goal', t)
    assert.ok(r.count === 'max' || Number.isInteger(r.count), t)
  }
  assert.deepEqual(say('bot pegue __proto__ diamante'), goal('diamond', 1))
})

test('isOwner predicate takes precedence over owners', () => {
  const isOwner = s => s === 'Real'
  assert.equal(say('bot stop', 'Owner', { isOwner }).kind, 'ignore') // in owners but fails predicate
  assert.equal(say('bot stop', 'Real', { isOwner }).kind, 'stop') // not in owners but passes
})
