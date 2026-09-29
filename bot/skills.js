const fs = require('node:fs')
const path = require('node:path')
const { goals } = require('mineflayer-pathfinder')

const PATH_MS = 30000
const OPEN_MS = 10000
const TOSS_MS = 5000
const STATION_REACH_MS = 8000
const HOP_MS = 12000
const SKILL_CAP_MS = 180000
const OPEN = new Set(['air', 'cave_air', 'void_air', 'water'])
const LAVA = new Set(['lava', 'flowing_lava'])
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const SMELTS = { iron_ingot: 'raw_iron', gold_ingot: 'raw_gold', copper_ingot: 'raw_copper' }
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']
const FUELS = ['coal', 'charcoal', ...WOODS.map(w => `${w}_planks`), ...WOODS.map(w => `${w}_log`)]
const HOSTILE_RANGE = 16
const ATTACK_RANGE = 6

class Fail extends Error {
  constructor(reason) { super(reason); this.reason = reason }
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

// Window opens can hang forever on a lost packet.
const opened = (promise) => withTimeout(promise, OPEN_MS, () => {})

async function goto(bot, goal, ms = PATH_MS) {
  try {
    await withTimeout(bot.pathfinder.goto(goal), ms, () => stopPathing(bot))
  } catch (e) {
    throw e instanceof Fail ? e : new Fail('no_path')
  }
}

async function poll(bot, fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await bot.waitForTicks(2)
  }
  return fn()
}

// A skill is aborted when a hostile hurts the bot, so the planner can react (flee) instead of
// finishing a 30 s walk while being hit. flee/eat are not interruptible.
async function run(bot, skill, interruptible) {
  let ticks = 0
  let attacked = false
  let lastHealth = bot.health
  const tick = () => { ticks++ }
  const onHealth = () => {
    const hurt = bot.health < lastHealth
    lastHealth = bot.health
    if (!interruptible || attacked || !hurt || !nearestHostile(bot, ATTACK_RANGE)) return
    attacked = true
    stopPathing(bot)
    bot.stopDigging()
  }
  bot.on('physicsTick', tick)
  bot.on('health', onHealth)
  try {
    await withTimeout(skill(), SKILL_CAP_MS, () => { stopPathing(bot); bot.stopDigging() })
    return { ok: true, reason: null, ticks }
  } catch (e) {
    if (attacked) return { ok: false, reason: 'attacked', ticks }
    if (e instanceof Fail) return { ok: false, reason: e.reason, ticks }
    return { ok: false, reason: 'error', detail: e.message, ticks }
  } finally {
    bot.off('physicsTick', tick)
    bot.off('health', onHealth)
    stopPathing(bot)
  }
}

// ---- world queries ----

const at = (bot, pos, dx = 0, dy = 0, dz = 0) => bot.blockAt(pos.offset(dx, dy, dz))
const countItem = (bot, name) => bot.inventory.items().filter(i => i.name === name).reduce((n, i) => n + i.count, 0)
const findItem = (bot, name) => bot.inventory.items().find(i => i.name === name)
const isLava = (block) => block !== null && LAVA.has(block.name)
const nearLava = (bot, pos) => isLava(bot.blockAt(pos)) || FACES.some(f => isLava(at(bot, pos, ...f)))
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
const needsPickaxe = (block) => block.harvestTools && /mineable\/pickaxe|^incorrect_for_/.test(block.material)

async function breakBlock(bot, block) {
  for (let tries = 0; tries < 5 && !OPEN.has(bot.blockAt(block.position)?.name); tries++) {
    const current = bot.blockAt(block.position)
    if (!current.diggable) throw new Fail('undiggable')
    const tool = bot.pathfinder.bestHarvestTool(current)
    if (tool) await bot.equip(tool, 'hand')
    if (needsPickaxe(current) && !current.canHarvest(bot.heldItem?.type)) throw new Fail('no_tool')
    await withTimeout(bot.dig(current, true), bot.digTime(current) * 2 + 1000, () => bot.stopDigging())
  }
  if (!OPEN.has(bot.blockAt(block.position)?.name)) throw new Fail('dig_failed')
}

async function pickUpDrop(bot, pos) {
  const dropNear = () => bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) < 3)
  await poll(bot, dropNear, 1000)
  const drop = dropNear()
  if (!drop) return
  const p = drop.position.floored()
  await goto(bot, new goals.GoalBlock(p.x, p.y, p.z), 10000)
  if (!await poll(bot, () => !bot.entities[drop.id], 3000)) throw new Fail('pickup_failed')
}

async function reach(bot, block, ms = PATH_MS) {
  await goto(bot, new goals.GoalLookAtBlock(block.position, bot.world, { reach: 4 }), ms)
}

// Plants and snow layers are replaced by the server, so any non-lava block without a hitbox is a free spot.
const isFree = (block) => block !== null && block.boundingBox === 'empty' && !isLava(block)
const canHold = (bot, p) => isFree(bot.blockAt(p)) && isSolid(at(bot, p, 0, -1, 0))

