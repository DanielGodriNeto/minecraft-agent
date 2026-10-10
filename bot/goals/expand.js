// Goal expander: backward chaining over goals.json + minecraft-data recipes. Pure; durability not modeled.
// expand(item, count, inventory{name:count}, registry?) -> [{ action, item, count, needs, ... }] in execution order.
// needs = prerequisites that are used but not consumed (station, tool, fuel). Surplus crafted items are reused.
const mcData = require('minecraft-data')
const defaultRegistry = require('./goals.json')

class ExpandError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ExpandError'
    this.code = code
  }
}

const dataCache = new Map()
const dataFor = version => {
  if (!dataCache.has(version)) dataCache.set(version, mcData(version))
  return dataCache.get(version)
}

function makeContext(registry) {
  const md = dataFor(registry.mcVersion)
  const classes = Object.entries(registry.classes) // [class, suffix]: any oak_planks/birch_planks counts as 'planks'
  const canon = name => classes.find(([, suffix]) => name.endsWith(suffix))?.[0] ?? name
  const tierOf = name => registry.tiers.indexOf(name.split('_')[0])
  return { registry, md, classes, canon, tierOf }
}

const clone = st => ({ inv: { ...st.inv }, provided: new Set(st.provided), steps: [...st.steps] })
const adopt = (st, from) => Object.assign(st, from)

function hasTool(ctx, st, toolMin) {
  const [tier, ...kind] = toolMin.split('_')
  const need = ctx.registry.tiers.indexOf(tier)
  return ctx.registry.tiers.some((t, i) => i >= need && (st.provided.has(`${t}_${kind.join('_')}`) || (st.inv[`${t}_${kind.join('_')}`] ?? 0) > 0))
}

function ensureTool(ctx, st, toolMin, stack) {
  if (!toolMin || hasTool(ctx, st, toolMin)) return
  need(ctx, st, toolMin, 1, stack)
  st.provided.add(toolMin)
}

function ensureStation(ctx, st, station, stack) {
  if (st.provided.has(station) || (st.inv[station] ?? 0) > 0) return
  need(ctx, st, station, 1, stack)
  st.provided.add(station)
}

function need(ctx, st, rawItem, count, stack) {
  const item = ctx.canon(rawItem)
  if (stack.includes(item)) throw new ExpandError('cycle', `cycle: ${[...stack, item].join(' -> ')}`)
  const take = Math.min(st.inv[item] ?? 0, count)
  st.inv[item] = (st.inv[item] ?? 0) - take
  if (count > take) produce(ctx, st, item, count - take, [...stack, item])
}

function produce(ctx, st, item, count, stack) {
  const source = ctx.registry.goals[item]?.source ?? { craft: 'auto' }
  if (source.collect_wood) return void st.steps.push({ action: 'collect_wood', item, count, needs: [] })
  if (source.mine) return produceMine(ctx, st, item, count, source, stack)
  if (source.smelt) return produceSmelt(ctx, st, item, count, source, stack)
  return produceCraft(ctx, st, item, count, stack)
}

function produceMine(ctx, st, item, count, source, stack) {
  ensureTool(ctx, st, source.tool_min, stack)
  st.steps.push({ action: 'mine', item, count, needs: source.tool_min ? [source.tool_min] : [], block: source.mine })
}

function produceSmelt(ctx, st, item, count, source, stack) {
  const { fuel } = ctx.registry
  const inputSource = ctx.registry.goals[source.smelt]?.source
  if (inputSource?.mine) ensureTool(ctx, st, inputSource.tool_min, stack) // gear up before building the furnace
  ensureStation(ctx, st, 'furnace', stack)
  need(ctx, st, source.smelt, count, stack)
  need(ctx, st, fuel.item, Math.ceil(count / fuel.smelts), stack)
  st.steps.push({ action: 'smelt', item, count, needs: ['furnace', fuel.item], input: source.smelt })
}

