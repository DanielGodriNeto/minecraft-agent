// Phase 2.1: pick the spawn slots and pre-generate them. Server must be running `start.sh diamonds`.
//   node pregen.js         select slots (if slots.json missing), then pre-generate the rest
// Resumable: finished slot ids are appended to logs/pregen-done.txt.
const fs = require('node:fs')
const path = require('node:path')
const mineflayer = require('mineflayer')

const SLOT_COUNT = 600
const SPACING = 1024 // plan: slots >= 1,000 blocks apart
const RADIUS = 256
const SLOTS_FILE = path.join(__dirname, 'slots.json')
const DONE_FILE = path.join(__dirname, '..', 'logs', 'pregen-done.txt')
const OPEN = new Set(['air', 'cave_air', 'void_air'])
const WET = new Set(['water', 'lava', 'ice', 'packed_ice', 'blue_ice', 'bubble_column'])

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Square spiral over the grid, starting at the origin: (0,0), (1,0), (1,1), (0,1), (-1,1), ...
function* spiral() {
  let [x, z, dx, dz] = [0, 0, 1, 0]
  for (let leg = 1; ; leg++) {
    for (let turn = 0; turn < 2; turn++) {
      for (let i = 0; i < leg; i++) { yield [x, z]; x += dx; z += dz }
      ;[dx, dz] = [-dz, dx]
    }
  }
}

function connect() {
  const owner = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'Owner', version: '1.21.11', viewDistance: 'tiny' })
  owner.on('error', console.error)
  return new Promise(resolve => owner.once('spawn', () => resolve(owner)))
}

// Sends a command and resolves with its system-message reply.
function cmd(owner, command) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { owner.off('messagestr', h); reject(new Error(`no reply: ${command}`)) }, 10000)
    const h = (text, pos) => { if (pos === 'system') { clearTimeout(t); owner.off('messagestr', h); resolve(text) } }
    owner.on('messagestr', h)
    owner.chat(command)
  })
}

async function surfaceAt(owner, x, z) {
  await cmd(owner, `/tp Owner ${x + 0.5} 320 ${z + 0.5}`)
  const column = owner.entity.position.floored()
  const at = (y) => owner.blockAt(column.offset(0, y - column.y, 0))
  for (let i = 0; i < 300 && !at(-64); i++) await sleep(100)
  if (!at(-64)) throw new Error(`chunk at ${x},${z} never loaded`)
  let y = 319
  while (y > -64 && OPEN.has(at(y)?.name)) y--
  return { y: y + 1, block: at(y).name }
}

async function selectSlots(owner) {
  const slots = []
  for (const [gx, gz] of spiral()) {
    const [x, z] = [gx * SPACING, gz * SPACING]
    const { y, block } = await surfaceAt(owner, x, z)
    const ok = !WET.has(block)
    console.log(`candidate ${x},${z}: ${block} at y=${y - 1} ${ok ? `-> slot ${slots.length}` : 'rejected'}`)
    if (ok) slots.push({ id: slots.length, x, y, z, surface: block })
    if (slots.length === SLOT_COUNT) return slots
  }
}

async function waitIdle(owner) {
  for (;;) {
    const reply = await cmd(owner, '/chunky progress')
    if (!/Task running/i.test(reply)) return
    await sleep(500)
  }
}

async function pregenerate(owner, slots) {
  const done = new Set(fs.existsSync(DONE_FILE) ? fs.readFileSync(DONE_FILE, 'utf8').split('\n').filter(Boolean).map(Number) : [])
  fs.mkdirSync(path.dirname(DONE_FILE), { recursive: true })
  for (const c of ['/chunky world diamonds', '/chunky shape square', `/chunky radius ${RADIUS}`]) await cmd(owner, c)
  await waitIdle(owner)
  const t0 = Date.now()
  for (const slot of slots.filter(s => !done.has(s.id))) {
    await cmd(owner, `/chunky center ${slot.x} ${slot.z}`)
    await cmd(owner, '/chunky start')
    await waitIdle(owner)
    fs.appendFileSync(DONE_FILE, `${slot.id}\n`)
    done.add(slot.id)
    console.log(`slot ${slot.id} done (${done.size}/${slots.length}), ${Math.round((Date.now() - t0) / 1000)}s elapsed`)
  }
}

async function main() {
  const owner = await connect()
  if (owner.game.gameMode !== 'spectator') await cmd(owner, '/gamemode spectator Owner')
  if (!fs.existsSync(SLOTS_FILE)) {
    const slots = await selectSlots(owner)
    fs.writeFileSync(SLOTS_FILE, JSON.stringify(slots, null, 1) + '\n')
    console.log(`wrote ${slots.length} slots to ${SLOTS_FILE}`)
  }
  await pregenerate(owner, JSON.parse(fs.readFileSync(SLOTS_FILE, 'utf8')))
  console.log('pre-generation complete')
  owner.end()
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
module.exports = { spiral }