// Cells around the bot at feet, head and below-feet level (the last one after a dig down).
function placeSpot(bot, feet) {
  return [0, 1, -1].flatMap(dy => DIRS.map(([dx, dz]) => feet.offset(dx, dy, dz))).find(p => canHold(bot, p))
}

// Boxed in (1-wide tunnel): dig out a side wall at feet level.
async function digSpot(bot, feet) {
  const wall = DIRS.map(([dx, dz]) => bot.blockAt(feet.offset(dx, 0, dz)))
    .find(b => b?.diggable && !nearLava(bot, b.position) && isSolid(at(bot, b.position, 0, -1, 0)))
  if (!wall) throw new Fail('no_space')
  await breakBlock(bot, wall)
  return wall.position
}

async function placeFromInventory(bot, name) {
  const item = findItem(bot, name)
  if (!item) throw new Fail('missing')
  const feet = bot.entity.position.floored()
  const spot = placeSpot(bot, feet) ?? await digSpot(bot, feet)
  await bot.equip(item, 'hand')
  await bot.placeBlock(at(bot, spot, 0, -1, 0), { x: 0, y: 1, z: 0 })
  return bot.blockAt(spot)
}

// Resolves { block, placed }. An existing station that cannot be reached is replaced from inventory.
async function nearbyOrPlaced(bot, blockName) {
  const existing = bot.findBlock({ matching: blockId(bot, blockName), maxDistance: 16 })
  if (existing) {
    try {
      await reach(bot, existing, STATION_REACH_MS)
      return { block: existing, placed: false }
    } catch (e) {
      if (!(e instanceof Fail) || !findItem(bot, blockName)) throw new Fail('station_unreachable')
    }
  }
  const block = await placeFromInventory(bot, blockName)
  await reach(bot, block)
  return { block, placed: true }
}

// Carry a station we placed ourselves underground. The craft/smelt already succeeded, so failing here is harmless.
async function recoverStation(bot, station) {
  if (!station.placed) return
  const block = bot.blockAt(station.block.position)
  const tool = bot.pathfinder.bestHarvestTool(block) ?? bot.heldItem
  if (block.harvestTools && !block.canHarvest(tool?.type)) return
  try {
    await breakBlock(bot, block)
    await pickUpDrop(bot, block.position)
  } catch {}
}

// Staircase step toward dir: clear head, mid and feet blocks ahead, then drop one block.
function stairBlocks(p, [dx, dz]) {
  return [p.offset(dx, 1, dz), p.offset(dx, 0, dz), p.offset(dx, -1, dz)]
}

function stairSafe(bot, p, dir) {
  const cells = stairBlocks(p, dir)
  if (cells.some(c => nearLava(bot, c) || !(OPEN.has(bot.blockAt(c)?.name) || bot.blockAt(c)?.diggable))) return false
  const floor = at(bot, cells[2], 0, -1, 0)
  return isSolid(floor) && !nearLava(bot, floor.position)
}

async function tunnelStep(bot, cells, feet) {
  for (const c of cells) await breakBlock(bot, bot.blockAt(c))
  await goto(bot, new goals.GoalBlock(feet.x, feet.y, feet.z), 10000)
}

// ---- skills ----

// One 8-block surface hop; a blocked hop is retried to either side before the whole call gives up.
async function surfaceHop(bot, p, dir) {
  let failure
  for (const d of [dir, (dir + 1) % 4, (dir + 3) % 4]) {
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
  const [dx, dz] = DIRS[dir]
  for (let moved = 0; moved < maxBlocks; moved += mode === 'surface' ? 8 : 1) {
    if (findVisible(bot, target, maxAbove)) return
    const p = bot.entity.position.floored()
    if (mode === 'surface') {
      await surfaceHop(bot, p, dir)
      continue
    }
    const ahead = p.offset(dx, 0, dz)
    const cells = [ahead.offset(0, 1, 0), ahead]
    if (cells.some(c => nearLava(bot, c)) || !isSolid(at(bot, ahead, 0, -1, 0))) throw new Fail('hazard')
    await tunnelStep(bot, cells, ahead)
  }
  if (!findVisible(bot, target, maxAbove)) throw new Fail('not_found')
}

async function approach(bot, target) {
  const pos = target.position ?? target
  await goto(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 3))
}

const DIG_REASONS = new Set(['no_tool', 'undiggable', 'dig_failed'])

// Any failure blacklists the block, or the planner keeps choosing the same one (e.g. a high log).
async function mine(bot, name, maxAbove = null) {
  const block = findVisible(bot, name, maxAbove)
  if (!block) throw new Fail('not_visible')
  const attempt = async (reason, step) => {
    try {
      await step()
    } catch (e) {
      bot.unreachable = (bot.unreachable ?? new Set()).add(block.position.toString())
      throw e instanceof Fail && DIG_REASONS.has(e.reason) ? e : new Fail(reason)
    }
  }
  await attempt('reach_failed', () => reach(bot, block))
  await attempt('dig_timeout', () => breakBlock(bot, block))
  await attempt('pickup_failed', () => pickUpDrop(bot, block.position))
}

