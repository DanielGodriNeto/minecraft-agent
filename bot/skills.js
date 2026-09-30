const fs = require('node:fs')
const { AsyncLocalStorage } = require('node:async_hooks')
const path = require('node:path')
const { goals, Movements } = require('mineflayer-pathfinder')

const PATH_MS = 30000
const OPEN_MS = 10000
const TOSS_MS = 5000
const STATION_REACH_MS = 8000
const HOP_MS = 12000
const SKILL_CAP_MS = 180000
const OPEN = new Set(['air', 'cave_air', 'void_air', 'water'])
const LAVA = new Set(['lava', 'flowing_lava'])
const WET = new Set(['water', 'flowing_water', 'bubble_column'])
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const SMELTS = { iron_ingot: 'raw_iron', gold_ingot: 'raw_gold', copper_ingot: 'raw_copper' }
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']
const FUELS = ['coal', 'charcoal', ...WOODS.map(w => `${w}_planks`), ...WOODS.map(w => `${w}_log`)]
const PATCH_BLOCKS = ['cobblestone', 'cobbled_deepslate', 'dirt']
const GUARD_MS = 5000
const GO_UP_PATH_MS = 60000
const PILLAR_LIFT = 1
const FALL_SEEN = 0.5
const PILLAR_FAILS = 3
const TUNNEL_OUT = 3
const STEP_TICKS = 40
const STEP_RANGE = 2.5
const ARRIVE_DIST = 0.45
const FACING_TOLERANCE = Math.PI / 18
const TRAIL_MAX = 5000
const HOME_RESET = 4
const HOME_RANGE = 16
const HOME_SLACK = 3
const HOME_MS = 30000
const FAR_HOME_MS = 120000
const MAX_TUNNEL_OUTS = 4
const SHAFT_MIN_BLOCKS = 8 // a shaft is climbed back on carried blocks
const HOSTILE_RANGE = 16
const CANCEL_GRACE_MS = 2000
const TRAIL_STALE = 8
const PICKUP_REACH_UP = 1.5
const PICKUP_MOVED = 1.5
const CANOPY = /_(leaves|log|wood)$/
const DAMAGE_LOG_MAX = 10
const OXYGEN_ABORT = 10
const AIR_SUPPLY_INDEX = 1 // player entity metadata key index of air_supply (ticks, 300 max), 1.21.11
const AIR_PER_LEVEL = 15
const EYE_HEIGHT = 1.62
const DEADLINE_SLACK_MS = 30000
const SUFFOCATION_ABORT = 3
const ABORTS = new Set(['attacked', 'drowning', 'suffocating', 'burning'])
const BURNING = new Set(['lava', 'fire', 'magma', 'burning', 'in_fire', 'on_fire'])
const HAZARD_CAUSE = { lava: 'lava', flowing_lava: 'lava', fire: 'fire', soul_fire: 'fire', magma_block: 'magma', cactus: 'cactus', sweet_berry_bush: 'berry_bush' }
const NON_INTERRUPTIBLE = new Set(['flee', 'eat', 'shelter', 'fight'])
const ESCAPES = new Set(['go_up', 'flee', 'shelter']) // how the bot gets out of water, so drowning must not abort them
const PLACEABLE = ['cobblestone', 'cobbled_deepslate', 'dirt', 'stone', 'deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'netherrack']
const FOOD_ANIMALS = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit'])
const ANIMAL_RANGE = 24
const HUNT_MS = 20000
const ATTACK_REACH = 3
const ATTACK_TICKS = 12
const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe', 'wooden_pickaxe', 'stone_pickaxe']
const SHELTER_MIN = 6
const SHELTER_WAIT_MS = 30000
const DAWN_WAIT_MS = 150000
const REST_MS = 60000
const REST_HEALTH = 14
const NIGHT_START = 13000
const NIGHT_END = 23000
const FIGHT_RANGE = 4
const FIGHT_MS = 15000
const FIGHT_MIN_HEALTH = 8
const SAFE_HEALTH = 16
const SAFE_FOOD = 18

class Fail extends Error {
  constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail }
}

// ---- plumbing ----

// External watchdog: never trust a library call to return on its own (mineflayer-pathfinder #222).
function withTimeout(promise, ms, onTimeout) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { onTimeout(); reject(new Fail('timeout')) }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function stopPathing(bot) {
  bot.pathfinder.setGoal(null)
  bot.clearControlStates()
}

// Same for any other library await (equip, place, window clicks, transfers, look).
const guard = (promise, ms = GUARD_MS) => withTimeout(promise, ms, () => {})

// Window opens can hang forever on a lost packet.
const opened = (promise) => guard(promise, OPEN_MS)

// goto must never pillar up under the bot (no scaffolding) or attempt parkour jumps.
function skillMovements(bot) {
  const movements = new Movements(bot)
  movements.scafoldingBlocks = []
  movements.allowParkour = false
  return movements
}

// Same, but the pathfinder may pillar and bridge with the placeable blocks the bot carries.
function scaffoldMovements(bot) {
  const movements = skillMovements(bot)
  movements.scafoldingBlocks = PLACEABLE.map(name => bot.registry.itemsByName[name]?.id).filter(id => id !== undefined)
  return movements
}

async function goto(bot, goal, ms = PATH_MS, scaffold = false) {
  if (scaffold) bot.pathfinder.setMovements(scaffoldMovements(bot))
  try {
    await withTimeout(bot.pathfinder.goto(goal), ms, () => stopPathing(bot))
  } catch (e) {
    throw e instanceof Fail ? e : new Fail('no_path', e.message)
  } finally {
    if (scaffold) bot.pathfinder.setMovements(skillMovements(bot))
  }
}

// Each run() executes its skill inside its own cancel token, so an abandoned skill keeps seeing its own
// (cancelled) token rather than the fresh one the next skill installs on bot.skillCancel.
const cancelStore = new AsyncLocalStorage()
const currentCancel = (bot) => cancelStore.getStore() ?? bot.skillCancel

// Manual loops call this every iteration: run() cancels a skill by flagging its token, since a timed-out
// or interrupted skill's promise is abandoned but its loops would otherwise keep driving the bot.
function checkCancelled(bot) {
  const cancel = currentCancel(bot)
  if (cancel?.cancelled) throw new Fail(cancel.reason)
}

async function poll(bot, fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    checkCancelled(bot)
    if (fn()) return true
    await bot.waitForTicks(2)
  }
  return fn()
}

// Gives an abandoned skill a moment to notice its cancelled token before the next skill takes the controls.
async function settle(pending, ms) {
  let timer
  const grace = new Promise(resolve => { timer = setTimeout(resolve, ms) })
  await Promise.race([pending.catch(() => {}), grace])
  clearTimeout(timer)
}

// The blacklist is per life and per stash trip: after a death or a deposit the blocks may be reachable again.
const clearUnreachable = (bot) => bot.unreachable?.clear()

const MELEE_RANGE = 6
const RANGED = new Set(['skeleton', 'stray', 'bogged', 'pillager', 'blaze', 'ghast', 'witch', 'breeze'])

function clearShot(bot, mob) {
  const eye = bot.entity.position.offset(0, EYE_HEIGHT, 0)
  const toward = mob.position.offset(0, (mob.height ?? 1) * 0.9, 0).minus(eye)
  return !bot.world.raycast(eye, toward.normalize(), toward.norm())
}

// A hostile is only blamed when it is close, or a ranged one that can see the bot.
function attacker(bot) {
  const p = bot.entity.position
  return bot.nearestEntity(e => {
    if (e.type !== 'hostile') return false
    const d = e.position.distanceTo(p)
    return d <= MELEE_RANGE || (RANGED.has(e.name) && d <= HOSTILE_RANGE && clearShot(bot, e))
  })
}

