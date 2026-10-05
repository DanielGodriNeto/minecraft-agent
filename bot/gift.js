// Gift ablation (arm param gift=<preset>): the harness gives gear right after placement, the bot wears the armor at run start.
// Measures what each gear tier is worth before any acquisition code exists. Absent gift = nothing here runs.
const { armorPoints } = require('./longrun.js')

const PICK = 'iron_pickaxe'
const ARMOR_SET = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']
const DESTINATIONS = ['head', 'torso', 'legs', 'feet']
const ARMOR_SLOTS = [5, 6, 7, 8]
// item -> count; fortune2 is built in giveCommands (data component, 1.21.5+ syntax: no "levels" wrapper).
const PRESETS = {
  base: { [PICK]: 1 },
  armor: { [PICK]: 1, ...Object.fromEntries(ARMOR_SET.map(n => [n, 1])) },
  spare: { [PICK]: 3 },
  fortune2: { [`${PICK}[enchantments={"minecraft:fortune":2}]`]: 1 },
  diamondpick: { diamond_pickaxe: 1 },
}

function giveCommands(name, gift) {
  const preset = PRESETS[gift]
  if (!preset) throw new Error(`unknown gift "${gift}", expected one of ${Object.keys(PRESETS).join(', ')}`)
  return Object.entries(preset).map(([item, count]) => `give ${name} ${item} ${count}`)
}

const worn = (bot) => ARMOR_SLOTS.map(i => bot.inventory.slots[i]?.name).filter(Boolean)
const wornPoints = (bot) => armorPoints(worn(bot))

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Waits for the given items to show up (the give arrives asynchronously), then wears every armor piece. Never throws.
async function equipGift(bot, gift, { log = console.log, waitMs = 5000 } = {}) {
  const pieces = PRESETS[gift] && ARMOR_SET.filter(n => PRESETS[gift][n])
  if (!pieces?.length) return { ok: true, worn: worn(bot) }
  try {
    for (let t = 0; t < waitMs && !pieces.every(n => bot.inventory.items().some(i => i.name === n)); t += 100) await sleep(100)
    for (const piece of pieces) {
      const item = bot.inventory.items().find(i => i.name === piece)
      if (item) await bot.equip(item, DESTINATIONS[ARMOR_SET.indexOf(piece)])
    }
  } catch (e) {
    log(`[gift] equip failed for ${bot.username}: ${e.message}`)
  }
  const missing = pieces.filter(n => !worn(bot).includes(n))
  if (missing.length) log(`[gift] ${bot.username} is not wearing ${missing.join(',')}`)
  return { ok: !missing.length, worn: worn(bot) }
}

module.exports = { giveCommands, equipGift, wornPoints, PRESETS }
