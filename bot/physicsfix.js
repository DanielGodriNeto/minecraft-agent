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

module.exports = { nudgeOffEdges, keepHitboxOutOfBlocks }