// mineflayer sets bot.oxygenLevel from any entity's air_supply (squid, fish, drowned), so the bot's own metadata wins.
function ownOxygen(bot) {
  const air = bot.entity.metadata?.[AIR_SUPPLY_INDEX]
  return typeof air === 'number' ? Math.round(air / AIR_PER_LEVEL) : bot.oxygenLevel
}

function headWet(bot) {
  const block = bot.blockAt(bot.entity.position.floored().offset(0, 1, 0))
  return isWet(block) || block?.getProperties?.().waterlogged === true
}

const isDrowning = (bot) => headWet(bot) && (ownOxygen(bot) ?? 20) < OXYGEN_ABORT

function surroundings(bot) {
  const feet = bot.entity.position.floored()
  const head = bot.blockAt(feet.offset(0, 1, 0))
  return {
    feet: bot.blockAt(feet)?.name, head: head?.name, headSolid: isSolid(head),
    oxygen: ownOxygen(bot), onFire: ((bot.entity.metadata?.[0] ?? 0) & 1) === 1,
  }
}

// Best guess at what just hurt the bot: an attacker, a hazard block at feet/head/below, a solid head block, water, fire, else unknown.
function damageCause(bot) {
  const mob = attacker(bot)
  if (mob) return `${mob.name}@${mob.position.distanceTo(bot.entity.position).toFixed(1)}`
  const feet = bot.entity.position.floored()
  const head = feet.offset(0, 1, 0)
  for (const cell of [feet, head, feet.offset(0, -1, 0)]) {
    const cause = HAZARD_CAUSE[bot.blockAt(cell)?.name]
    if (cause) return cause
  }
  const { headSolid, oxygen, onFire } = surroundings(bot)
  if (headSolid) return 'suffocation'
  if (headWet(bot) && (oxygen ?? 20) < 20) return 'drowning'
  return onFire ? 'burning' : 'unknown'
}

// Unexplained damage keeps what the bot was standing in, so the log shows what to fix.
function damageEntry(bot) {
  const cause = damageCause(bot)
  return { hp: bot.health, cause, ...(cause === 'unknown' && surroundings(bot)) }
}

// A skill may overrun the run deadline by DEADLINE_SLACK_MS at most.
function skillCapMs(bot, now = Date.now()) {
  const deadline = bot.runDeadline ?? Infinity
  return Math.min(SKILL_CAP_MS, Math.max(deadline - now, 0) + DEADLINE_SLACK_MS)
}

// A skill is aborted when a hostile hurts the bot, so the planner can react (flee) instead of
// finishing a 30 s walk while being hit. flee/eat/shelter are not interruptible.
async function run(bot, skill, interruptible, escaping = false) {
  const capMs = skillCapMs(bot)
  let ticks = 0
  let lastHealth = bot.health
  let suffocated = 0
  const damage = []
  const stats = bot.skillStats = {}
  const cancel = bot.skillCancel = { cancelled: false, reason: null }
  const abort = (reason) => {
    cancel.cancelled = true
    cancel.reason ??= reason
    stopPathing(bot)
    bot.stopDigging()
  }
  const tick = () => { ticks++ }
  const onBreath = () => { if (!escaping && isDrowning(bot)) abort('drowning') }
  const onHealth = () => {
    const lost = lastHealth - bot.health
    lastHealth = bot.health
    if (lost <= 0) return
    const entry = damageEntry(bot)
    damage.push(entry)
    if (damage.length > DAMAGE_LOG_MAX) damage.shift()
    if (entry.cause === 'drowning') return escaping ? undefined : abort('drowning')
    if (BURNING.has(entry.cause)) return escaping ? undefined : abort('burning')
    if (entry.cause === 'suffocation' && (suffocated += lost) >= SUFFOCATION_ABORT) return abort('suffocating')
    if (!interruptible || cancel.cancelled || !nearestHostile(bot)) return
    abort('attacked')
  }
  bot.on('physicsTick', tick)
  bot.on('health', onHealth)
  bot.on('breath', onBreath)
  const pending = Promise.resolve().then(() => cancelStore.run(cancel, skill))
  try {
    await withTimeout(pending, capMs, () => abort('timeout'))
    return { ok: true, reason: null, ticks, ...stats, ...(damage.length && { damage }) }
  } catch (e) {
    const failed = { ok: false, ticks, ...stats, ...(damage.length && { damage }) }
    if (ABORTS.has(cancel.reason)) return { ...failed, reason: cancel.reason }
    if (e instanceof Fail) return { ...failed, reason: e.reason, ...(e.detail && { detail: e.detail }) }
    if (REFUSED.test(e.message)) return { ...failed, reason: 'no_floor', detail: e.message }
    return { ...failed, reason: 'error', detail: e.message }
  } finally {
    cancel.cancelled = true
    if (cancel.reason) await settle(pending, CANCEL_GRACE_MS)
    bot.off('physicsTick', tick)
    bot.off('health', onHealth)
    bot.off('breath', onBreath)
    bot.skillCancel = null
    stopPathing(bot)
  }
}

// ---- world queries ----

const at = (bot, pos, dx = 0, dy = 0, dz = 0) => bot.blockAt(pos.offset(dx, dy, dz))
const countItem = (bot, name) => bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0)
const findItem = (bot, name) => bot.inventory.items().find(i => i.name === name)
const isLava = (block) => block !== null && LAVA.has(block.name)
const nearLava = (bot, pos) => isLava(bot.blockAt(pos)) || FACES.some(f => isLava(at(bot, pos, ...f)))
const isWet = (block) => block !== null && WET.has(block.name)
const nearWater = (bot, pos) => isWet(bot.blockAt(pos)) || FACES.some(f => isWet(at(bot, pos, ...f)))
const isSolid = (block) => block !== null && block.boundingBox === 'block'

function blockId(bot, name) {
  const block = bot.registry.blocksByName[name]
  if (!block) throw new Fail('unknown_block')
  return block.id
}

// No x-ray: a block counts only if it touches open space AND the bot has line of sight to it.
function isVisible(bot, block) {
  return FACES.some(f => OPEN.has(at(bot, block.position, ...f)?.name)) && bot.canSeeBlock(block)
}

// names: one block name or a list (e.g. every log type).
// maxAbove: ignore blocks more than this many blocks above the bot's feet (null = no limit).
function findVisible(bot, names, maxAbove = null, maxDistance = 32) {
  const matching = [names].flat().map(n => blockId(bot, n))
  const positions = bot.findBlocks({ matching, maxDistance, count: 64 })
  const unreachable = bot.unreachable ?? new Set()
  const feetY = Math.floor(bot.entity.position.y)
  return positions.map(p => bot.blockAt(p))
    .find(b => b && (maxAbove === null || b.position.y - feetY <= maxAbove) &&
      !unreachable.has(b.position.toString()) && isVisible(bot, b)) ?? null
}

function nearestHostile(bot, range = HOSTILE_RANGE) {
  return bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) <= range)
}

// ---- building blocks ----

// Only pickaxe blocks are worth refusing to dig bare-handed; snow, dirt, leaves... are dug regardless of drops.
const PICKAXE_MATERIAL = /mineable\/pickaxe|^incorrect_for_/
const needsPickaxe = (block) => block.harvestTools && PICKAXE_MATERIAL.test(block.material)
const PICKAXE_TIERS = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']

// Lowest-tier pickaxe that can harvest the block, so the iron pickaxe is not worn out on plain stone.
function cheapestPickaxe(items, block) {
  const tier = (item) => PICKAXE_TIERS.indexOf(item.name)
  return items.filter(i => tier(i) >= 0 && block.canHarvest(i.type)).sort((a, b) => tier(a) - tier(b))[0] ?? null
}

function toolFor(bot, block) {
  const cheapest = PICKAXE_MATERIAL.test(block.material) ? cheapestPickaxe(bot.inventory.items(), block) : null
  return cheapest ?? bot.pathfinder.bestHarvestTool(block)
}

