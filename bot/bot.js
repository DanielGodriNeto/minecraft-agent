const path = require('node:path')
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { parseCommand, isOwner } = require('./commands.js')
const { trackRecipeBook, runSkill } = require('./skills.js')
const { runObjective, stopObjective } = require('./agent.js')

const authFromEnv = () => ({
  ownerName: process.env.OWNER || 'Owner',
  ownerUuid: process.env.OWNER_UUID,
  allowOffline: process.env.ALLOW_OFFLINE_OWNER === '1',
})

function status(bot) {
  const p = bot.entity.position
  const counts = {}
  for (const i of bot.inventory.items()) counts[i.name] = (counts[i.name] || 0) + i.count
  const run = bot.objectiveRun
  const objective = run ? `${run.objective.item} ${run.objective.count}` : 'idle'
  const storage = bot.storage ? `${bot.storage.x},${bot.storage.y},${bot.storage.z}` : 'unset'
  return `hp=${bot.health} food=${bot.food} pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} ` +
    `objective=${objective} stored=${run?.deposited ?? 0} storage=${storage} inv=${JSON.stringify(counts)}`
}

function setStorage(bot, pos, owner) {
  const chest = pos ?? bot.findBlock({ matching: bot.registry.blocksByName.chest.id, point: owner.entity?.position, maxDistance: 16 })?.position
  if (!chest) return bot.chat('No chest within 16 blocks of you.')
  bot.storage = { x: chest.x, y: chest.y, z: chest.z }
  bot.chat(`Storage set to ${chest.x},${chest.y},${chest.z}.`)
}

async function startObjective(bot, { item, count }) {
  if (!bot.storage) return bot.chat('Set storage first with !store.')
  stopObjective(bot)
  bot.chat(`Getting ${count} ${item}.`)
  const result = await runObjective(bot, { objective: { item, count }, home: bot.storage })
  bot.chat(`Objective ended (${result.reason}): deposited ${result.deposited} ${item}.`)
}

function handleCommand(bot, command, owner) {
  switch (command.cmd) {
    case 'status': return bot.chat(status(bot))
    case 'store': return setStorage(bot, command.pos, owner)
    case 'get': return startObjective(bot, command)
    case 'stop': return bot.chat(stopObjective(bot) ? 'Stopping.' : 'Nothing to stop.')
    case 'come':
      if (!owner.entity) return bot.chat("I can't see you.")
      stopObjective(bot)
      return runSkill(bot, 'approach', owner.entity)
  }
}

function createBot(opts = {}, auth = authFromEnv()) {
  const options = { host: '127.0.0.1', port: 25565, username: 'DiamondBot', version: '1.21.11', ...opts }
  const bot = mineflayer.createBot(options)
  trackRecipeBook(bot)
  bot.skillLogPath = process.env.SKILL_LOG ?? path.join(__dirname, '..', 'logs', `skills-${options.username}.jsonl`)
  bot.loadPlugin(pathfinder)
  bot.on('error', console.error)
  bot.on('chat', (username, message) => {
    const owner = bot.players[username]
    if (!bot.entity || !isOwner(owner, auth)) return
    const command = parseCommand(message)
    if (command) Promise.resolve(handleCommand(bot, command, owner)).catch(console.error)
  })
  return bot
}

module.exports = { createBot }
if (require.main === module) {
  const bot = createBot()
  bot.on('kicked', console.error)
}
