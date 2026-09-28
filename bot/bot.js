const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')

const OWNER = process.env.OWNER || 'Owner'

function createBot(opts = {}) {
  const bot = mineflayer.createBot({
    host: '127.0.0.1', port: 25565, username: 'DiamondBot', version: '1.21.11', ...opts,
  })
  bot.loadPlugin(pathfinder)
  bot.on('chat', (username, message) => {
    if (username !== OWNER || message.trim() !== '!status') return
    const p = bot.entity.position
    const counts = {}
    for (const i of bot.inventory.items()) counts[i.name] = (counts[i.name] || 0) + i.count
    bot.chat(`hp=${bot.health} food=${bot.food} pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} inv=${JSON.stringify(counts)}`)
  })
  return bot
}

module.exports = { createBot }
if (require.main === module) {
  const bot = createBot()
  bot.on('error', console.error)
  bot.on('kicked', console.error)
}