// The bot's own deposit chest must survive its stairs and tunnels.
const isHome = (bot, pos) => {
  const home = bot.objectiveRun?.home
  return home?.x === pos.x && home.y === pos.y && home.z === pos.z
}

async function breakBlock(bot, block) {
  if (isHome(bot, block.position)) throw new Fail('home')
  for (let tries = 0; tries < 5 && !OPEN.has(bot.blockAt(block.position)?.name); tries++) {
    checkCancelled(bot)
    const current = bot.blockAt(block.position)
    if (!current.diggable) throw new Fail('undiggable')
    const tool = toolFor(bot, current)
    if (tool) await guard(bot.equip(tool, 'hand'))
    if (needsPickaxe(current) && !current.canHarvest(bot.heldItem?.type)) throw new Fail('no_tool')
    await withTimeout(bot.dig(current, true), bot.digTime(current) * 2 + 1000, () => bot.stopDigging())
  }
  if (!OPEN.has(bot.blockAt(block.position)?.name)) throw new Fail('dig_failed')
}

// Goal height for collecting a drop: never above the bot's ground level, so the pathfinder cannot climb
// onto leaves to reach it. null when the drop is too far above to be collected from here.
function pickupGoalY(feetY, dropY) {
  return dropY - feetY > PICKUP_REACH_UP ? null : Math.floor(Math.min(dropY, feetY))
}

// A drop that could not be fetched once is skipped afterwards, so one stuck item does not fail every mine.
async function pickUpDrop(bot, pos) {
  const skipped = bot.skippedDrops ??= new Set()
  const dropNear = () => bot.nearestEntity(e => e.name === 'item' && !skipped.has(e.id) && e.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) < 3)
  await poll(bot, dropNear, 1000)
  const drop = dropNear()
  if (!drop) return
  const goalY = () => pickupGoalY(bot.entity.position.y, drop.position.y)
  await poll(bot, () => !bot.entities[drop.id] || goalY() !== null, 1000)
  if (!bot.entities[drop.id] || goalY() === null) return
  const start = bot.entity.position.clone()
  try {
    const gone = () => !bot.entities[drop.id]
    await goto(bot, new goals.GoalNear(drop.position.x, goalY(), drop.position.z, 1), 10000)
    if (!await poll(bot, gone, 1000)) { // one block away is sometimes just out of pickup range: step onto it
      await goto(bot, new goals.GoalNear(drop.position.x, goalY(), drop.position.z, 0), 5000)
      if (!await poll(bot, gone, 2000)) throw new Fail('pickup_failed')
    }
  } catch (e) {
    skipped.add(drop.id)
    if (!pickupStalled(bot, start, e)) return
    throw e
  }
}

// A failed pickup only counts when the bot went nowhere and no other drop is left to fetch; otherwise the planner moves on.
function pickupStalled(bot, start, e) {
  if (!(e instanceof Fail && e.reason === 'pickup_failed')) return true
  if (bot.entity.position.distanceTo(start) >= PICKUP_MOVED) return false
  return !bot.nearestEntity(x => x.name === 'item' && !bot.skippedDrops.has(x.id))
}

async function reach(bot, block, ms = PATH_MS, scaffold = false) {
  await goto(bot, new goals.GoalLookAtBlock(block.position, bot.world, { reach: 4 }), ms, scaffold)
}

// Plants and snow layers are replaced by the server, so any non-lava block without a hitbox is a free spot.
// Flower beds and leaf litter look the same but the server refuses to place into them.
const SEGMENTED = new Set(['pink_petals', 'wildflowers', 'leaf_litter'])
const REFUSED = /refused to place/i
const isFree = (block) => block !== null && block.boundingBox === 'empty' && !isLava(block) && !SEGMENTED.has(block.name)
const PLACE_FACES = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
const canHold = (bot, p) => isFree(bot.blockAt(p)) && !bot.refusedSpots?.has(p.toString()) && placeFace(bot, p) !== undefined

// Offset of a solid neighbour to place against, the block below preferred.
const placeFace = (bot, spot) => PLACE_FACES.find(f => isSolid(at(bot, spot, ...f)))

// Cells around the bot at feet, head and below-feet level (the last one after a dig down).
function placeSpot(bot, feet) {
  return [0, 1, -1].flatMap(dy => DIRS.map(([dx, dz]) => feet.offset(dx, dy, dz))).find(p => canHold(bot, p))
}

// Boxed in (1-wide tunnel): dig out a side wall at feet level.
async function digSpot(bot, feet) {
  const wall = DIRS.map(([dx, dz]) => bot.blockAt(feet.offset(dx, 0, dz)))
    .find(b => b?.diggable && !nearLava(bot, b.position))
  if (!wall) throw new Fail('no_space')
  await breakBlock(bot, wall)
  return wall.position
}

// False when the server refused this spot; it is remembered so it is not tried again.
// The item is equipped right before placing: digging a spot re-equips a pickaxe.
async function tryPlace(bot, spot, name) {
  const item = findItem(bot, name)
  if (!item) throw new Fail('missing')
  try {
    await guard(bot.equip(item, 'hand'))
    const face = placeFace(bot, spot)
    await guard(bot.placeBlock(at(bot, spot, ...face), { x: -face[0], y: -face[1], z: -face[2] }))
    return true
  } catch (e) {
    if (!REFUSED.test(e.message)) throw e
    bot.refusedSpots = (bot.refusedSpots ?? new Set()).add(spot.toString())
    return false
  }
}

async function placeFromInventory(bot, name) {
  if (!findItem(bot, name)) throw new Fail('missing')
  const feet = bot.entity.position.floored()
  for (let spot = placeSpot(bot, feet); spot; spot = placeSpot(bot, feet)) {
    if (await tryPlace(bot, spot, name)) return bot.blockAt(spot)
  }
  const dug = await digSpot(bot, feet)
  if (!await tryPlace(bot, dug, name)) throw new Fail('place_refused')
  return bot.blockAt(dug)
}

const STATION_BREAK_REACH = 4.5
const PLANK_NAMES = WOODS.map(w => `${w}_planks`)

// Own station that cannot be walked to: pick it up if it is within arm's reach, else make a new table from planks.
// Ends holding the item, or throws station_unreachable.
async function retrieveStation(bot, block, blockName) {
  const eye = bot.entity.position.offset(0, EYE_HEIGHT, 0)
  if (eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= STATION_BREAK_REACH) {
    try {
      await breakBlock(bot, block)
      await pickUpDrop(bot, block.position)
    } catch {
      checkCancelled(bot)
    }
  }
  const planks = PLANK_NAMES.reduce((n, name) => n + countItem(bot, name), 0)
  if (!findItem(bot, blockName) && blockName === 'crafting_table' && planks >= 4) await craft(bot, 'crafting_table')
  if (!findItem(bot, blockName)) throw new Fail('station_unreachable')
}

// Resolves { block, placed }. An existing station that cannot be reached is replaced by one from the inventory.
async function nearbyOrPlaced(bot, blockName) {
  const existing = bot.findBlock({ matching: blockId(bot, blockName), maxDistance: 16 })
  if (existing) {
    try {
      await reach(bot, existing, STATION_REACH_MS, true)
      return { block: existing, placed: false }
    } catch (e) {
      if (!(e instanceof Fail)) throw new Fail('station_unreachable')
      if (!findItem(bot, blockName)) await retrieveStation(bot, existing, blockName)
    }
  }
  const block = await placeFromInventory(bot, blockName)
  await reach(bot, block, PATH_MS, true)
  return { block, placed: true }
}

// Carry a station we placed ourselves underground. Best effort, whether or not the craft/smelt worked.
async function recoverStation(bot, station) {
  if (!station.placed) return
  try {
    const block = bot.blockAt(station.block.position)
    const tool = bot.pathfinder.bestHarvestTool(block) ?? bot.heldItem
    if (block.harvestTools && !block.canHarvest(tool?.type)) return
    await breakBlock(bot, block)
    await pickUpDrop(bot, block.position)
  } catch {}
}

