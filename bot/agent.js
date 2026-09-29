// Objective loop (Phase 2.2/2.3): observe -> planner -> skill, until the objective ends.
const { runSkill, findVisible } = require('./skills.js')
const { nextAction, DEFAULT_PARAMS, SOURCES } = require('./planner.js')

const STUCK_FAILURES = 3
const STUCK_MOVE = 5
const NEAR = 16

// Small per-run jitter so recorded runs cover more states (plan 2.2).
function jitterParams(rand = Math.random) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  return {
    ...DEFAULT_PARAMS,
    branchY: int(-59, -56),
    spacing: int(2, 4),
    tunnelLength: int(24, 40),
    returnAt: int(3, 8),
    woodStock: int(5, 7),
    fleeHealth: int(10, 16),
  }
}

function inventoryCounts(bot) {
  const inv = {}
  for (const i of bot.inventory.items()) inv[i.name] = (inv[i.name] ?? 0) + i.count
  return inv
}

function observe(bot, run) {
  const pos = bot.entity.position
  const near = (name) => bot.findBlock({ matching: bot.registry.blocksByName[name].id, maxDistance: NEAR }) !== null
  const pick = bot.inventory.items().find(i => i.name === 'iron_pickaxe')
  const visible = {}
  for (const [key, source] of Object.entries(SOURCES)) visible[key] = findVisible(bot, source.blocks, source.maxAbove ?? null) !== null
  return {
    inv: inventoryCounts(bot),
    health: bot.health,
    food: bot.food,
    hasFood: bot.inventory.items().some(i => bot.registry.foodsByName[i.name]),
    y: Math.floor(pos.y),
    surfaceY: run.home.y,
    isNight: bot.time.timeOfDay >= 13000 && bot.time.timeOfDay < 23000,
    hostileNear: bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(pos) < 8) !== null,
    visible,
    tableNear: near('crafting_table'),
    furnaceNear: near('furnace'),
    freeSlots: bot.inventory.emptySlotCount(),
    pickLeft: pick ? pick.maxDurability - pick.durabilityUsed : 0,
    home: run.home,
    distHome: pos.distanceTo(pos.clone().set(run.home.x, run.home.y, run.home.z)),
    objective: run.objective,
    deposited: run.deposited,
    params: run.params,
    memory: run.memory,
  }
}

function remember(run, action, result) {
  if (result.ok || action.skill !== 'explore') return
  const { mode } = action.args[0]
  if (mode === 'branch') run.memory.leg++
  else run.memory.surfaceDir = (run.memory.surfaceDir + 1) % 4
}

// Stuck = STUCK_FAILURES failed skills in a row with no inventory change and < STUCK_MOVE blocks moved.
function stuckTracker(bot) {
  let failures = 0
  let anchor = null
  return (result) => {
    const snapshot = { pos: bot.entity.position.clone(), inv: JSON.stringify(inventoryCounts(bot)) }
    if (result.ok || !anchor || anchor.inv !== snapshot.inv || anchor.pos.distanceTo(snapshot.pos) >= STUCK_MOVE) {
      failures = result.ok ? 0 : 1
      anchor = snapshot
      return false
    }
    return ++failures >= STUCK_FAILURES
  }
}

// home: storage chest position. Resolves with why the run ended.
async function runObjective(bot, { objective, home, params = jitterParams(), deadline = Infinity, maxDeaths = 3, rand = Math.random }) {
  const run = {
    objective, home, params, deposited: 0, deaths: 0, decisions: 0, stopped: false,
    memory: { leg: 0, baseDir: Math.floor(rand() * 4), surfaceDir: Math.floor(rand() * 4) },
  }
  bot.objectiveRun = run
  const onDeath = () => { run.deaths++ }
  bot.on('death', onDeath)
  const isStuck = stuckTracker(bot)
  try {
    for (;;) {
      if (run.stopped) return finish(run, 'stopped')
      if (run.deaths >= maxDeaths) return finish(run, 'deaths')
      if (Date.now() >= deadline) return finish(run, 'timeout')
      if (!bot.entity || bot.health <= 0) { await new Promise(r => bot.once('spawn', r)); continue }
      const action = nextAction(observe(bot, run))
      if (!action) return finish(run, 'done')
      const diamondsBefore = inventoryCounts(bot).diamond ?? 0
      const result = await runSkill(bot, action.skill, ...action.args)
      run.decisions++
      if (action.skill === 'deposit' && result.ok) run.deposited += diamondsBefore - (inventoryCounts(bot).diamond ?? 0)
      if (action.skill === 'deposit' && result.reason === 'full') return finish(run, 'chest_full')
      remember(run, action, result)
      if (isStuck(result)) return finish(run, 'stuck')
    }
  } finally {
    bot.off('death', onDeath)
    bot.objectiveRun = null
  }
}

function finish(run, reason) {
  return { reason, deposited: run.deposited, deaths: run.deaths, decisions: run.decisions, params: run.params }
}

function stopObjective(bot) {
  if (!bot.objectiveRun) return false
  bot.objectiveRun.stopped = true
  bot.pathfinder.setGoal(null)
  bot.stopDigging()
  return true
}

module.exports = { runObjective, stopObjective, jitterParams, observe }
