// LONGRUN mode (switch LONGRUN=1, param longrun): pure helpers. Deaths and the first stuck detections are not terminal.
const MAX_ESCALATIONS = 6 // consecutive stuck escalations with no progress in between; the next stuck detection ends the run
const PROGRESS_MOVE = 30 // blocks moved since the previous escalation that count as progress
const MAX_LEVEL = 3
const GEAR_INTERVAL_MIN = 15
const HOP_BLOCKS = 16 // level 3 underground: one tunnel hop
const SURFACE_BLOCKS = 64 // level 3 on the surface side: one surface walk

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

const newHistory = () => ({ count: 0, last: null, total: 0, levels: { 1: 0, 2: 0, 3: 0 } })

// history: newHistory() result (not mutated); snapshot: { pos: {x,y,z}, inv: string } taken at this stuck detection.
// Resolves { end: true, history } after MAX_ESCALATIONS no-progress escalations in a row, else { level, history } (1 recover, 2 reset, 3 reset + escape).
function stuckEscalation(history, snapshot) {
  const progressed = history.last && (history.last.inv !== snapshot.inv || distance(history.last.pos, snapshot.pos) >= PROGRESS_MOVE)
  const count = progressed ? 1 : history.count + 1
  if (count > MAX_ESCALATIONS) return { end: true, history: { ...history, count } }
  const level = Math.min(count, MAX_LEVEL)
  const levels = { ...history.levels, [level]: history.levels[level] + 1 }
  return { level, history: { count, last: snapshot, total: history.total + 1, levels } }
}

const KEEP_ON_CLEAR = new Set(['baseDir', 'surfaceDir', 'relocations']) // per-run: rotating directions and the relocation budget

// Every per-life/per-trip planner memory field back to its fresh value; fresh = lifeMemory() result (a new object, so nothing is shared).
function clearLoopMemory(memory, fresh) {
  for (const [k, v] of Object.entries(fresh)) if (!KEEP_ON_CLEAR.has(k)) memory[k] = v
}

const DEATH_LIMIT = 6 // deaths in a row with nothing banked or found between them end the run
const DEATH_WINDOW_MIN = 30

// log: [{ t, banked, found }] one entry per death (found = diamonds ever seen in the inventory). True when the last DEATH_LIMIT deaths fit the window and made no progress.
function fruitlessDeaths(log) {
  if (log.length < DEATH_LIMIT) return false
  const [first, last] = [log.at(-DEATH_LIMIT), log.at(-1)]
  return last.t - first.t <= DEATH_WINDOW_MIN * 60000 && last.banked === first.banked && last.found === first.found
}

const ARMOR = { // [helmet, chestplate, leggings, boots]
  leather: [1, 3, 2, 1], golden: [2, 5, 3, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3], turtle: [2, 0, 0, 0],
}
const PIECES = ['helmet', 'chestplate', 'leggings', 'boots']
const PICK_TIERS = ['wooden', 'stone', 'golden', 'iron', 'diamond', 'netherite']

function armorPoints(names) {
  return names.reduce((sum, name) => {
    const [material, piece] = name?.split('_') ?? []
    const i = PIECES.indexOf(piece)
    return sum + (ARMOR[material]?.[i] ?? 0)
  }, 0)
}

const sumWhere = (counts, test) => Object.entries(counts).reduce((n, [name, c]) => (test(name) ? n + c : n), 0)

// counts: inventory name -> count; worn: names in the armor slots; offhand: name or undefined.
function gearSnapshot({ counts, worn, offhand, minute, foodCount, deposited }) {
  const tiers = PICK_TIERS.map((t, i) => (counts[`${t}_pickaxe`] ? i : -1))
  const best = Math.max(...tiers)
  return {
    minute,
    armorPoints: armorPoints(worn),
    bestPickaxeTier: best < 0 ? null : PICK_TIERS[best],
    pickaxeCount: sumWhere(counts, n => n.endsWith('_pickaxe')),
    hasShield: Boolean(counts.shield) || offhand === 'shield',
    hasBucket: sumWhere(counts, n => n.endsWith('bucket')) > 0,
    hasBed: sumWhere(counts, n => n.endsWith('_bed')) > 0,
    foodCount,
    diamondsCarried: counts.diamond ?? 0,
    diamondsDeposited: deposited,
  }
}

// Result-row fields for a LONGRUN run; run.longrun holds { history, gear, deposits }.
function longrunFields(run) {
  if (!run.params.longrun) return {}
  const { history, gear, deposits } = run.longrun
  return { longrun: true, stuckResets: { count: history.total, levels: history.levels }, gear, deposits }
}

module.exports = { fruitlessDeaths, DEATH_LIMIT, DEATH_WINDOW_MIN, stuckEscalation, newHistory, clearLoopMemory, armorPoints, gearSnapshot, longrunFields, MAX_ESCALATIONS, PROGRESS_MOVE, GEAR_INTERVAL_MIN, HOP_BLOCKS, SURFACE_BLOCKS }