async function digDown(bot, targetY) {
  let d = 0
  while (Math.floor(bot.entity.position.y) > targetY) {
    const p = bot.entity.position.floored()
    const next = [0, 1, 2, 3].map(i => (d + i) % 4).find(i => stairSafe(bot, p, DIRS[i]))
    if (next === undefined) throw new Fail('blocked')
    d = next
    const cells = stairBlocks(p, DIRS[d])
    await tunnelStep(bot, cells, cells[2])
  }
}

async function goUp(bot, targetY) {
  await goto(bot, new goals.GoalY(targetY), 120000)
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
      await bot.clickWindow(0, 0, 1)
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
  const window = station ? await opened(bot.openBlock(station.block)) : bot.inventory
  try {
    for (let made = 0; made < count; made += recipe.result.count) await craftOnce(bot, window, displayIds, item.id)
  } finally {
    if (window !== bot.inventory) bot.closeWindow(window)
  }
  await bot._syncWindow(bot.inventory)
  if (countItem(bot, name) < target) throw new Fail('craft_failed')
  if (station) await recoverStation(bot, station)
}

async function smelt(bot, name) {
  const input = SMELTS[name]
  if (!input) throw new Fail('unknown_item')
  const fuel = FUELS.find(f => findItem(bot, f))
  if (!findItem(bot, input) || !fuel) throw new Fail('missing')
  const target = countItem(bot, name) + 1
  const station = await nearbyOrPlaced(bot, 'furnace')
  const furnace = await opened(bot.openFurnace(station.block))
  try {
    await furnace.putFuel(findItem(bot, fuel).type, null, 1)
    await furnace.putInput(findItem(bot, input).type, null, 1)
    if (!await poll(bot, () => furnace.outputItem(), 15000)) throw new Fail('timeout')
    await furnace.takeOutput()
  } finally {
    furnace.close()
  }
  if (!await poll(bot, () => countItem(bot, name) >= target, 1000)) throw new Fail('smelt_failed')
  await recoverStation(bot, station)
}

async function equip(bot, name, destination = 'hand') {
  const item = findItem(bot, name)
  if (!item) throw new Fail('missing')
  await bot.equip(item, destination)
}

async function eat(bot) {
  if (bot.food >= 20) throw new Fail('not_hungry')
  const food = bot.inventory.items().find(i => bot.registry.foodsByName[i.name])
  if (!food) throw new Fail('missing')
  await bot.equip(food, 'hand')
  await withTimeout(bot.consume(), 5000, () => bot.deactivateItem())
}

async function flee(bot) {
  const mob = nearestHostile(bot)
  if (!mob) return
  bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalFollow(mob, HOSTILE_RANGE + 4)), true)
  if (!await poll(bot, () => !nearestHostile(bot), 20000)) throw new Fail('timeout')
}

async function deposit(bot, { x, y, z }, items = ['diamond']) {
  const chestBlock = bot.blockAt(bot.entity.position.clone().set(x, y, z)) // plain {x,y,z} → Vec3
  if (chestBlock?.name !== 'chest') throw new Fail('no_chest')
  await reach(bot, chestBlock)
  const chest = await opened(bot.openContainer(chestBlock))
  let full = false
  try {
    for (const name of items) {
      const item = bot.registry.itemsByName[name]
      const n = countItem(bot, name)
      const fits = Math.min(n, freeSpace(chest, item))
      if (fits > 0) await chest.deposit(item.id, null, fits)
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
async function toss(bot, names, keep = 16) {
  for (const name of names) {
    let excess = countItem(bot, name) - keep
    for (const item of bot.inventory.items().filter(i => i.name === name)) {
      if (excess <= 0) break
      const n = Math.min(item.count, excess)
      await withTimeout(bot.toss(item.type, null, n), TOSS_MS, () => {})
      excess -= n
    }
  }
}

async function returnHome(bot, home) {
  await goto(bot, new goals.GoalNear(home.x, home.y, home.z, 3), 120000)
}

const SKILLS = {
  explore, approach, mine, dig_down: digDown, go_up: goUp, craft, smelt,
  equip, eat, flee, deposit, toss, return_home: returnHome,
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
  const result = await run(bot, () => SKILLS[name](bot, ...args), !['flee', 'eat'].includes(name))
  logSkill(bot, { t: Date.now(), bot: bot.username, run: bot.runTag ?? null, skill: name, args: args.map(logArg), result, before, after: snapshot(bot) })
  return result
}

module.exports = { runSkill, SKILLS, findVisible, trackRecipeBook, stopPathing }