// Staircase step toward dir: clear head, mid and feet blocks ahead, then drop one block.
function stairBlocks(p, [dx, dz]) {
  return [p.offset(dx, 1, dz), p.offset(dx, 0, dz), p.offset(dx, -1, dz)]
}

const FALLING = new Set(['gravel', 'sand', 'red_sand', 'suspicious_gravel', 'suspicious_sand'])
const DRIPSTONE = 'pointed_dripstone'
const DRIPSTONE_REACH = 3

// What can drop into a dug column from above: gravel or sand in its top cell or right over it (they bury or suffocate
// whoever stands below), or a stalactite within three blocks over it.
function fallHazard(bot, cells) {
  const top = cells.reduce((a, c) => (c.y > a.y ? c : a))
  const name = (dy) => bot.blockAt(top.offset(0, dy, 0))?.name
  if (FALLING.has(name(0)) || FALLING.has(name(1))) return 'gravel'
  return [0, 1, 2, 3].some(dy => name(dy) === DRIPSTONE) ? 'dripstone' : null
}

const lacksTool = (bot, block) => needsPickaxe(block) && !cheapestPickaxe(bot.inventory.items(), block)

// Why a staircase step toward dir cannot be taken: 'lava', 'water', 'gravel', 'dripstone', 'undiggable', 'no_tool', 'no_floor',
// or null when it can.
function stairRefusal(bot, p, dir) {
  const cells = stairBlocks(p, dir)
  if (cells.some(c => isHome(bot, c))) return 'home'
  if (cells.some(c => nearLava(bot, c))) return 'lava'
  if (cells.some(c => nearWater(bot, c))) return 'water'
  const hazard = fallHazard(bot, cells)
  if (hazard) return hazard
  if (cells.some(c => !(OPEN.has(bot.blockAt(c)?.name) || bot.blockAt(c)?.diggable))) return 'undiggable'
  if (cells.some(c => lacksTool(bot, bot.blockAt(c)))) return 'no_tool'
  return isSolid(at(bot, cells[2], 0, -1, 0)) ? null : 'no_floor'
}

const tunnelCells = (p, [dx, dz]) => [p.offset(dx, 1, dz), p.offset(dx, 0, dz)]
const tunnelSafe = (bot, cells) => !cells.some(c => isHome(bot, c) || nearLava(bot, c) || nearWater(bot, c)) && !fallHazard(bot, cells)

// A missing floor under the landing cell is bridged with a carried block; false when that is not possible.
async function floored(bot, landing) {
  return isSolid(at(bot, landing, 0, -1, 0)) || patched(bot, landing)
}

// Solid neighbours of the hole under a landing cell that a block can be placed against, minus faces that failed before.
function patchFaces(bot, spot) {
  return FACES.filter(f => f[1] !== 1 && isSolid(at(bot, spot, ...f)) && !bot.refusedFaces?.has(`${spot}|${f}`))
}

// False when this face failed (server refusal, timeout, or no block appeared); it is remembered so it is not retried.
async function placeAgainst(bot, spot, face, item) {
  try {
    await guard(bot.equip(item, 'hand'))
    await guard(bot.placeBlock(at(bot, spot, ...face), { x: -face[0], y: -face[1], z: -face[2] }))
    if (isSolid(bot.blockAt(spot))) return true
  } catch {}
  bot.refusedFaces = (bot.refusedFaces ?? new Set()).add(`${spot}|${face}`)
  return false
}

// Fills the hole under a landing cell from any solid neighbour of it. 'no_floor' when every face failed,
// so the caller can try another direction.
async function patchFloor(bot, landing) {
  const spot = landing.offset(0, -1, 0)
  const item = PATCH_BLOCKS.map(n => findItem(bot, n)).find(Boolean)
  if (!item) throw new Fail('no_floor')
  for (const face of patchFaces(bot, spot)) {
    checkCancelled(bot)
    if (await placeAgainst(bot, spot, face, item)) return
  }
  throw new Fail('no_floor')
}

// Standing on the ground (or swimming, when the cell is water) in the feet cell, near its centre.
function arrived(bot, feet) {
  const p = bot.entity.position
  const supported = bot.entity.onGround || (bot.entity.isInWater && bot.blockAt(feet)?.name === 'water')
  return Boolean(supported) && Math.floor(p.y) === feet.y && Math.hypot(p.x - feet.x - 0.5, p.z - feet.z - 0.5) < ARRIVE_DIST
}

// Within ~10 degrees of looking at the target horizontally; re-issuing lookAt every tick is wasted packets.
function facing(bot, target) {
  const p = bot.entity.position
  const yaw = Math.atan2(p.x - target.x, p.z - target.z)
  const turn = (bot.entity.yaw - yaw) % (2 * Math.PI)
  return Math.abs(turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn) < FACING_TOLERANCE
}

// Walks into an adjacent, already cleared cell by holding forward (pathfinder needs ~1 s to plan each step).
async function stepTo(bot, feet) {
  const center = feet.offset(0.5, 0, 0.5)
  bot.setControlState('sneak', false)
  for (let tick = 0; tick < STEP_TICKS && !arrived(bot, feet); tick++) {
    checkCancelled(bot)
    if (!facing(bot, center)) await guard(bot.lookAt(center, true))
    bot.setControlState('jump', feet.y > Math.floor(bot.entity.position.y))
    bot.setControlState('forward', true)
    await bot.waitForTicks(1)
  }
  bot.clearControlStates()
  return arrived(bot, feet)
}

async function moveTo(bot, feet) {
  if (bot.entity.position.distanceTo(feet.offset(0.5, 0, 0.5)) <= STEP_RANGE && await stepTo(bot, feet)) return
  await goto(bot, new goals.GoalBlock(feet.x, feet.y, feet.z), 10000)
}

// Breadcrumbs: floored cells the bot dug through, so it can walk back out of a mine that pathfinding cannot solve.
function noteTrail(bot) {
  const trail = bot.trail ??= []
  const here = bot.entity.position.floored()
  if (trail.at(-1)?.equals(here)) return
  trail.push(here)
  if (trail.length > TRAIL_MAX) trail.shift()
}

// Trail is only meaningful relative to home: it restarts whenever the bot is back there.
function resetTrail(bot, home) {
  const p = bot.entity?.position
  if (p && Math.hypot(p.x - home.x, p.y - home.y, p.z - home.z) < HOME_RESET) bot.trail = []
}

// A trail whose end is far from the bot (teleport, respawn, walked elsewhere) would send it the wrong way.
function resetStaleTrail(bot) {
  const last = bot.trail?.at(-1)
  if (last && bot.entity.position.distanceTo(last) > TRAIL_STALE) bot.trail = []
}

// A repeated cell means the bot went in a circle: cut everything between the two visits.
function dropLoops(trail) {
  const kept = []
  for (const p of trail) {
    const seen = kept.findIndex(q => q.equals(p))
    if (seen >= 0) kept.length = seen + 1
    else kept.push(p)
  }
  return kept
}

async function tunnelStep(bot, cells, feet) {
  checkCancelled(bot)
  noteTrail(bot)
  for (const c of cells) await breakBlock(bot, bot.blockAt(c))
  await moveTo(bot, feet)
  noteTrail(bot)
}

// The crumb straight above the feet: a 1x1 shaft has no ledge to walk up, so it is climbed on carried blocks.
function isShaftHop(bot, crumb) {
  const feet = bot.entity.position.floored()
  return crumb.x === feet.x && crumb.z === feet.z && crumb.y === feet.y + 1
}

