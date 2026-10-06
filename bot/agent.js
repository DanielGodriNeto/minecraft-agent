// Objective loop (Phase 2.2/2.3): observe -> planner -> skill, until the objective ends.
const { runSkill, findVisible, stopPathing, resetTrail, cheapestPickaxe, nearestHostile, nearestAnimal, placeableCount, isDrowning, sealed, isNight, clearUnreachable, SHELTER_MIN, FIGHT_RANGE } = require('./skills.js')
const T = require('./telemetry.js')
const fs = require('node:fs')
const path = require('node:path')
const { stuckEscalation, newHistory, fruitlessDeaths, clearLoopMemory, gearSnapshot, longrunFields, GEAR_INTERVAL_MIN, HOP_BLOCKS, SURFACE_BLOCKS } = require('./longrun.js')
const { nextAction, walkAfter, lingerHeldReturn, recoveryFor, GROUPS, MAX_DIG_FAILS, DEFAULT_PARAMS, SOURCES, normalizeParams } = require('./planner.js')

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
const MAX_RELOC_HAZARDS = 2
const SHELTER_PAUSE = 5
const STATION_NEAR = 6 // a table seen from a tunnel through 10 blocks of rock is not usable

// Run memory: which fields belong to one life (reset on death) and which to the whole run.
//   per-run:  baseDir, surfaceDir, relocations   (directions keep rotating so a new life does not retry the failed one)
//   per-trip: restock, nightDigs, optionalFails, fightFails  (also reset by a successful deposit)
//   per-life: localSurfaceY, goUpFails, goUpY, homeTimeouts, homePause, homeAdopt, leg, surfaceLeg, shelters, noShelter, drownings, mineDrownings, digFails, lastDigReason, hazards, hazardUp, relocFailed,
//             homeFails, hopsSinceDescent, burnUps, crowdFlees, relocHazards, ascentDelayMs, branchMisses, branchRelocs, failSigs, recovered, spawnEscapes, escapeStart, walk, pickUps, spareSince   (the respawn is at home: nothing of the old position applies)
//   hopsSinceDescent deliberately survives a deposit: it counts hops since the last real descent, and any descent zeroes it.
const lifeMemory = () => ({
  leg: 0, surfaceLeg: 0, shelters: 0, noShelter: 0, drownings: 0, mineDrownings: 0, digFails: 0, lastDigReason: undefined, hazards: 0, hazardUp: false,
  relocFailed: false, homeFails: 0, hopsSinceDescent: 0, burnUps: 0, crowdFlees: 0, relocHazards: 0, ascentDelayMs: 0, branchMisses: 0, branchRelocs: 0,
  failSigs: {}, recovered: {}, spawnEscapes: 0, escapeStart: undefined, walk: undefined, pickUps: 0, spareSince: undefined, localSurfaceY: undefined, goUpFails: 0, goUpY: undefined, homeTimeouts: 0, homePause: 0, homeAdopt: false, ...tripMemory(),
})
const tripMemory = () => ({ restock: {}, nightDigs: 0, optionalFails: {}, fightFails: 0 })

const resetLife = (memory) => ({ ...memory, ...lifeMemory() })
const resetTrip = (memory) => Object.assign(memory, tripMemory())

// A hill home hides the real ground: open sky at a height below home (valley, water edge) is the surface for this life.
const MIN_SURFACE_Y = 50 // sea level is 63; lower open sky is a ravine or a pit, not ground to work from
const SKY_SCAN = 32
const SEE_THROUGH = /leaves|glass/
const COLUMNS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] // the bot's column and its neighbours: a dug shaft is open above but walled
const MAX_GO_UP_FAILS = 2
const SAME_HEIGHT = 3
const MAX_HOME_TIMEOUTS = 2
const HOME_PAUSE = 6

const effectiveSurface = (run) => (run.params.localSurface ? Math.min(run.surfaceY, run.memory.localSurfaceY ?? Infinity) : run.surfaceY)

function skyOpen(bot) {
  const feet = bot.entity.position.floored()
  const clear = ([dx, dz]) => {
    for (let dy = 2; dy <= SKY_SCAN; dy++) {
      const block = bot.blockAt(feet.offset(dx, dy, dz))
      if (block?.boundingBox === 'block' && !SEE_THROUGH.test(block.name)) return false
    }
    return true
  }
  return COLUMNS.every(clear)
}

