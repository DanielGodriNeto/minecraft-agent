// Objective loop (Phase 2.2/2.3): observe -> planner -> skill, until the objective ends.
const { runSkill, findVisible, stopPathing, resetTrail, cheapestPickaxe, nearestHostile, nearestAnimal, placeableCount, SHELTER_MIN } = require('./skills.js')
const { nextAction, DEFAULT_PARAMS, SOURCES } = require('./planner.js')

const STUCK_FAILURES = 3
const STUCK_MOVE = 5
const STUCK_WINDOW = 12
const STUCK_IDLE = 5
const IDLE_MOVE = 1
const NEAR = 16
const LOST_BLOCKS = 256
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
    woodStock: int(8, 10),
    fleeHealth: int(10, 16),
  }
}

function inventoryCounts(bot) {
  const inv = {}
  for (const i of bot.inventory.items()) inv[i.name] = (inv[i.name] ?? 0) + i.count
  return inv
}

// Uses left on the pickaxe that will actually dig stone (the cheapest capable one), 0 without any.
function pickLeft(bot) {
  const stone = bot.registry.blocksByName.stone
  const pick = cheapestPickaxe(bot.inventory.items(), { canHarvest: (type) => !stone.harvestTools || stone.harvestTools[type] })
  return pick ? pick.maxDurability - pick.durabilityUsed : 0
}

function observe(bot, run) {
  const pos = bot.entity.position
  const near = (name, maxDistance = NEAR) => bot.findBlock({ matching: bot.registry.blocksByName[name].id, maxDistance }) !== null
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
    hostileNear: nearestHostile(bot) !== null,
    canShelter: placeableCount(bot) >= SHELTER_MIN,
    animalNear: nearestAnimal(bot) !== null,
    visible,
    tableNear: near('crafting_table', STATION_NEAR),
    furnaceNear: near('furnace', STATION_NEAR),
    freeSlots: bot.inventory.emptySlotCount(),
    pickLeft: pickLeft(bot),
    home: run.home,
    distHome: pos.distanceTo(pos.clone().set(run.home.x, run.home.y, run.home.z)),
    objective: run.objective,
    deposited: run.deposited,
    msLeft: run.deadline - Date.now(),
    recentlyAttacked: run.recentlyAttacked,
    drowning: run.drowning,
    params: run.params,
    memory: run.memory,
  }
}

function remember(run, action, result) {
  if (result.ok) return
  if (action.optional) {
    const fails = run.memory.optionalFails
    const key = action.args[0] ?? action.skill
    fails[key] = (fails[key] ?? 0) + 1
  }
  if (action.skill !== 'explore') return
  const { mode } = action.args[0]
  if (mode === 'branch') run.memory.leg++
  else {
    run.memory.surfaceDir = (run.memory.surfaceDir + 1) % 4
    run.memory.surfaceLeg++
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// A respawn this far from home means the spawn point was not set: wandering back would burn the run.
const isLost = (pos, home) => distance(pos, home) > LOST_BLOCKS

// Stuck = STUCK_FAILURES failed skills in a row with no inventory change and < STUCK_MOVE blocks moved,
// or a full window of decisions with no success, or one that went nowhere and gained nothing (oscillation),
// or STUCK_IDLE decisions in a row that moved < IDLE_MOVE blocks and changed nothing, successful or not.
// Pure: takes a { pos: {x,y,z}, inv: string } snapshot taken after each decision.
function createStuckTracker() {
  let failures = 0
  let idle = 0
  let anchor = null
  let previous = null
  const window = []
  const stalled = () => window.length === STUCK_WINDOW && (
    window.every(w => !w.ok) ||
    (distance(window[0].pos, window.at(-1).pos) < STUCK_MOVE && window.every(w => w.inv === window[0].inv)))
  return (result, snapshot) => {
    const unchanged = previous?.inv === snapshot.inv && distance(previous.pos, snapshot.pos) < IDLE_MOVE
    idle = unchanged ? idle + 1 : 0
    previous = snapshot
    if (idle >= STUCK_IDLE) return true
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
    objective, home, params, deadline, deposited: 0, recentlyAttacked: false, drowning: false, deaths: 0, decisions: 0, stopped: false,
    memory: { leg: 0, baseDir: Math.floor(rand() * 4), surfaceDir: Math.floor(rand() * 4), surfaceLeg: 0, optionalFails: {} },
  }
  bot.objectiveRun = run
  const onDeath = () => {
    run.deaths++
    bot.trail = [] // respawn is at home
    stopPathing(bot) // a dead bot must not keep chasing its old goal
  }
  bot.on('death', onDeath)
  const isStuck = stuckTracker(bot)
  try {
    for (;;) {
      if (run.stopped) return finish(run, 'stopped')
      if (run.deaths >= maxDeaths) return finish(run, 'deaths')
      if (Date.now() >= deadline) return finish(run, 'timeout')
      if (!bot.entity || bot.health <= 0) {
        await new Promise(r => bot.once('spawn', r))
        if (isLost(bot.entity.position, home)) return finish(run, 'lost')
        continue
      }
      const action = nextAction(observe(bot, run))
      if (!action) return finish(run, 'done')
      const diamondsBefore = inventoryCounts(bot).diamond ?? 0
      const result = await runSkill(bot, action.skill, ...action.args)
      run.decisions++
      if (action.skill === 'deposit' && result.ok) run.deposited += diamondsBefore - (inventoryCounts(bot).diamond ?? 0)
      if (action.skill === 'deposit' && result.reason === 'full') return finish(run, 'chest_full')
      remember(run, action, result)
      resetTrail(bot, home)
      run.recentlyAttacked = result.reason === 'attacked'
      run.drowning = result.reason === 'drowning'
      if (!run.recentlyAttacked && !run.drowning && isStuck(result)) return finish(run, 'stuck')
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

module.exports = { runObjective, stopObjective, jitterParams, observe, createStuckTracker, pickLeft, remember, isLost }