// Cleared again on the way back because gravel or water may have filled the old tunnel.
async function retrace(bot, crumb) {
  checkCancelled(bot)
  const feet = bot.entity.position.floored()
  const cells = [crumb, crumb.offset(0, 1, 0)]
  if (crumb.y > feet.y) cells.push(feet.offset(0, 1, 0), feet.offset(0, 2, 0))
  for (const c of cells) await breakBlock(bot, bot.blockAt(c))
  await moveTo(bot, crumb)
}

// A crumb the pillar did not reach stays on the trail, so a later attempt (more blocks, another route) still knows the way.
async function climbShaftHop(bot, crumb) {
  await pillarUp(bot, crumb.y)
  if (Math.floor(bot.entity.position.y) >= crumb.y) return
  throw Object.assign(new Fail('not_reached', 'shaft crumb'), { kept: true })
}

// Walks the trail backwards until done(position); consumed crumbs are removed.
async function followTrail(bot, done) {
  const trail = bot.trail = dropLoops(bot.trail ?? [])
  while (trail.length && !done(bot.entity.position)) {
    checkCancelled(bot)
    const crumb = trail.at(-1)
    if (isShaftHop(bot, crumb)) await climbShaftHop(bot, crumb)
    else await retrace(bot, crumb)
    trail.pop()
  }
}

// ---- skills ----

// One 8-block surface hop; a blocked hop is retried to either side before the whole call gives up.
async function surfaceHop(bot, p, dir) {
  let failure
  for (const d of [dir, (dir + 1) % 4, (dir + 3) % 4]) {
    checkCancelled(bot)
    const [dx, dz] = DIRS[d]
    try {
      return await goto(bot, new goals.GoalNearXZ(p.x + dx * 8, p.z + dz * 8, 2), HOP_MS)
    } catch (e) {
      failure = e
    }
  }
  throw failure
}

async function explore(bot, { target, mode = 'branch', dir = 0, maxBlocks = 64, maxAbove = null }) {
  for (let moved = 0; moved < maxBlocks; moved += mode === 'surface' ? 8 : 1) {
    checkCancelled(bot)
    if (findVisible(bot, target, maxAbove)) return
    const p = bot.entity.position.floored()
    if (mode === 'surface') {
      await surfaceHop(bot, p, dir)
      continue
    }
    const cells = tunnelCells(p, DIRS[dir])
    if (!tunnelSafe(bot, cells)) throw new Fail('hazard')
    if (!await floored(bot, cells[1])) throw new Fail('no_floor')
    await tunnelStep(bot, cells, cells[1])
  }
  if (!findVisible(bot, target, maxAbove)) throw new Fail('not_found')
}

async function approach(bot, target) {
  const pos = target.position ?? target
  await goto(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 3))
}

const DIG_REASONS = new Set(['no_tool', 'undiggable', 'dig_failed'])

// A genuine failure blacklists the block, or the planner keeps choosing the same one (e.g. a high log).
// An interrupted run (attacked, drowning, timeout...) says nothing about the block.
async function mine(bot, name, maxAbove = null) {
  const block = findVisible(bot, name, maxAbove)
  if (!block) throw new Fail('not_visible')
  const attempt = async (reason, step) => {
    try {
      await step()
    } catch (e) {
      if (!currentCancel(bot)?.cancelled) bot.unreachable = (bot.unreachable ?? new Set()).add(block.position.toString())
      throw e instanceof Fail && DIG_REASONS.has(e.reason) ? e : new Fail(reason)
    }
  }
  await attempt('reach_failed', () => reach(bot, block))
  await attempt('dig_timeout', () => breakBlock(bot, block))
  await attempt('pickup_failed', () => pickUpDrop(bot, block.position))
}

// All four staircase directions refused: dig a short level tunnel to somewhere the staircase may work.
// Returns whether it moved at all.
async function tunnelOut(bot, dir) {
  let moved = false
  for (let i = 0; i < TUNNEL_OUT; i++) {
    checkCancelled(bot)
    const cells = tunnelCells(bot.entity.position.floored(), DIRS[dir])
    if (!tunnelSafe(bot, cells) || !await floored(bot, cells[1])) return moved
    await tunnelStep(bot, cells, cells[1])
    moved = true
  }
  return moved
}

// The first safe direction that lets the bot tunnel out; false when every one refuses.
async function tunnelAny(bot, p, options) {
  for (const o of options) {
    if (!tunnelSafe(bot, tunnelCells(p, DIRS[o.dir]))) continue
    if (await tunnelOut(bot, o.dir)) return true
  }
  return false
}

// Standing on leaves or a trunk: one block straight down gets off the canopy, unless lava is below.
function onCanopy(bot, p) {
  const floor = at(bot, p, 0, -1, 0)
  if (!floor || !CANOPY.test(floor.name)) return false
  return !nearLava(bot, floor.position) && !nearLava(bot, floor.position.offset(0, -1, 0))
}

// Breaks the block under the bot and waits to land. The bot is still on the ground right after the break,
// so it must first be seen falling before onGround means anything.
async function dropThrough(bot, floor) {
  const startY = bot.entity.position.y
  await breakBlock(bot, floor)
  await poll(bot, () => bot.entity.position.y < startY - FALL_SEEN, 1500)
  await poll(bot, () => bot.entity.onGround, 1500)
}

async function dropThroughCanopy(bot, p) {
  if (!onCanopy(bot, p)) return false
  await dropThrough(bot, at(bot, p, 0, -1, 0))
  return true
}

// Standing on a small pillar or ledge: the floor block, when solid ground is at most 2 blocks below it and no lava is near.
function ledgeFloor(bot, p) {
  const floor = at(bot, p, 0, -1, 0)
  if (!isSolid(floor) || !floor.diggable) return null
  const grounded = [-2, -3].some(dy => isSolid(at(bot, p, 0, dy, 0)))
  const lava = [-1, -2, -3].some(dy => nearLava(bot, p.offset(0, dy, 0)))
  return grounded && !lava ? floor : null
}

async function dropFromLedge(bot, p) {
  const floor = ledgeFloor(bot, p)
  if (!floor) return false
  await dropThrough(bot, floor)
  return true
}

// Takes the first workable staircase step (open ones, then ones whose missing floor can be patched).
// Returns the direction taken, or null when none worked.
async function stairStep(bot, p, options) {
  const patchable = PATCH_BLOCKS.some(n => findItem(bot, n))
  const candidates = [...options.filter(o => !o.reason), ...options.filter(o => o.reason === 'no_floor' && patchable)]
  for (const { dir, reason } of candidates) {
    const cells = stairBlocks(p, DIRS[dir])
    if (reason && !await patched(bot, cells[2])) continue
    await tunnelStep(bot, cells, cells[2])
    return dir
  }
  return null
}

async function patched(bot, landing) {
  try {
    await patchFloor(bot, landing)
    return true
  } catch (e) {
    if (e instanceof Fail && e.reason === 'no_floor') return false
    if (REFUSED.test(e.message)) return false
    throw e
  }
}

const mostCommon = (values) => {
  const tally = new Map()
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1)
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// Why a 1x1 shaft step cannot be taken: the floor block is removed and the bot drops one block onto the next one.
// The cells above the head, the floor and the two under it must be free of liquids and falling blocks.
function shaftRefusal(bot, p) {
  const [head, floor, next, deeper] = [1, -1, -2, -3].map(dy => p.offset(0, dy, 0))
  if ([head, p, floor, next, deeper].some(c => nearLava(bot, c))) return 'lava'
  if ([head, p, floor, next, deeper].some(c => nearWater(bot, c))) return 'water'
  const hazard = fallHazard(bot, [head])
  if (hazard) return hazard
  if (!isSolid(bot.blockAt(floor)) || !bot.blockAt(floor).diggable) return 'undiggable'
  if (lacksTool(bot, bot.blockAt(floor))) return 'no_tool'
  return isSolid(bot.blockAt(next)) ? null : 'no_floor'
}