function trackLocalSurface(bot, run, y) {
  if (!run.params.localSurface || y < MIN_SURFACE_Y || y >= effectiveSurface(run)) return
  if (skyOpen(bot)) run.memory.localSurfaceY = y
}

// Two climbs toward home that both ended at about the same height above MIN_SURFACE_Y: that height is as high as this bot gets.
function trackGoUp(run, action, result) {
  const { memory } = run
  if (action.skill !== 'go_up' || action.args[0] !== run.surfaceY) return
  if (result.ok) {
    memory.goUpFails = 0
    memory.localSurfaceY = undefined
    return
  }
  if (result.reason !== 'not_reached' || result.y === undefined) return
  memory.goUpFails = memory.goUpY !== undefined && Math.abs(result.y - memory.goUpY) <= SAME_HEIGHT ? memory.goUpFails + 1 : 1
  memory.goUpY = result.y
  if (run.params.localSurface && memory.goUpFails >= MAX_GO_UP_FAILS && result.y >= MIN_SURFACE_Y) memory.localSurfaceY = result.y
}

// Home trips that time out twice in a row are not repeated: pause them, and offer one chest adoption.
function trackHomeTrip(memory, action, result) {
  if (action.key === 'adopt_home') {
    memory.homeAdopt = false
    if (result.ok) memory.homePause = 0
    else memory.homePause = Math.max(memory.homePause - 1, 0)
    return
  }
  if (action.skill !== 'return_home' && action.skill !== 'deposit') {
    memory.homePause = Math.max(memory.homePause - 1, 0)
    return
  }
  memory.homeTimeouts = result.reason === 'timeout' ? memory.homeTimeouts + 1 : 0
  if (memory.homeTimeouts < MAX_HOME_TIMEOUTS) return
  memory.homeTimeouts = 0
  memory.homePause = HOME_PAUSE
  memory.homeAdopt = true
}

function handleDeath(bot, run) {
  run.deaths++
  run.memory = resetLife(run.memory)
  bot.trail = [] // respawn is at home
  clearUnreachable(bot)
  stopPathing(bot) // a dead bot must not keep chasing its old goal
  if (run.longrun) {
    run.longrun.deathLog.push({ t: Date.now(), banked: run.deposited, found: run.longrun.diamondsFound })
    if (fruitlessDeaths(run.longrun.deathLog)) run.longrun.hopeless = true
    armStuckTracker(bot, run) // what the old life was doing says nothing about the new one
  }
}

// A new trip gets fresh restock, night-dig and optional-failure budgets, and forgets blocks marked unreachable.
function startNewTrip(bot, run) {
  resetTrip(run.memory)
  clearUnreachable(bot)
}

// Small per-run jitter so recorded runs cover more states (plan 2.2).
// MINEY=<y> fixes the branch level for an A/B arm; branchY is still drawn so the other params keep the same random stream.
const fixedBranchY = () => (Number.isFinite(Number.parseFloat(process.env.MINEY)) ? Number.parseFloat(process.env.MINEY) : undefined)
function jitterParams(rand = Math.random) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  const drawnBranchY = int(-59, -56)
  return {
    ...DEFAULT_PARAMS,
    branchY: fixedBranchY() ?? drawnBranchY,
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

const IRON_PICKS = ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']

// Uses left on the best iron-tier (or better) pickaxe carried; undefined when none is carried.
function ironLeft(bot) {
  const left = bot.inventory.items().filter(i => IRON_PICKS.includes(i.name) && i.maxDurability).map(i => i.maxDurability - (i.durabilityUsed ?? 0))
  return left.length ? Math.max(...left) : undefined
}

const CROWD_RANGE = 8
const countHostiles = (bot) => Object.values(bot.entities).filter(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) <= CROWD_RANGE).length

