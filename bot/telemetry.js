// TELEMETRY mode (switch TELEMETRY=1, param telemetry): observation-only fields for the skill log and the result row. Pure helpers;
// the callers only read bot state (no packets, no waits), so decisions are the same with the switch on or off.
const { normalizeEnchants } = require('./physicsfix.js')

const RECENT_MAX = 5
const SEAL_FAILS_MAX = 20
const round1 = (n) => Math.round(n * 10) / 10
const isPickaxe = (item) => item?.name?.endsWith('_pickaxe') === true

const telemetryOn = (bot) => bot.objectiveRun?.params?.telemetry === true

// Name, enchantments and durability of one item; null when there is none.
function itemInfo(item, registry) {
  if (!item) return null
  return { name: item.name, enchants: normalizeEnchants(item.enchants ?? [], registry), durabilityUsed: item.durabilityUsed ?? null, maxDurability: item.maxDurability ?? null }
}

const pickList = (items, registry) => items.filter(isPickaxe).map(i => itemInfo(i, registry))

// Extra fields for one damage entry. mob: the blamed attacker entity or null.
function damageFields({ now, tick, lost, mob, pos, health, food }) {
  const attacker = mob && { id: mob.id, type: mob.type, name: mob.name, dist: round1(mob.position.distanceTo(pos)), rel: [mob.position.x - pos.x, mob.position.y - pos.y, mob.position.z - pos.z].map(round1) }
  return { t: now, tick, amount: lost, ...(attacker && { attacker }), healthAfter: health, foodAfter: food }
}

// The entity (other than the bot) whose body overlaps the block cell, as { type, id, name }; null when the cell is free.
function occupant(entities, cell, selfId) {
  const inCell = (e) => e.id !== selfId && Math.floor(e.position.x) === cell.x && Math.floor(e.position.z) === cell.z &&
    e.position.y < cell.y + 1 && e.position.y + (e.height ?? 0) > cell.y
  const hit = Object.values(entities).find(inCell)
  return hit ? { type: hit.type, id: hit.id, name: hit.name } : null
}

// One failed seal/wall placement. list is capped, so a stuck loop cannot grow the log.
function noteSealFail(list, { cell, error, occupied, sealedCount, ticks }) {
  if (list.length >= SEAL_FAILS_MAX) return list
  return [...list, { cell: [cell.x, cell.y, cell.z], error, occupant: occupied, sealedCount, ticks }]
}

// Pickaxes in `before` that are not in `after` (matched by name and count), with the last durability seen.
function lostPicks(before, after, lastSeen, skill) {
  const left = {}
  for (const p of after) left[p.name] = (left[p.name] ?? 0) + 1
  const lost = []
  for (const p of before) {
    if (left[p.name] > 0) { left[p.name]--; continue }
    const used = lastSeen[p.name] ?? p.durabilityUsed
    const worn = p.maxDurability != null && used != null && used >= p.maxDurability - 1
    lost.push({ name: p.name, durabilityUsed: used, maxDurability: p.maxDurability, cause: skill === 'toss' ? 'toss' : worn ? 'worn_out' : 'unknown' })
  }
  return lost
}

// The last RECENT_MAX skills with their results (oldest first).
function pushRecent(recent, action, result, now = Date.now()) {
  recent.push({ t: now, skill: action.skill, ok: result.ok, reason: result.reason ?? null })
  if (recent.length > RECENT_MAX) recent.shift()
}

const stuckRow = ({ now, level, end, recent, picks }) => ({ t: now, level, end, recent: [...recent], pickaxes: picks })

const telemetryFields = (run) => run.telemetry ? { telemetry: { stuck: run.telemetry.stuck } } : {}

module.exports = { telemetryOn, itemInfo, pickList, damageFields, occupant, noteSealFail, lostPicks, pushRecent, stuckRow, telemetryFields, isPickaxe, RECENT_MAX, SEAL_FAILS_MAX }
