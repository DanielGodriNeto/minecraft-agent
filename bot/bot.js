const path = require('node:path')
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { parseCommand, isOwner } = require('./commands.js')
const { trackRecipeBook } = require('./skills.js')

const authFromEnv = () => ({
  ownerName: process.env.OWNER || 'Owner',
  ownerUuid: process.env.OWNER_UUID,
  allowOffline: process.env.ALLOW_OFFLINE_OWNER === '1',
})

function status(bot) {
  const p = bot.entity.position
  const counts = {}
  for (const i of bot.inventory.items()) counts[i.name] = (counts[i.name] || 0) + i.count
  return `hp=${bot.health} food=${bot.food} pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} inv=${JSON.stringify(counts)}`
}

function createBot(opts = {}, auth = authFromEnv()) {
  const options = { host: '127.0.0.1', port: 25565, username: 'DiamondBot', version: '1.21.11', ...opts }
  const bot = mineflayer.createBot(options)
  trackRecipeBook(bot)
  bot.skillLogPath = process.env.SKILL_LOG ?? path.join(__dirname, '..', 'logs', `skills-${options.username}.jsonl`)
  bot.loadPlugin(pathfinder)
  bot.on('error', console.error)
  bot.on('chat', (username, message) => {
    if (!bot.entity || !isOwner(bot.players[username], auth)) return
    const command = parseCommand(message)
    if (command?.cmd === 'status') bot.chat(status(bot))
  })
  return bot
}

module.exports = { createBot }
if (require.main === module) {
  const bot = createBot()
  bot.on('kicked', console.error)
}