function observe(bot, run) {
  const pos = bot.entity.position
  const y = Math.floor(pos.y)
  trackLocalSurface(bot, run, y)
  const near = (name, maxDistance = NEAR) => bot.findBlock({ matching: bot.registry.blocksByName[name].id, maxDistance }) !== null
  const visible = {}
  for (const [key, source] of Object.entries(SOURCES)) visible[key] = findVisible(bot, source.blocks, source.maxAbove ?? null) !== null
  return {
    inv: inventoryCounts(bot),
    health: bot.health,
    food: bot.food,
    hasFood: bot.inventory.items().some(i => bot.registry.foodsByName[i.name]),
    foodCount: bot.inventory.items().reduce((n, i) => n + (bot.registry.foodsByName[i.name] ? i.count : 0), 0),
    y,
    pos: { x: Math.floor(pos.x), y, z: Math.floor(pos.z) },
    surfaceY: effectiveSurface(run),
    isNight: isNight(bot),
    timeOfDay: bot.time.timeOfDay,
    enclosed: sealed(bot, pos.floored()),
    hostileNear: nearestHostile(bot) !== null,
    hostileCount: countHostiles(bot),
    hostileClose: nearestHostile(bot, FIGHT_RANGE) !== null,
    canShelter: placeableCount(bot) >= SHELTER_MIN,
    animalNear: nearestAnimal(bot) !== null,
    visible,
    tableNear: near('crafting_table', STATION_NEAR),
    furnaceNear: near('furnace', STATION_NEAR),
    freeSlots: bot.inventory.emptySlotCount(),
    pickLeft: pickLeft(bot),
    ironLeft: ironLeft(bot),
    now: Date.now(),
    home: run.home,
    distHome: pos.distanceTo(pos.clone().set(run.home.x, run.home.y, run.home.z)),
    objective: run.objective,
    deposited: run.deposited,
    msLeft: run.deadline - Date.now(),
    recentlyAttacked: run.recentlyAttacked,
    recentlyBurned: run.recentlyBurned,
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

// Consecutive dig_down failures without any descent (hopsSinceDescent counts hops since the last real descent); a successful relocation hop (or a dig success) starts the count over.
// A failed hop still turns the direction and makes the planner climb before hopping again.
function trackDigging(memory, action, result) {
  if (result.descended) memory.hopsSinceDescent = 0
  if (action.key === 'upgrade' && result.ok) {
    memory.digFails = 0
    return
  }
  if (action.key === 'reloc_up') {
    memory.relocFailed = false
    return
  }
  if (action.relocate) {
    memory.relocations = (memory.relocations ?? 0) + 1
    const hopped = result.ok || result.reason === 'not_found' // a surface hop never finds ore, but it did move the bot
    memory.relocFailed = !hopped
    if (!hopped && result.reason === 'hazard') memory.relocHazards = (memory.relocHazards ?? 0) + 1
    if (!hopped) return
    memory.digFails = 0
    memory.hopsSinceDescent = action.key === 'fresh_column' ? 0 : (memory.hopsSinceDescent ?? 0) + 1
    return
  }
  if (action.skill !== 'dig_down') return
  const stuck = !result.ok && !result.descended && DIG_STUCK.has(result.reason)
  memory.digFails = stuck ? (memory.digFails ?? 0) + 1 : 0
  memory.lastDigReason = result.reason
}

// A hazard met on a relocation hop right after a blocked dig_down is not a stuck bot: the planner climbs and hops again
// from the surface (reloc_up). Only the first MAX_RELOC_HAZARDS per life are exempt, so it cannot loop.
// With params.hazardGrace, an explore hazard is also exempt while a hazard_up climb is pending (planner runs it next).
function relocHazardExempt(memory, action, result, params) {
  if (result.reason !== 'hazard') return false
  if (params?.hazardGrace && action.skill === 'explore' && memory.hazardUp) return true
  return Boolean(action.relocate) && (memory.relocHazards ?? 0) <= MAX_RELOC_HAZARDS
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

// Restock steps and failures per reserve item; the planner stops offering an item once either budget is spent.
function trackRestock(memory, action, result) {
  const counts = ((memory.restock ??= {})[action.restock] ??= { steps: 0, fails: 0 })
  counts.steps++
  if (!result.ok) counts.fails++
}

const signature = (action, result) => `${action.skill}:${result.reason}`

function countFailure(memory, action, result) {
  const sig = signature(action, result)
  const sigs = (memory.failSigs ??= {})
  sigs[sig] = (sigs[sig] ?? 0) + 1
}

// Before the run is called stuck: one named routine for this failure's signature (recoveryFor), once per signature per life.
// The skill log records the routine as skill 'recover'; run.recoveries lists them for the result.
// Resolves whether a routine ran; the caller then gives the stuck tracker a fresh start.
async function tryRecovery(bot, run, action, result, exec = runSkill, force = false) {
  if ((!run.params.recovery && !force) || result.ok) return false
  const sig = signature(action, result)
  const routine = recoveryFor(sig, { inv: inventoryCounts(bot), memory: run.memory })
  if (!routine) return false
  run.memory.recovered[sig] = true
  run.recoveries.push(`${sig}>${routine}`)
  await exec(bot, 'recover', routine)
  if (routine === 'retreat') {
    run.memory.baseDir = (run.memory.baseDir + 2) % 4 // relocate: the other way from the hazard
    run.memory.leg = 0
  }
  return true
}

// LONGRUN level 3: one forced move out of the loop. Above y=0: climb, then a surface walk in a rotated direction; underground: one tunnel hop in a new direction.
async function forceEscape(bot, run, exec = runSkill) {
  const { memory } = run
  if (Math.floor(bot.entity.position.y) > 0) {
    await exec(bot, 'go_up', run.surfaceY)
    memory.surfaceDir = (memory.surfaceDir + 1) % 4
    await exec(bot, 'explore', { target: SOURCES.log.blocks, mode: 'surface', dir: memory.surfaceDir, maxBlocks: SURFACE_BLOCKS, maxAbove: SOURCES.log.maxAbove })
    return
  }
  memory.baseDir = (memory.baseDir + 1) % 4
  memory.leg = 0
  await exec(bot, 'explore', { target: SOURCES.diamond.blocks, mode: 'branch', dir: memory.baseDir, maxBlocks: HOP_BLOCKS })
}

// LONGRUN: an escalating answer to a stuck detection. Resolves false when the run should end as stuck.
// Level 1 runs the recovery routine for the failure when one applies (else falls through to level 2); level 2 clears the loop memory; level 3 also forces an escape.
// The position and inventory kept for the next detection are taken AFTER these actions: only change that happens after an escalation counts as progress.
async function escalate(bot, run, action, result, exec = runSkill) {
  const snapshot = run.stuckSnapshot ?? (() => stuckSnapshot(bot))
  const step = stuckEscalation(run.longrun.history, snapshot())
  run.longrun.history = step.history
  if (run.telemetry) T.safe(() => run.telemetry.stuck.push(T.stuckRow({ now: Date.now(), level: step.level ?? null, end: Boolean(step.end), recent: run.telemetry.recent, picks: T.pickList(bot.inventory.items(), bot.registry) })))
  if (step.end) return false
  if (step.level !== 1 || !await tryRecovery(bot, run, action, result, exec, true)) {
    clearLoopMemory(run.memory, lifeMemory())
    if (step.level === 3) await forceEscape(bot, run, exec)
  }
  run.longrun.history = { ...run.longrun.history, last: snapshot() }
  return true
}

// LONGRUN telemetry: per-deposit events and a gear snapshot every GEAR_INTERVAL_MIN minutes (inventory reads only).
function trackLongrun(bot, run, banked, now = Date.now(), diamondsBefore = 0) {
  const lr = run.longrun
  lr.diamondsFound += Math.max(0, (inventoryCounts(bot).diamond ?? 0) - diamondsBefore)
  const minute = Math.floor((now - lr.startedAt) / 60000)
  if (banked > 0) lr.deposits.push({ minute, count: banked })
  if (minute < lr.nextGearMin) return
  lr.nextGearMin = (Math.floor(minute / GEAR_INTERVAL_MIN) + 1) * GEAR_INTERVAL_MIN
  const items = bot.inventory.items()
  const counts = inventoryCounts(bot)
  lr.gear.push(gearSnapshot({
    counts, minute, deposited: run.deposited,
    worn: [5, 6, 7, 8].map(i => bot.inventory.slots[i]?.name).filter(Boolean),
    offhand: bot.inventory.slots[45]?.name,
    foodCount: items.reduce((n, i) => n + (bot.registry.foodsByName[i.name] ? i.count : 0), 0),
  }))
}

function remember(run, action, result) {
  if (!result.ok) countFailure(run.memory, action, result)
  if (action.restock) trackRestock(run.memory, action, result)
  if (action.restock === 'spare_always') run.memory.spareSince ??= Date.now()
  trackShelter(run.memory, action)
  trackGoUp(run, action, result)
  trackHomeTrip(run.memory, action, result)
  trackDigging(run.memory, action, result)
  if (action.skill === 'fight') run.memory.fightFails = result.ok ? 0 : (run.memory.fightFails ?? 0) + 1
  if (action.key === 'crowd_flee') run.memory.crowdFlees = (run.memory.crowdFlees ?? 0) + 1
  if (action.key === 'burn_up') run.memory.burnUps = (run.memory.burnUps ?? 0) + 1
  if (action.key === 'night_dig') run.memory.nightDigs = (run.memory.nightDigs ?? 0) + 1
  if (action.skill === 'explore' && !LEG_BLOCKED.has(result.reason)) run.memory.hazards = 0
  if (action.key === 'hazard_up') {
    run.memory.hazardUp = false
    run.memory.digFails = MAX_DIG_FAILS // the next descent starts with a hop, not in the pocket that just flooded
  }
  run.memory.drownings = result.reason === 'drowning' ? (run.memory.drownings ?? 0) + 1 : 0
  if (action.key === 'branch_relocate') {
    run.memory.branchRelocs = (run.memory.branchRelocs ?? 0) + 1
    run.memory.branchMisses = 0
    run.memory.leg = 0 // serpentine restarts from the new ground
    return
  }
  if (action.key === 'spawn_walk') {
    run.memory.walk = walkAfter(run.memory.walk, action.args[0], result)
    if (result.ok) { // wood in view: the walk is over and the trigger counters start over
      run.memory.surfaceLeg = 0
      delete run.memory.failSigs['go_up:not_reached']
    }
    return
  }
  if (action.key === 'pick_up') run.memory.pickUps = (run.memory.pickUps ?? 0) + 1
  if (action.key === 'spawn_escape') {
    run.memory.spawnEscapes = (run.memory.spawnEscapes ?? 0) + 1
    run.memory.escapeStart ??= action.args[0].dir
    if (result.ok) { // wood in view: the failure counters that triggered the escape start over
      run.memory.surfaceLeg = 0
      delete run.memory.failSigs['go_up:not_reached']
    }
    return
  }
  if (action.skill === 'explore' && action.args[0].mode === 'branch' && action.args[0].target === SOURCES.diamond.blocks) {
    run.memory.branchMisses = result.reason === 'not_found' ? (run.memory.branchMisses ?? 0) + 1 : result.reason === 'hazard' ? run.memory.branchMisses ?? 0 : 0
  }
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

// A skill that a death interrupted reports on the old life: it must not count against the fresh one.
function chargeLinger(run, state, ms) {
  if (lingerHeldReturn(state)) run.memory.ascentDelayMs = (run.memory.ascentDelayMs ?? 0) + ms
}

function afterSkill(run, action, result, deathsBefore) {
  const died = run.deaths !== deathsBefore
  if (!died) remember(run, action, result)
  run.recentlyAttacked = !died && result.reason === 'attacked'
  run.recentlyBurned = !died && result.reason === 'burning'
  if (!result.ok) run.lastFailure = { skill: action.skill, reason: result.reason }
}

// One flat record per planner decision (params.traceLog). Pure: state is observe()'s result.
const TIERS = ['wooden', 'stone', 'iron', 'diamond']
const sumOf = (inv, names) => names.reduce((n, name) => n + (inv[name] ?? 0), 0)
function traceLine(state, action, run, ts = Date.now()) {
  const { inv, memory: m } = state
  return {
    ts, skill: action.skill, key: action.key, args: action.args, pos: [state.pos.x, state.pos.y, state.pos.z], y: state.y, health: state.health, food: state.food,
    inv: { pickaxes: Object.fromEntries(TIERS.map(t => [t, inv[`${t}_pickaxe`] ?? 0])), stick: inv.stick ?? 0, stone: sumOf(inv, GROUPS.stone), wood: sumOf(inv, [...GROUPS.log, ...GROUPS.planks]), diamond: inv.diamond ?? 0 },
    deaths: run.deaths, hazardUp: Boolean(m.hazardUp),
    stuck: { digFails: m.digFails ?? 0, goUpFails: m.goUpFails ?? 0, hazards: m.hazards ?? 0, homeTimeouts: m.homeTimeouts ?? 0, failSigs: m.failSigs ?? {} },
    lastFailure: run.lastFailure ?? null,
  }
}

// Append stream, opened on first use and closed with the run; no sync fs per decision.
function openTrace(bot) {
  let stream
  return {
    write(line) {
      if (!stream) {
        const dir = path.join(__dirname, '..', 'logs')
        fs.mkdirSync(dir, { recursive: true })
        stream = fs.createWriteStream(path.join(dir, `trace-${bot.runTag ?? bot.username ?? 'run'}.jsonl`), { flags: 'a' })
      }
      stream.write(JSON.stringify(line) + '\n')
    },
    end: () => stream?.end(),
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// A respawn this far from home means the spawn point was not set: wandering back would burn the run.
const isLost = (pos, home) => distance(pos, home) > LOST_BLOCKS

// Stuck = STUCK_FAILURES failed skills in a row with no inventory change and < STUCK_MOVE blocks moved,
// or a full window of decisions with no success, or one that went nowhere and gained nothing (oscillation),
// or STUCK_IDLE decisions in a row that moved < IDLE_MOVE blocks and changed nothing, successful or not.
// Pure: takes a { pos: {x,y,z}, inv: string } snapshot taken after each decision.
// ignoresNoProgress() true (watchdog=5): a no_progress failure is recorded but does not add to the STUCK_FAILURES count.
function createStuckTracker(ignoresNoProgress = () => false) {
  let failures = 0
  let idle = 0
  let anchor = null
  let previous = null
  const window = []
  const skipped = (result) => result.reason === 'no_progress' && ignoresNoProgress()
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
      failures = result.ok || skipped(result) ? 0 : 1
      anchor = snapshot
      return stalled()
    }
    if (!skipped(result)) failures++
    return failures >= STUCK_FAILURES || stalled()
  }
}

// A successful toss is neither progress nor a reset: it is skipped, and what it threw away is added back to the
// inventory signature so the change does not look like progress on the next decision.
function stuckSnapshot(bot, tossed = {}) {
  const now = inventoryCounts(bot)
  for (const [name, n] of Object.entries(tossed)) now[name] = (now[name] ?? 0) + n
  return { pos: bot.entity.position.clone(), inv: JSON.stringify(Object.fromEntries(Object.entries(now).sort())) }
}

function stuckTracker(bot) {
  const track = createStuckTracker(() => bot.objectiveRun?.params?.watchdog === 5)
  const tossed = {}
  const check = (result, action, before) => {
    if (action.skill === 'toss' && result.ok) {
      const now = inventoryCounts(bot)
      for (const [name, n] of Object.entries(before)) tossed[name] = (tossed[name] ?? 0) + Math.max(0, n - (now[name] ?? 0))
      return false
    }
    return track(result, stuckSnapshot(bot, tossed))
  }
  check.snapshot = () => stuckSnapshot(bot, tossed)
  return check
}

function armStuckTracker(bot, run) {
  run.isStuck = stuckTracker(bot)
  run.stuckSnapshot = run.isStuck.snapshot
}

// home: storage chest position. Resolves with why the run ended.
// startedAt: the clock the deadline counts from (LONGRUN deposit minutes). deps: test seams for the skill runner, observe and planner.
async function runObjective(bot, { objective, home, params = jitterParams(), deadline = Infinity, maxDeaths = 3, rand = Math.random, startedAt = Date.now(), deps = {} }) {
  const { runSkill: exec = runSkill, observe: look = observe, nextAction: plan = nextAction } = deps
  const run = {
    objective, home, surfaceY: home.y, params: normalizeParams(params), deadline, deposited: 0, recentlyAttacked: false, recentlyBurned: false, deaths: 0, decisions: 0, stopped: false, recoveries: [],
    memory: { ...lifeMemory(), baseDir: Math.floor(rand() * 4), surfaceDir: Math.floor(rand() * 4), relocations: 0 },
  }
  if (run.params.telemetry) run.telemetry = { recent: [], stuck: [] }
  if (run.params.longrun) run.longrun = { history: newHistory(), gear: [], deposits: [], startedAt, nextGearMin: GEAR_INTERVAL_MIN, deathLog: [], diamondsFound: 0, hopeless: false }
  bot.objectiveRun = run
  bot.runDeadline = deadline
  const onDeath = () => handleDeath(bot, run)
  const onSpawn = () => {
    if (run.deaths > 0 && isLost(bot.entity.position, home)) run.lost = true
  }
  bot.on('death', onDeath)
  bot.on('spawn', onSpawn)
  armStuckTracker(bot, run)
  const trace = run.params.traceLog ? openTrace(bot) : null
  try {
    for (;;) {
      if (run.stopped) return finish(run, 'stopped')
      if (run.lost) return finish(run, 'lost')
      if (run.deaths >= maxDeaths && !run.params.longrun) return finish(run, 'deaths')
      if (run.longrun?.hopeless) return finish(run, 'deaths')
      if (Date.now() >= deadline) return finish(run, 'timeout')
      if (!bot.entity || bot.health <= 0) {
        await new Promise(r => bot.once('spawn', r))
        if (isLost(bot.entity.position, home)) return finish(run, 'lost')
        continue
      }
      const state = look(bot, run)
      const action = plan(state)
      const startedAt = Date.now()
      if (!action) return finish(run, 'done')
      trace?.write(traceLine(state, action, run))
      const deathsBefore = run.deaths
      const invBefore = inventoryCounts(bot)
      const diamondsBefore = invBefore.diamond ?? 0
      const depositedBefore = run.deposited
      const yBefore = bot.entity?.position.y
      const result = { ...await exec(bot, action.skill, ...action.args), descended: bot.entity?.position.y < yBefore - 1, y: Math.floor(bot.entity?.position.y) }
      run.decisions++
      if (run.telemetry) T.safe(() => T.pushRecent(run.telemetry.recent, action, result))
      if (action.skill === 'deposit' && result.ok) run.deposited += diamondsBefore - (inventoryCounts(bot).diamond ?? 0)
      if (action.skill === 'deposit' && result.ok) startNewTrip(bot, run)
      if (action.skill === 'deposit' && result.reason === 'full') return finish(run, 'chest_full')
      if (run.longrun) trackLongrun(bot, run, run.deposited - depositedBefore, Date.now(), diamondsBefore)
      afterSkill(run, action, result, deathsBefore)
      chargeLinger(run, state, Date.now() - startedAt)
      resetTrail(bot, run.home)
      if (run.longrun && (run.deaths !== deathsBefore || bot.health <= 0)) continue // died during the skill: the stuck check says nothing about the new life
      if (run.recentlyAttacked || run.recentlyBurned || IDLE_EXEMPT.has(action.skill) || relocHazardExempt(run.memory, action, result, state.params) || !run.isStuck(result, action, invBefore)) continue
      if (run.longrun) {
        if (!await escalate(bot, run, action, result, exec)) return finish(run, 'stuck')
      } else if (!await tryRecovery(bot, run, action, result, exec)) return finish(run, 'stuck')
      armStuckTracker(bot, run)
    }
  } finally {
    bot.off('death', onDeath)
    bot.off('spawn', onSpawn)
    trace?.end()
    bot.runDeadline = null
    if (bot.objectiveRun === run) bot.objectiveRun = null
  }
}

function finish(run, reason) {
  return { reason, deposited: run.deposited, deaths: run.deaths, decisions: run.decisions, params: run.params, ...(run.recoveries.length && { recoveries: run.recoveries }), ...longrunFields(run), ...T.telemetryFields(run) }
}

function stopObjective(bot) {
  if (!bot.objectiveRun) return false
  bot.objectiveRun.stopped = true
  stopPathing(bot)
  bot.stopDigging()
  return true
}

module.exports = { effectiveSurface, trackLocalSurface, chargeLinger, runObjective, relocHazardExempt, stuckTracker, stopObjective, jitterParams, observe, createStuckTracker, finish, tryRecovery, escalate, forceEscape, trackLongrun, traceLine, pickLeft, remember, afterSkill, isLost, resetLife, resetTrip, handleDeath, startNewTrip }
