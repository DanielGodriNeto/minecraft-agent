// Objective loop (Phase 2.2/2.3): observe -> planner -> skill, until the objective ends.
const { runSkill, findVisible, stopPathing, resetTrail, cheapestPickaxe, nearestHostile, nearestAnimal, placeableCount, isDrowning, sealed, isNight, SHELTER_MIN, FIGHT_RANGE } = require('./skills.js')
const { nextAction, DEFAULT_PARAMS, SOURCES } = require('./planner.js')

const STUCK_FAILURES = 3
const STUCK_MOVE = 5
const STUCK_WINDOW = 12
const STUCK_IDLE = 5
const IDLE_MOVE = 1
const NEAR = 16
const MAX_DROWN_REACTIONS = 3
const IDLE_EXEMPT = new Set(['shelter', 'eat', 'fight'])
const LOST_BLOCKS = 256
const MAX_SHELTERS = 2
const MAX_HAZARDS = 2
const SHELTER_PAUSE = 5
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
    surfaceY: run.surfaceY,
    isNight: isNight(bot),
    enclosed: sealed(bot, pos.floored()),
    hostileNear: nearestHostile(bot) !== null,
    hostileClose: nearestHostile(bot, FIGHT_RANGE) !== null,
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
    drowning: (run.memory.drownings ?? 0) < MAX_DROWN_REACTIONS && isDrowning(bot),
    params: run.params,
    memory: run.memory,
  }
}

// Sheltering again and again next to a hostile that never leaves achieves nothing: after a few in a row the planner fights instead.
function trackShelter(memory, action) {
  if (memory.noShelter > 0) memory.noShelter--
  if (action.skill !== 'shelter' || action.key) {
    memory.shelters = 0
    return
  }
  if (++memory.shelters < MAX_SHELTERS) return
  memory.noShelter = SHELTER_PAUSE
  memory.shelters = 0
}

const DIG_STUCK = new Set(['blocked', 'timeout', 'no_tool'])

// Consecutive dig_down failures without any descent; a relocation hop (or a success) starts the count over.
function trackDigging(memory, action, result) {
  if (action.key === 'upgrade' && result.ok) {
    memory.digFails = 0
    return
  }
  if (action.relocate) {
    memory.digFails = 0
    memory.relocations = (memory.relocations ?? 0) + 1
    return
  }
  if (action.skill !== 'dig_down') return
  const stuck = !result.ok && !result.descended && DIG_STUCK.has(result.reason)
  memory.digFails = stuck ? (memory.digFails ?? 0) + 1 : 0
  memory.lastDigReason = result.reason
}

// A branch tunnel that met water, lava or rock it cannot dig (bedrock) is abandoned: head another way from scratch, and after two in a row climb first.
const LEG_BLOCKED = new Set(['hazard', 'undiggable', 'no_tool'])

function failBranchLeg(memory, result) {
  if (!LEG_BLOCKED.has(result.reason)) {
    memory.leg++
    return
  }
  memory.baseDir = (memory.baseDir + 1) % 4
  memory.leg = 0
  memory.hazards = (memory.hazards ?? 0) + 1
  if (memory.hazards < MAX_HAZARDS) return
  memory.hazards = 0
  memory.hazardUp = true
}

