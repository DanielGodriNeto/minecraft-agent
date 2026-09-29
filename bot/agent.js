// Objective loop (Phase 2.2/2.3): observe -> planner -> skill, until the objective ends.
const { runSkill, findVisible, stopPathing } = require('./skills.js')
const { nextAction, DEFAULT_PARAMS, SOURCES } = require('./planner.js')

const STUCK_FAILURES = 3
const STUCK_MOVE = 5
const STUCK_WINDOW = 12
const NEAR = 16
const STATION_NEAR = 6 // a table seen from a tunnel through 10 blocks of rock is not usable

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
  const near = (name, maxDistance = NEAR) => bot.findBlock({ matching: bot.registry.blocksByName[name].id, maxDistance }) !== null
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
    tableNear: near('crafting_table', STATION_NEAR),
    furnaceNear: near('furnace', STATION_NEAR),
    freeSlots: bot.inventory.emptySlotCount(),
    pickLeft: pick ? pick.maxDurability - pick.durabilityUsed : 0,
    home: run.home,
    distHome: pos.distanceTo(pos.clone().set(run.home.x, run.home.y, run.home.z)),
    objective: run.objective,
    deposited: run.deposited,
    msLeft: run.deadline - Date.now(),
    recentlyAttacked: run.recentlyAttacked,
    params: run.params,
    memory: run.memory,
  }
}

function remember(run, action, result) {
  if (result.ok || action.skill !== 'explore') return
  const { mode } = action.args[0]
  if (mode === 'branch') run.memory.leg++
  else {
    run.memory.surfaceDir = (run.memory.surfaceDir + 1) % 4
    run.memory.surfaceLeg++
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// Stuck = STUCK_FAILURES failed skills in a row with no inventory change and < STUCK_MOVE blocks moved,
// or a full window of decisions with no success, or one that went nowhere and gained nothing (oscillation).
// Pure: takes a { pos: {x,y,z}, inv: string } snapshot taken after each decision.
function createStuckTracker() {
  let failures = 0
  let anchor = null
  const window = []
  const stalled = () => window.length === STUCK_WINDOW && (
    window.every(w => !w.ok) ||
    (distance(window[0].pos, window.at(-1).pos) < STUCK_MOVE && window.every(w => w.inv === window[0].inv)))
  return (result, snapshot) => {
    window.push({ ok: result.ok, ...snapshot })
    if (window.length > STUCK_WINDOW) window.shift()
    if (result.ok || !anchor || anchor.inv !== snapshot.inv || distance(anchor.pos, snapshot.pos) >= STUCK_MOVE) {
      failures = result.ok ? 0 : 1
      anchor = snapshot
      return stalled()
    }
    return ++failures >= STUCK_FAILURES || stalled()
  }
}

function stuckTracker(bot) {
  const track = createStuckTracker()
  return (result) => track(result, { pos: bot.entity.position.clone(), inv: JSON.stringify(inventoryCounts(bot)) })
}

// home: storage chest position. Resolves with why the run ended.
async function runObjective(bot, { objective, home, params = jitterParams(), deadline = Infinity, maxDeaths = 3, rand = Math.random }) {
  const run = {
    objective, home, params, deadline, deposited: 0, recentlyAttacked: false, deaths: 0, decisions: 0, stopped: false,
    memory: { leg: 0, baseDir: Math.floor(rand() * 4), surfaceDir: Math.floor(rand() * 4), surfaceLeg: 0 },
  }
  bot.objectiveRun = run
  const onDeath = () => {
    run.deaths++
    stopPathing(bot) // a dead bot must not keep chasing its old goal
  }
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
      run.recentlyAttacked = result.reason === 'attacked'
      if (result.reason !== 'attacked' && isStuck(result)) return finish(run, 'stuck')
    }
  } finally {
    bot.off('death', onDeath)
    if (bot.objectiveRun === run) bot.objectiveRun = null
  }
}

function finish(run, reason) {
  return { reason, deposited: run.deposited, deaths: run.deaths, decisions: run.decisions, params: run.params }
}

function stopObjective(bot) {
  if (!bot.objectiveRun) return false
  bot.objectiveRun.stopped = true
  stopPathing(bot)
  bot.stopDigging()
  return true
}

module.exports = { runObjective, stopObjective, jitterParams, observe, createStuckTracker }
