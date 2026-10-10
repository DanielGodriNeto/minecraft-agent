// Owner authentication for chat commands. Pure except the injected store file.
// online: owner identified by uuid; name is only used when the configured owner has no uuid.
// pairing: one-time code whispered by the owner; the paired uuid is then required everywhere.
// WARNING: on an offline-mode server (online-mode=false) uuids are derived from the name
// (version 3, md5 of "OfflinePlayer:<name>"), so anyone can join under any name and pass the uuid
// check. Pairing there is only safe with a whitelist; `warnings` exposes this when detected.
// Failed-attempt count and lockout persist in pairing-state.json next to the store file.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const CODE_TTL_MS = 10 * 60_000
const LOCK_MS = 15 * 60_000
const MAX_ATTEMPTS = 5
const PAIR_RE = /^\s*(?:parear|pair)\s+(\S+)\s*$/i

const sameName = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function loadOwner(storePath) {
  try {
    const o = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    return o && typeof o.name === 'string' && typeof o.uuid === 'string' ? { name: o.name, uuid: o.uuid } : null
  } catch { return null }
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  try { fs.chmodSync(tmp, 0o600) } catch { /* no-op on platforms without chmod */ }
  fs.renameSync(tmp, file)
}

const saveOwner = writeAtomic

function loadLock(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { attempts: Number.isInteger(o.attempts) && o.attempts > 0 ? o.attempts : 0, lockedUntil: Number.isFinite(o.lockedUntil) ? o.lockedUntil : 0 }
  } catch { return { attempts: 0, lockedUntil: 0 } }
}

function offlineUuid(name) {
  const h = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest()
  h[6] = (h[6] & 0x0f) | 0x30
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

function createAuth({ mode, owner, storePath, now = Date.now, random = crypto.randomInt, log = () => {} }) {
  let stored = mode === 'pairing' ? loadOwner(storePath) : null
  let pending = null // { code, expiresAt }
  const lockFile = path.join(path.dirname(storePath ?? '.'), 'pairing-state.json')
  const saved = mode === 'pairing' ? loadLock(lockFile) : { attempts: 0, lockedUntil: 0 }
  let lockedUntil = saved.lockedUntil
  // restart backoff: keep an active lock, otherwise carry half of the failed attempts
  let attempts = saved.lockedUntil > now() ? 0 : Math.floor(saved.attempts / 2)
  const warnings = []
  const persistLock = () => { if (mode === 'pairing') try { writeAtomic(lockFile, { attempts, lockedUntil }) } catch (e) { log(`could not persist pairing state: ${e.message}`) } }

  function checkOffline(name, uuid) {
    if (warnings.length || typeof name !== 'string' || uuid !== offlineUuid(name)) return
    const msg = 'owner uuid looks offline-mode (derived from the name): anyone can join as that name; use a whitelist'
    warnings.push(msg)
    log(msg)
  }
  let present = null // uuid of the owner while seen in this session (pairing mode)

  function startPairingIfNeeded() {
    if (mode !== 'pairing' || stored) return null
    const code = String(random(100000, 1000000))
    pending = { code, expiresAt: now() + CODE_TTL_MS }
    return { code, expiresAt: pending.expiresAt } // caller prints in the terminal ONLY
  }

  function handleWhisper(sender, uuid, text) {
    const silent = { ok: false, reply: null }
    if (mode !== 'pairing' || stored || !pending || typeof text !== 'string') return silent
    const m = PAIR_RE.exec(text)
    if (!m) return silent
    if (now() < lockedUntil) return { ok: false, reply: 'Pairing is locked. Try again later.' }
    if (now() > pending.expiresAt) { pending = null; return { ok: false, reply: 'Pairing code expired.' } }
    if (typeof uuid !== 'string' || typeof sender !== 'string' || !safeEqual(m[1], pending.code)) {
      if (++attempts >= MAX_ATTEMPTS) { lockedUntil = now() + LOCK_MS; attempts = 0; log('pairing locked after too many wrong attempts') }
      persistLock()
      return { ok: false, reply: 'Invalid code.' }
    }
    stored = { name: sender, uuid }
    saveOwner(storePath, stored)
    pending = null // burned
    present = uuid
    attempts = 0
    lockedUntil = 0
    persistLock()
    checkOffline(sender, uuid)
    return { ok: true, reply: 'Paired. You are now my owner.' }
  }

  function onPlayerJoined(name, uuid) {
    if (!stored || !sameName(name, stored.name)) return
    if (uuid !== stored.uuid) return log(`spoof attempt: "${name}" joined with a different uuid`)
    present = uuid
    checkOffline(name, uuid)
  }

  function onPlayerLeft(name, uuid) {
    if (!stored) return
    const same = uuid === undefined ? sameName(name, stored.name) : uuid === stored.uuid
    if (same) present = null
  }

  function isOwner(sender, uuid) {
    if (mode === 'online') {
      if (!owner) return false
      if (owner.uuid) return uuid === owner.uuid
      return sameName(sender, owner.name)
    }
    if (!stored || present !== stored.uuid) return false
    if (uuid !== stored.uuid) {
      if (sameName(sender, stored.name)) log(`spoof attempt: "${sender}" used a different uuid`)
      return false
    }
    return sameName(sender, stored.name)
  }

  return { startPairingIfNeeded, handleWhisper, isOwner, onPlayerJoined, onPlayerLeft, warnings }
}

module.exports = { createAuth }
