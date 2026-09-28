const ITEMS = new Set(['diamond']) // v1 objective
const INT = /^-?\d+$/
const POS_INT = /^[1-9]\d*$/

function parseCommand(message) {
  const [head, ...args] = message.trim().split(/\s+/)
  switch (head) {
    case '!get': {
      const [item, n] = args
      if (args.length !== 2 || !ITEMS.has(item)) return null
      if (n === 'max') return { cmd: 'get', item, count: 'max' }
      return POS_INT.test(n) ? { cmd: 'get', item, count: Number(n) } : null
    }
    case '!store': {
      if (args.length === 0) return { cmd: 'store' }
      if (args.length !== 3 || !args.every(a => INT.test(a))) return null
      const [x, y, z] = args.map(Number)
      return { cmd: 'store', pos: { x, y, z } }
    }
    case '!status': case '!come': case '!stop':
      return args.length === 0 ? { cmd: head.slice(1) } : null
    default:
      return null
  }
}

// Offline-mode servers hand out v3 UUIDs derived from the name, so the name is all we can check,
// and only when explicitly allowed. Online-mode (v4) players are matched by UUID only.
function isOwner(player, { ownerName, ownerUuid, allowOffline }) {
  if (!player?.uuid) return false
  const offline = player.uuid[14] === '3'
  if (offline) return allowOffline === true && player.username === ownerName
  return Boolean(ownerUuid) && player.uuid === ownerUuid
}

module.exports = { parseCommand, isOwner }