function recipeShape(ctx, recipe) {
  const cells = (recipe.inShape ?? []).flat().filter(id => id != null)
  const ids = recipe.inShape ? cells : recipe.ingredients.map(i => (typeof i === 'object' ? i.id : i))
  const ingredients = {}
  for (const id of ids) {
    const name = ctx.canon(ctx.md.items[id].name)
    ingredients[name] = (ingredients[name] ?? 0) + 1
  }
  const rows = recipe.inShape?.length ?? 0
  const cols = Math.max(0, ...(recipe.inShape ?? []).map(r => r.length))
  const big = recipe.inShape ? rows > 2 || cols > 2 : ids.length > 4
  return { ingredients, big, yields: recipe.result.count }
}

function uniqueRecipes(ctx, item) {
  const rep = ctx.classes.find(([cls]) => cls === item) ? `oak${ctx.classes.find(([cls]) => cls === item)[1]}` : item
  const recipes = ctx.md.recipes[ctx.md.itemsByName[rep]?.id]
  if (!recipes?.length) throw new ExpandError('missing', `no recipe or source for ${item}`)
  const seen = new Map()
  for (const r of recipes) {
    const shape = recipeShape(ctx, r)
    seen.set(JSON.stringify([Object.entries(shape.ingredients).sort(), shape.big, shape.yields]), shape)
  }
  return [...seen.values()]
}

function produceCraft(ctx, st, item, count, stack) {
  let best = null
  let firstError = null
  for (const shape of uniqueRecipes(ctx, item)) {
    const trial = clone(st)
    try {
      applyRecipe(ctx, trial, item, count, shape, stack)
    } catch (e) {
      if (!(e instanceof ExpandError)) throw e
      firstError ??= e
      continue
    }
    if (!best || trial.steps.length < best.steps.length) best = trial
  }
  if (!best) throw firstError
  adopt(st, best)
}

function applyRecipe(ctx, st, item, count, shape, stack) {
  const runs = Math.ceil(count / shape.yields)
  if (shape.big) ensureStation(ctx, st, 'crafting_table', stack)
  for (const [ingredient, n] of Object.entries(shape.ingredients)) need(ctx, st, ingredient, n * runs, stack)
  const made = runs * shape.yields
  st.inv[item] = (st.inv[item] ?? 0) + (made - count)
  st.steps.push({ action: 'craft', item, count: made, needs: shape.big ? ['crafting_table'] : [], ingredients: Object.fromEntries(Object.entries(shape.ingredients).map(([k, n]) => [k, n * runs])) })
}

function normalizeInventory(ctx, inventory) {
  const inv = {}
  for (const [name, n] of Object.entries(inventory)) inv[ctx.canon(name)] = (inv[ctx.canon(name)] ?? 0) + n
  for (const [name, n] of Object.entries(inventory)) inv[name] = n // keep exact names for tool and station lookups
  return inv
}

function hoistWood(steps) {
  const wood = steps.filter(s => s.action === 'collect_wood')
  if (wood.length < 2) return steps
  const merged = { ...wood[0], count: wood.reduce((n, s) => n + s.count, 0) }
  return [merged, ...steps.filter(s => s.action !== 'collect_wood')]
}

function expand(item, count, inventory, registry = defaultRegistry) {
  if (!registry.goals[item]) throw new ExpandError('unknown_goal', `unknown goal: ${item}`)
  const wanted = count === 'max' ? 1 : count // 'max' = bootstrap for one; the mining loop keeps going
  if (!Number.isInteger(wanted) || wanted < 1) throw new ExpandError('bad_count', `count must be a positive integer or 'max', got ${count}`)
  const ctx = makeContext(registry)
  const st = { inv: normalizeInventory(ctx, inventory), provided: new Set(), steps: [] }
  need(ctx, st, item, wanted, [])
  return hoistWood(st.steps)
}

module.exports = { expand, ExpandError }
