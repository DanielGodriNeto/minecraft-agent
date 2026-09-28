// Live-server test harness. Needs the dev server on 127.0.0.1:25565 with Owner opped (server/ops.json).
// Owner is a spectator that runs fixture commands; DiamondBot is the bot under test.
const path = require('node:path')
const req = require('node:module').createRequire(path.join(__dirname, '../bot/bot.js'))
const mineflayer = req('mineflayer')
const { createBot } = req('./bot.js')

const AREA = { x1: 200, z1: 200, x2: 231, z2: 231 } // flat world: grass top at y=-61, stand at y=-60
const CENTER = { x: 216, y: -60, z: 216 }
const COMMAND_ERROR = /Incorrect argument|Unknown or incomplete|not loaded|Invalid|Expected/

const once = (emitter, ev, ms, pred = () => true) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { emitter.off(ev, h); reject(new Error(`timeout waiting for ${ev}`)) }, ms)
  const h = (...a) => { if (pred(...a)) { clearTimeout(t); emitter.off(ev, h); resolve(a) } }
  emitter.on(ev, h)
})

async function poll(fn, ms = 10000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error(`poll timeout: ${fn}`)
}

async function connect() {
  const opts = { host: '127.0.0.1', port: 25565, version: '1.21.11' }
  const owner = mineflayer.createBot({ ...opts, username: 'Owner' })
  const bot = createBot({}, { ownerName: 'Owner', allowOffline: true })
  await Promise.all([once(owner, 'spawn', 30000), once(bot, 'spawn', 30000)])

  // Every command answers with one system message; waiting for it keeps commands sequential.
  async function cmd(command) {
    const feedback = once(owner, 'messagestr', 5000, (_, pos) => pos === 'system')
    owner.chat(command)
    const [text] = await feedback
    if (COMMAND_ERROR.test(text)) throw new Error(`${command} -> ${text}`)
    return text
  }

  // A no-op /gamemode sends no feedback, so only issue it when it changes something.
  if (owner.game.gameMode !== 'spectator') await cmd('/gamemode spectator Owner')
  if (bot.game.gameMode !== 'survival') await cmd('/gamemode survival DiamondBot')
  for (const c of ['/difficulty easy', '/gamerule spawn_mobs false', '/gamerule advance_time false',
    '/time set midnight']) await cmd(c)

  // Fresh fixture area, empty inventory, full health, bot standing at `stage`.
  async function reset(stage = CENTER) {
    const { x1, z1, x2, z2 } = AREA
    await cmd(`/tp Owner ${CENTER.x} -40 ${CENTER.z}`)
    await cmd(`/tp DiamondBot ${CENTER.x + 0.5} -60 ${CENTER.z + 0.5}`)
    await cmd('/kill @e[type=!player]')
    await cmd('/clear DiamondBot')
    await cmd('/effect clear DiamondBot')
    await cmd('/effect give DiamondBot instant_health 1 10')
    await cmd('/effect give DiamondBot saturation 1 10')
    await cmd(`/fill ${x1} -63 ${z1} ${x2} -62 ${z2} dirt`)
    await cmd(`/fill ${x1} -61 ${z1} ${x2} -61 ${z2} grass_block`)
    await cmd(`/fill ${x1} -60 ${z1} ${x2} -30 ${z2} air`)
    await teleport(stage)
    await poll(() => bot.inventory.items().length === 0 && bot.health === 20)
  }

  async function teleport({ x, y, z }) {
    await cmd(`/tp DiamondBot ${x + 0.5} ${y} ${z + 0.5}`)
    await poll(() => bot.entity.position.distanceTo(bot.entity.position.clone().set(x + 0.5, y, z + 0.5)) < 0.5)
  }

  async function give(item, count = 1) {
    const before = itemCount(item)
    await cmd(`/give DiamondBot ${item} ${count}`)
    await poll(() => itemCount(item) >= before + count)
  }

  // Waits until DiamondBot's own view shows the block, so fixtures are in place before the skill runs.
  async function setblock({ x, y, z }, block) {
    await cmd(`/setblock ${x} ${y} ${z} ${block}`)
    await poll(() => blockName({ x, y, z }) === block.replace(/\[.*|\{.*/, ''))
  }

  async function fill(a, b, block, mode = '') {
    await cmd(`/fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} ${block} ${mode}`.trim())
    await poll(() => blockName(a) === block)
  }

  const blockName = ({ x, y, z }) => bot.blockAt(bot.entity.position.clone().set(x, y, z))?.name
  const itemCount = (name) => bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0)

  const end = () => { bot.end(); owner.end() }

  return { bot, owner, cmd, reset, teleport, give, setblock, fill, blockName, count: itemCount, poll, once, end }
}

module.exports = { connect, CENTER }