// Digs straight down one block. False when the step is refused or did not descend, so the caller takes a staircase step.
// It also needs a block per level already descended (and the one about to be), or the bot could not pillar back out.
async function shaftStep(bot, p, startY, refusals) {
  const depth = Math.max(bot.objectiveRun?.surfaceY ?? startY, startY) - p.y
  const refusal = placeableCount(bot) < Math.max(SHAFT_MIN_BLOCKS, depth + 1) ? 'no_blocks' : nearestHostile(bot) ? 'hostile' : shaftRefusal(bot, p)
  if (refusal) {
    refusals[refusal] = (refusals[refusal] ?? 0) + 1
    return false
  }
  try {
    noteTrail(bot)
    await dropThrough(bot, at(bot, p, 0, -1, 0))
    noteTrail(bot)
  } catch {
    checkCancelled(bot)
  }
  return bot.entity.position.floored().y === p.y - 1
}

const shaftEnabled = (bot) => bot.objectiveRun?.params.shaft ?? true

async function digDown(bot, targetY) {
  resetStaleTrail(bot)
  const stats = bot.skillStats ??= {}
  const startY = Math.floor(bot.entity.position.y)
  let shaft = shaftEnabled(bot)
  let d = 0
  let tunnels = 0
  while (Math.floor(bot.entity.position.y) > targetY) {
    checkCancelled(bot)
    const p = bot.entity.position.floored()
    if (await dropThroughCanopy(bot, p)) continue
    if (shaft && bot.entity.onGround) {
      const health = bot.health
      if (await shaftStep(bot, p, startY, stats.refusals ??= {})) {
        stats.shaftSteps = (stats.shaftSteps ?? 0) + 1
        shaft = bot.health >= health // damage in a shaft: stairs for the rest of this call
        continue
      }
    }
    const options = [0, 1, 2, 3].map(i => (d + i) % 4).map(dir => ({ dir, reason: stairRefusal(bot, p, DIRS[dir]) }))
    const taken = await stairStep(bot, p, options)
    if (taken !== null) {
      d = taken
      stats.stairSteps = (stats.stairSteps ?? 0) + 1
      continue
    }
    if (options.every(o => o.reason === 'no_floor') && await dropFromLedge(bot, p)) continue
    const refusal = mostCommon(options.map(o => o.reason))
    if (tunnels >= MAX_TUNNEL_OUTS) throw new Fail('blocked', 'tunnel_limit')
    if (!await tunnelAny(bot, p, options)) throw new Fail('blocked', refusal)
    tunnels++
  }
}

// Jumps and places a carried block under the feet cell at the top of the jump. True once standing one level higher.
async function pillarStep(bot, feet, name) {
  bot.setControlState('jump', true)
  try {
    if (!await poll(bot, () => bot.entity.position.y >= feet.y + PILLAR_LIFT, 1000)) return false
    if (!await tryPlace(bot, feet, name)) return false
  } catch (e) {
    checkCancelled(bot) // a lost placement is just a failed step; a cancelled skill must stop
    return false
  } finally {
    bot.setControlState('jump', false)
  }
  return poll(bot, () => bot.entity.onGround && Math.floor(bot.entity.position.y) > feet.y, 1500)
}

// Clears the cells the head passes through during a jump; false when that is not possible (lava, bedrock).
async function clearAbove(bot, feet) {
  for (const dy of [2, 3]) {
    const cell = feet.offset(0, dy, 0)
    if (nearLava(bot, cell)) return false
    if (!isSolid(bot.blockAt(cell))) continue
    if (!bot.blockAt(cell).diggable) return false
    await breakBlock(bot, bot.blockAt(cell))
  }
  return true
}

// clearAbove where a dig that aborts or fails is a lost step (false); null when the way up is impossible.
async function clearedAbove(bot, feet) {
  try {
    return await clearAbove(bot, feet) ? true : null
  } catch (e) {
    checkCancelled(bot)
    return false
  }
}

// Straight up on carried blocks; gives up after PILLAR_FAILS steps in a row without progress.
async function pillarUp(bot, targetY) {
  let fails = 0
  while (Math.floor(bot.entity.position.y) < targetY && fails < PILLAR_FAILS) {
    checkCancelled(bot)
    const name = PLACEABLE.find(n => findItem(bot, n))
    if (!name) return
    const feet = bot.entity.position.floored()
    const cleared = await clearedAbove(bot, feet)
    if (cleared === null) return
    if (!cleared) {
      fails++
      continue
    }
    await guard(bot.look(bot.entity.yaw, -Math.PI / 2, true))
    fails = await pillarStep(bot, feet, name) ? 0 : fails + 1
  }
}

// Holds jump while the head is in water, so the bot swims up instead of sinking between path steps.
function swimAssist(bot) {
  let swimming = false
  const tick = () => {
    const wet = headWet(bot)
    if (wet || swimming) bot.setControlState('jump', wet)
    swimming = wet
  }
  bot.on('physicsTick', tick)
  return () => {
    bot.off('physicsTick', tick)
    if (swimming) bot.setControlState('jump', false)
  }
}

// A crumb that cannot be retraced is dropped so the scaffold and pillar fallbacks still get their turn.
async function followTrailSafely(bot, done) {
  try {
    await followTrail(bot, done)
  } catch (e) {
    checkCancelled(bot)
    if (!e.kept) bot.trail?.pop()
  }
}

async function goUp(bot, targetY) {
  const high = (p) => Math.floor(p.y) >= targetY
  const stopSwimming = swimAssist(bot)
  try {
    await followTrailSafely(bot, high)
    if (!high(bot.entity.position)) await goto(bot, new goals.GoalY(targetY), GO_UP_PATH_MS, true).catch(() => {})
    if (!high(bot.entity.position)) await pillarUp(bot, targetY)
  } finally {
    stopSwimming()
  }
  if (!high(bot.entity.position)) throw new Fail('not_reached')
  bot.trail = []
}

// Server recipe book: displayId -> result item. Sent at login and on every unlock, so this must be
// attached before the bot connects (createBot does it).
function trackRecipeBook(bot) {
  bot.recipeBook = new Map()
  bot._client.on('recipe_book_add', ({ entries, replace }) => {
    if (replace) bot.recipeBook.clear()
    for (const { recipe } of entries) {
      const { type, data } = recipe.display
      if (data?.result?.type !== 'item_stack') continue
      const fits2x2 = type === 'crafting_shaped' ? data.width <= 2 && data.height <= 2
        : type === 'crafting_shapeless' && data.ingredients.length <= 4
      bot.recipeBook.set(recipe.displayId, { itemId: data.result.data.itemId, fits2x2 })
    }
  })
  bot._client.on('recipe_book_remove', ({ recipeIds }) => recipeIds.forEach(id => bot.recipeBook.delete(id)))
}

// The server lays out the grid (like a vanilla client's recipe book), then the result is shift-clicked.
// mineflayer's bot.craft() clicks ingredients in by hand and loses clicks on 1.21.
// Paper drops place_recipe above 5/s by default, so requests are paced at 4/s and retried.
async function craftOnce(bot, window, displayIds, itemId) {
  for (let round = 0; round < 3; round++) {
    for (const recipeId of displayIds) {
      await bot.waitForTicks(5)
      bot._client.write('craft_recipe_request', { windowId: window.id, recipeId, makeAll: false })
      if (!await poll(bot, () => window.slots[0]?.type === itemId, 1000)) continue
      await guard(bot.clickWindow(0, 0, 1))
      await bot._syncWindow(window) // ponytail: private API; the shift-click result is server-authoritative
      return
    }
  }
  throw new Fail('craft_failed')
}

