// prismarine-physics can resolve a collision with the hitbox 1e-16 inside a block face
// (x = 0.7000000000000001 against a block at x = 1, flush in float math). The server rejects that move as a
// collision and teleport the bot back every tick, so it freezes at the first step up.
const EDGE_EPS = 1e-6

function nudgeOffEdges(pos, halfWidth) {
  for (const axis of ['x', 'z']) {
    for (const side of [1, -1]) {
      const edge = pos[axis] + side * halfWidth
      const face = Math.round(edge)
      if (Math.abs(edge - face) < EDGE_EPS) pos[axis] = face - side * (halfWidth + EDGE_EPS)
    }
  }
}

// Runs after each physics step and before mineflayer sends the position.
function keepHitboxOutOfBlocks(bot) {
  bot.on('physicsTick', () => nudgeOffEdges(bot.entity.position, bot.entity.width / 2))
}

// On 1.20.5+ prismarine-item returns the raw component ({enchantments:[{id,level}]}), but mineflayer's dig-time
// code concatenates and iterates it as [{name,lvl}], so digging with an enchanted tool throws.
function normalizeEnchants(data, registry) {
  if (Array.isArray(data)) return data
  return (data?.enchantments ?? []).map(e => ({ name: registry.enchantments[e.id]?.name ?? null, lvl: e.level }))
}

function patchItemEnchants() {
  const path = require.resolve('prismarine-item')
  const original = require(path)
  const patched = registryOrVersion => {
    const Item = original(registryOrVersion)
    const registry = typeof registryOrVersion === 'string' ? require('prismarine-registry')(registryOrVersion) : registryOrVersion
    const getter = Object.getOwnPropertyDescriptor(Item.prototype, 'enchants')
    Object.defineProperty(Item.prototype, 'enchants', {
      ...getter,
      get() { return normalizeEnchants(getter.get.call(this), registry) },
    })
    return Item
  }
  Object.assign(patched, original)
  require.cache[path].exports = patched
}

module.exports = { nudgeOffEdges, keepHitboxOutOfBlocks, normalizeEnchants, patchItemEnchants }
