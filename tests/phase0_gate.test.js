// Run from bot/ (npm run gate). Requires server running on 127.0.0.1:25565.
const { test, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const req = require('node:module').createRequire(path.join(process.cwd(), 'bot.js'))
const mineflayer = req('mineflayer')
const { goals, Movements } = req('mineflayer-pathfinder')
const { createBot } = require(path.join(process.cwd(), 'bot.js'))

const clients = []
const track = (c) => { clients.push(c); return c }
const waitFor = (emitter, ev, ms = 30000, pred = () => true) => new Promise((res, rej) => {
  const t = setTimeout(() => { emitter.off(ev, h); rej(new Error(`timeout waiting for ${ev}`)) }, ms)
  const h = (...a) => { if (pred(...a)) { clearTimeout(t); emitter.off(ev, h); res(a) } }
  emitter.on(ev, h)
})
const poll = async (fn, ms = 15000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)) }
  throw new Error('poll timeout')
}

after(() => clients.forEach(c => c.end()))

test('phase 0 gate', async (t) => {
  const bot = track(createBot())
  const owner = track(mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'Owner', version: '1.21.11' }))
  await Promise.all([waitFor(bot, 'spawn'), waitFor(owner, 'spawn')])
  await bot.waitForChunksToLoad()

  await t.test('walks >= 3 blocks', async () => {
    const start = bot.entity.position.clone()
    bot.pathfinder.setMovements(new Movements(bot))
    bot.pathfinder.setGoal(new goals.GoalNear(start.x + 5, start.y, start.z, 1))
    await poll(() => bot.entity.position.distanceTo(start) >= 3)
    bot.pathfinder.setGoal(null)
  })

  await t.test('digs a block', async () => {
    const p = bot.entity.position.floored()
    const target = bot.blockAt(p.offset(0, -1, 0))
    assert.notStrictEqual(target.name, 'air')
    await bot.dig(target)
    await poll(() => bot.blockAt(target.position).name === 'air')
  })

  await t.test('answers !status from owner', async () => {
    const reply = waitFor(owner, 'chat', 10000, (u, m) => u === 'DiamondBot' && m.startsWith('hp='))
    owner.chat('!status')
    const [, msg] = await reply
    console.log('status reply:', msg)
  })

  await t.test('non-whitelisted client is refused', async () => {
    const intruder = track(mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'Intruder', version: '1.21.11' }))
    intruder.on('error', () => {})
    const [reason] = await Promise.race([
      waitFor(intruder, 'kicked', 15000),
      waitFor(intruder, 'spawn', 15000).then(() => { throw new Error('Intruder spawned') }),
    ])
    console.log('intruder kicked:', JSON.stringify(reason))
    assert.match(JSON.stringify(reason), /whitelist/i)
  })
})