async function craft(bot, name, count = 1) {
  const item = bot.registry.itemsByName[name]
  if (!item) throw new Fail('unknown_item')
  const target = countItem(bot, name) + count
  // Ingredient availability comes from recipe data; execution goes through the recipe book.
  const recipe = bot.recipesFor(item.id, null, count, null)[0] ?? bot.recipesFor(item.id, null, count, true)[0]
  if (!recipe) throw new Fail('missing')
  const displayIds = [...bot.recipeBook]
    .filter(([, r]) => r.itemId === item.id && (r.fits2x2 || recipe.requiresTable))
    .map(([id]) => id)
  if (!displayIds.length) throw new Fail('recipe_locked')
  const station = recipe.requiresTable ? await nearbyOrPlaced(bot, 'crafting_table') : null
  try {
    await craftAt(bot, station, item, recipe, displayIds, count)
    await bot._syncWindow(bot.inventory)
    if (countItem(bot, name) < target) throw new Fail('craft_failed')
  } finally {
    if (station) await recoverStation(bot, station)
  }
}

async function craftAt(bot, station, item, recipe, displayIds, count) {
  const window = station ? await opened(bot.openBlock(station.block)) : bot.inventory
  try {
    for (let made = 0; made < count; made += recipe.result.count) await craftOnce(bot, window, displayIds, item.id)
  } finally {
    if (window !== bot.inventory) bot.closeWindow(window)
  }
}

async function smelt(bot, name) {
  const input = SMELTS[name]
  if (!input) throw new Fail('unknown_item')
  const fuel = FUELS.find(f => findItem(bot, f))
  if (!findItem(bot, input) || !fuel) throw new Fail('missing')
  const target = countItem(bot, name) + 1
  const station = await nearbyOrPlaced(bot, 'furnace')
  try {
    await smeltAt(bot, station, input, fuel)
    if (!await poll(bot, () => countItem(bot, name) >= target, 1000)) throw new Fail('smelt_failed')
  } finally {
    await recoverStation(bot, station)
  }
}

async function smeltAt(bot, station, input, fuel) {
  const furnace = await opened(bot.openFurnace(station.block))
  try {
    await guard(furnace.putFuel(findItem(bot, fuel).type, null, 1))
    await guard(furnace.putInput(findItem(bot, input).type, null, 1))
    if (!await poll(bot, () => furnace.outputItem(), 15000)) throw new Fail('timeout')
    await guard(furnace.takeOutput())
  } finally {
    furnace.close()
  }
}

async function equip(bot, name, destination = 'hand') {
  const item = findItem(bot, name)
  if (!item) throw new Fail('missing')
  await guard(bot.equip(item, destination))
}

async function eat(bot) {
  if (bot.food >= 20) throw new Fail('not_hungry')
  const food = bot.inventory.items().find(i => bot.registry.foodsByName[i.name])
  if (!food) throw new Fail('missing')
  await guard(bot.equip(food, 'hand'))
  await withTimeout(bot.consume(), 5000, () => bot.deactivateItem())
}

async function flee(bot) {
  const mob = nearestHostile(bot)
  if (!mob) return
  bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalFollow(mob, HOSTILE_RANGE + 4)), true)
  if (!await poll(bot, () => !nearestHostile(bot), 20000)) throw new Fail('timeout')
}

// Sword or axe, else a cheap pickaxe; null means bare hands (the good pickaxes are not worn out on animals).
const bestWeapon = (items) => WEAPONS.map(name => items.find(i => i.name === name)).find(Boolean) ?? null

function nearestAnimal(bot, range = ANIMAL_RANGE) {
  return bot.nearestEntity(e => FOOD_ANIMALS.has(e.name) && e.position.distanceTo(bot.entity.position) <= range)
}

// Follows a fleeing animal until it is within reach, then swings on the attack cooldown. Resolves whether it is chasing.
async function strike(bot, animal, chasing) {
  const near = bot.entity.position.distanceTo(animal.position) <= ATTACK_REACH
  if (near === chasing) bot.pathfinder.setGoal(near ? null : new goals.GoalFollow(animal, 2), true)
  if (!near) {
    await bot.waitForTicks(2)
    return true
  }
  await guard(bot.lookAt(animal.position.offset(0, animal.height * 0.7, 0)))
  bot.attack(animal)
  await bot.waitForTicks(ATTACK_TICKS)
  return false
}

async function arm(bot) {
  const weapon = bestWeapon(bot.inventory.items())
  await guard(weapon ? bot.equip(weapon, 'hand') : bot.unequip('hand'))
}

// Kills the nearest hostile that came within reach; ends when it is dead, out of range, or after ms.
// With the guard on, every swing re-picks the nearest hostile and gives up below FIGHT_MIN_HEALTH so the planner can flee.
async function fight(bot, ms = FIGHT_MS) {
  const first = nearestHostile(bot, FIGHT_RANGE)
  if (!first) throw new Fail('no_target')
  const guarded = bot.objectiveRun?.params?.fightGuard !== false
  const target = () => guarded ? nearestHostile(bot, FIGHT_RANGE)
    : bot.entities[first.id] && first.position.distanceTo(bot.entity.position) <= FIGHT_RANGE ? first : null
  await arm(bot)
  const end = Date.now() + ms
  let chasing = false
  let mob = first
  for (let next = target(); next && Date.now() < end; next = target()) {
    checkCancelled(bot)
    if (guarded && bot.health < FIGHT_MIN_HEALTH) throw new Fail('low_health')
    if (next !== mob) {
      mob = next
      chasing = false
      stopPathing(bot)
    }
    chasing = await strike(bot, mob, chasing)
  }
  stopPathing(bot)
  if (target()) throw new Fail('not_killed')
}

async function hunt(bot, ms = HUNT_MS) {
  const animal = nearestAnimal(bot)
  if (!animal) throw new Fail('no_animal')
  await arm(bot)
  const end = Date.now() + ms
  let last = animal.position.clone()
  let chasing = false
  while (bot.entities[animal.id] && Date.now() < end) {
    checkCancelled(bot)
    last = animal.position.clone()
    chasing = await strike(bot, animal, chasing)
  }
  stopPathing(bot)
  if (bot.entities[animal.id]) throw new Fail('not_killed')
  for (let i = 0; i < 2; i++) await pickUpDrop(bot, last.floored())
}

const placeableCount = (bot) => PLACEABLE.reduce((n, name) => n + countItem(bot, name), 0)

// Same range as the planner's danger check. Regeneration needs food >= 18, so a hungry bot gains nothing by waiting for health.
const safeToLeave = (bot) => !nearestHostile(bot) && (bot.health >= SAFE_HEALTH || bot.food < SAFE_FOOD)

// A missed placement (entity in the way, lag) just leaves the cell open for the next pass.
async function seal(bot, spot) {
  if (isSolid(bot.blockAt(spot))) return true
  if (!canHold(bot, spot)) return false
  try {
    return await tryPlace(bot, spot, PLACEABLE.find(n => findItem(bot, n)))
  } catch {
    return false
  }
}

// The roof has nothing to lean on until one block stands next to it at head height + 1.
async function sealRoof(bot, feet) {
  const roof = feet.offset(0, 2, 0)
  if (await seal(bot, roof)) return
  for (const [dx, dz] of DIRS) if (await seal(bot, feet.offset(dx, 2, dz))) return seal(bot, roof)
}

const isNight = (bot) => bot.time.timeOfDay >= NIGHT_START && bot.time.timeOfDay < NIGHT_END

// What a sealed bot waits for. `holds`: if the wait runs out without `done`, stay sealed instead of digging out.
const SHELTER_WAITS = {
  threat: { ms: SHELTER_WAIT_MS, done: safeToLeave },
  dawn: { ms: DAWN_WAIT_MS, done: (bot) => !isNight(bot), holds: true },
  rest: { ms: REST_MS, done: (bot) => bot.health >= REST_HEALTH },
}