function remember(run, action, result) {
  trackShelter(run.memory, action)
  trackDigging(run.memory, action, result)
  if (action.key === 'night_dig') run.memory.nightDigs = (run.memory.nightDigs ?? 0) + 1
  if (action.skill === 'explore' && !LEG_BLOCKED.has(result.reason)) run.memory.hazards = 0
  if (action.key === 'hazard_up') run.memory.hazardUp = false
  run.memory.drownings = result.reason === 'drowning' ? (run.memory.drownings ?? 0) + 1 : 0
  if (result.ok) return
  if (action.optional) {
    const fails = run.memory.optionalFails
    const key = action.key ?? action.args[0] ?? action.skill
    fails[key] = (fails[key] ?? 0) + 1
  }
  if (action.skill !== 'explore' || action.relocate) return
  const { mode } = action.args[0]
  if (mode === 'branch') failBranchLeg(run.memory, result)
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

// A successful toss is neither progress nor a reset: it is skipped, and what it threw away is added back to the
// inventory signature so the change does not look like progress on the next decision.
function stuckTracker(bot) {
  const track = createStuckTracker()
  const tossed = {}
  return (result, action, before) => {
    const now = inventoryCounts(bot)
    if (action.skill === 'toss' && result.ok) {
      for (const [name, n] of Object.entries(before)) tossed[name] = (tossed[name] ?? 0) + Math.max(0, n - (now[name] ?? 0))
      return false
    }
    for (const [name, n] of Object.entries(tossed)) now[name] = (now[name] ?? 0) + n
    const inv = JSON.stringify(Object.fromEntries(Object.entries(now).sort()))
    return track(result, { pos: bot.entity.position.clone(), inv })
  }
}

// home: storage chest position. Resolves with why the run ended.
async function runObjective(bot, { objective, home, params = jitterParams(), deadline = Infinity, maxDeaths = 3, rand = Math.random }) {
  const run = {
    objective, home, surfaceY: home.y, params, deadline, deposited: 0, recentlyAttacked: false, deaths: 0, decisions: 0, stopped: false,
    memory: { leg: 0, baseDir: Math.floor(rand() * 4), surfaceDir: Math.floor(rand() * 4), surfaceLeg: 0, optionalFails: {}, shelters: 0, noShelter: 0, drownings: 0, digFails: 0, relocations: 0 },
  }
  bot.objectiveRun = run
  bot.runDeadline = deadline
  const onDeath = () => {
    run.deaths++
    run.memory.homeFails = 0
    bot.trail = [] // respawn is at home
    stopPathing(bot) // a dead bot must not keep chasing its old goal
  }
  const onSpawn = () => {
    if (run.deaths > 0 && isLost(bot.entity.position, home)) run.lost = true
  }
  bot.on('death', onDeath)
  bot.on('spawn', onSpawn)
  const isStuck = stuckTracker(bot)
  try {
    for (;;) {
      if (run.stopped) return finish(run, 'stopped')
      if (run.lost) return finish(run, 'lost')
      if (run.deaths >= maxDeaths) return finish(run, 'deaths')
      if (Date.now() >= deadline) return finish(run, 'timeout')
      if (!bot.entity || bot.health <= 0) {
        await new Promise(r => bot.once('spawn', r))
        if (isLost(bot.entity.position, home)) return finish(run, 'lost')
        continue
      }
      const action = nextAction(observe(bot, run))
      if (!action) return finish(run, 'done')
      const invBefore = inventoryCounts(bot)
      const diamondsBefore = invBefore.diamond ?? 0
      const yBefore = bot.entity?.position.y
      const result = { ...await runSkill(bot, action.skill, ...action.args), descended: bot.entity?.position.y < yBefore - 1 }
      run.decisions++
      if (action.skill === 'deposit' && result.ok) run.deposited += diamondsBefore - (inventoryCounts(bot).diamond ?? 0)
      if (action.skill === 'deposit' && result.reason === 'full') return finish(run, 'chest_full')
      remember(run, action, result)
      resetTrail(bot, run.home)
      run.recentlyAttacked = result.reason === 'attacked'
      if (!run.recentlyAttacked && !IDLE_EXEMPT.has(action.skill) && isStuck(result, action, invBefore)) return finish(run, 'stuck')
    }
  } finally {
    bot.off('death', onDeath)
    bot.off('spawn', onSpawn)
    bot.runDeadline = null
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

module.exports = { runObjective, stuckTracker, stopObjective, jitterParams, observe, createStuckTracker, pickLeft, remember, isLost }