const shelterCells = (feet) => [0, 1].flatMap(dy => DIRS.map(([dx, dz]) => feet.offset(dx, dy, dz)))
const sealed = (bot, feet) => [...shelterCells(feet), feet.offset(0, 2, 0)].every(c => isSolid(bot.blockAt(c)))

// Feet-level walls first: every head-level cell then has a wall block below it to lean on.
async function wall(bot, feet) {
  for (let pass = 0; pass < 2 && !sealed(bot, feet); pass++) {
    for (const cell of shelterCells(feet)) {
      checkCancelled(bot)
      await seal(bot, cell)
    }
    await sealRoof(bot, feet)
    bot.refusedSpots?.clear()
  }
}

async function openSide(bot, feet, dir) {
  for (const d of [0, 1, 2, 3].map(i => (dir + i) % 4)) {
    const cells = tunnelCells(feet, DIRS[d])
    if (cells.some(c => nearLava(bot, c) || !bot.blockAt(c)?.diggable)) continue
    for (const c of cells) await breakBlock(bot, bot.blockAt(c))
    return
  }
  throw new Fail('no_exit')
}

// Walls the bot into a 1x1x2 cell, waits (`until`: 'threat' = the danger passes, 'dawn', 'rest' = health back),
// then digs out toward dir (any side if that one is unsafe).
async function shelter(bot, dir = 0, until = 'threat') {
  if (placeableCount(bot) < SHELTER_MIN) return flee(bot)
  const feet = bot.entity.position.floored()
  await wall(bot, feet)
  if (!sealed(bot, feet)) throw new Fail('not_sealed')
  const wait = SHELTER_WAITS[until]
  const done = await poll(bot, () => wait.done(bot), wait.ms)
  if (wait.holds && !done) return
  await openSide(bot, feet, dir)
  if (nearestHostile(bot)) throw new Fail('hostile_waiting')
}

// The stored home is gone or unreachable: a carried chest placed here becomes the new home.
async function adoptChest(bot) {
  const { x, y, z } = (await placeFromInventory(bot, 'chest')).position
  if (bot.objectiveRun) bot.objectiveRun.home = { x, y, z }
}

async function deposit(bot, { x, y, z }, items = ['diamond']) {
  const chestBlock = bot.blockAt(bot.entity.position.clone().set(x, y, z)) // plain {x,y,z} → Vec3
  if (chestBlock?.name !== 'chest') {
    if (!findItem(bot, 'chest')) throw new Fail('no_chest')
    return adoptChest(bot) // the next decision deposits into it
  }
  await reach(bot, chestBlock)
  const chest = await opened(bot.openContainer(chestBlock))
  let full = false
  try {
    for (const name of items) {
      const item = bot.registry.itemsByName[name]
      const n = countItem(bot, name)
      const fits = Math.min(n, freeSpace(chest, item))
      if (fits > 0) await guard(chest.deposit(item.id, null, fits))
      full ||= fits < n
    }
  } finally {
    chest.close()
  }
  if (full) {
    bot.chat('Storage chest is full.')
    throw new Fail('full')
  }
}

// Checked up front: a transfer into a full chest desyncs mineflayer's inventory instead of failing.
function freeSpace(window, item) {
  return window.slots.slice(0, window.inventoryStart).reduce((free, slot) => {
    if (!slot) return free + item.stackSize
    return slot.type === item.id ? free + item.stackSize - slot.count : free
  }, 0)
}

// Drops stacks until each named item is down to `keep` in total.
// Underground it also holds back one placeable block per level below the surface, the price of pillaring out.
async function toss(bot, names, keep = 16) {
  const surfaceY = bot.objectiveRun?.surfaceY
  const depth = surfaceY === undefined ? 0 : Math.max(surfaceY - Math.floor(bot.entity.position.y), 0)
  for (const name of names) {
    const spare = PLACEABLE.includes(name) ? placeableCount(bot) - depth : Infinity
    let excess = Math.min(countItem(bot, name) - keep, spare)
    for (const item of bot.inventory.items().filter(i => i.name === name)) {
      if (excess <= 0) break
      const n = Math.min(item.count, excess)
      await withTimeout(bot.toss(item.type, null, n), TOSS_MS, () => {})
      excess -= n
    }
  }
}

// Buried in a block (falling gravel, a collapsed tunnel): dig the head cell open. Best effort.
async function freeHead(bot) {
  const head = bot.blockAt(bot.entity.position.floored().offset(0, 1, 0))
  if (!isSolid(head) || !head.diggable) return
  try {
    await breakBlock(bot, head)
  } catch {}
}

const MAX_HOME_FAILS = 2
const UNREACHABLE = new Set(['no_path', 'timeout', 'not_reached'])

async function returnHome(bot, home) {
  const nearHome = (p) => Math.hypot(p.x - home.x, p.z - home.z) <= HOME_RANGE && p.y >= home.y - HOME_SLACK
  await followTrail(bot, nearHome)
  const ms = nearHome(bot.entity.position) ? HOME_MS : FAR_HOME_MS
  const memory = bot.objectiveRun?.memory ?? {}
  try {
    await goto(bot, new goals.GoalNear(home.x, home.y, home.z, 3), ms)
    memory.homeFails = 0
  } catch (e) {
    if (!(e instanceof Fail && UNREACHABLE.has(e.reason))) throw e
    memory.homeFails = (memory.homeFails ?? 0) + 1
    if (memory.homeFails < MAX_HOME_FAILS || !findItem(bot, 'chest')) throw e
    memory.homeFails = 0
    await adoptChest(bot)
  }
}

const SKILLS = {
  explore, approach, mine, dig_down: digDown, go_up: goUp, craft, smelt,
  equip, eat, flee, shelter, fight, hunt, deposit, toss, return_home: returnHome,
}

// ---- skill log: one JSON line per call, read by the Phase 3 recorder ----

function snapshot(bot) {
  const p = bot.entity?.position
  const inv = {}
  for (const i of bot.inventory.items()) inv[i.name] = (inv[i.name] ?? 0) + i.count
  return { pos: p ? [p.x, p.y, p.z] : null, health: bot.health, food: bot.food, time: bot.time.timeOfDay, inv }
}

const logArg = (arg) => (arg?.id !== undefined && arg.position ? { entity: arg.name, id: arg.id } : arg)

function logSkill(bot, entry) {
  if (!bot.skillLogPath) return
  fs.mkdirSync(path.dirname(bot.skillLogPath), { recursive: true })
  fs.appendFileSync(bot.skillLogPath, JSON.stringify(entry) + '\n')
}

// Every skill resolves to { ok, reason, ticks } and never throws.
async function runSkill(bot, name, ...args) {
  const before = snapshot(bot)
  const { damage, ...result } = await run(bot, () => SKILLS[name](bot, ...args), !NON_INTERRUPTIBLE.has(name), ESCAPES.has(name))
  if (result.reason === 'suffocating') await freeHead(bot)
  logSkill(bot, { t: Date.now(), bot: bot.username, run: bot.runTag ?? null, skill: name, args: args.map(logArg), result, ...(damage && { damage }), before, after: snapshot(bot) })
  return result
}

module.exports = { run, isDrowning, ownOxygen, skillCapMs, pickupStalled, Fail, checkCancelled, clearUnreachable, FIGHT_MIN_HEALTH, runSkill, SKILLS, findVisible, trackRecipeBook, stopPathing, cheapestPickaxe, stairRefusal, tunnelSafe, arrived, dropLoops, resetTrail, placeSpot, placeFace, pickupGoalY, onCanopy, mostCommon, resetStaleTrail, facing, damageCause, patchFaces, ledgeFloor, skillMovements, scaffoldMovements, pickUpDrop, retrieveStation, floored, placeableCount, safeToLeave, sealed, isNight, SHELTER_WAITS, SHELTER_MIN, FIGHT_RANGE, nearestHostile, bestWeapon, nearestAnimal, breakBlock, MAX_TUNNEL_OUTS }
