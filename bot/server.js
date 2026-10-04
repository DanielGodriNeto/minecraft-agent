// Paper server lifecycle for evals: fresh spawn = stop -> restore pristine snapshot -> start.
// The server runs as a child process so commands go straight to its console (no op bot needed).
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const SERVER_DIR = path.join(__dirname, '..', 'server')
const WORLD = path.join(SERVER_DIR, 'diamonds')
const PRISTINE = path.join(SERVER_DIR, 'snapshots', 'diamonds-pristine')
const START_MS = 300000
const BASE_PORT = 25565
const HEAP_GB = Number(process.env.MC_HEAP_GB) || 6 // per instance (MC_HEAP_GB overrides); start.sh is separate
const TOTAL_HEAP_GB = 24 // all instances together, leaves the rest of the RAM to the OS and the bots
const MAX_INSTANCES = 4
const DISK_MARGIN = 10 * 2 ** 30
// Aikar-style G1 flags; Xms=Xmx so the heap never resizes under load.
const GC_FLAGS = ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+DisableExplicitGC',
  '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4', '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:SurvivorRatio=32', '-XX:MaxTenuringThreshold=1']
const javaArgs = (heapGb) => [`-Xms${heapGb}G`, `-Xmx${heapGb}G`, ...GC_FLAGS, '-jar', 'paper-1.21.11-132.jar', '--nogui']
// Files a Paper instance needs from server/ (world and logs are per instance). whitelist/ops are re-synced on every start.
const SHARED = ['paper-1.21.11-132.jar', 'libraries', 'versions', 'cache', 'plugins', 'config', 'bukkit.yml', 'spigot.yml',
  'commands.yml', 'help.yml', 'permissions.yml']
const SYNCED = ['whitelist.json', 'ops.json', 'banned-players.json', 'banned-ips.json', 'eula.txt']

// One instance: server/ on 25565; several: server/run-<n>/ on 25565+n (n = 1..total).
function instanceSpec(index, total) {
  if (total === 1) return { dir: SERVER_DIR, port: BASE_PORT }
  return { dir: path.join(SERVER_DIR, `run-${index + 1}`), port: BASE_PORT + index + 1 }
}

// Instances the RAM allows (8 GB left to the OS and the bots) within the total heap budget.
const maxInstances = (totalMemGb, heapGb = HEAP_GB) => Math.max(1, Math.min(MAX_INSTANCES, Math.floor(Math.min(TOTAL_HEAP_GB, totalMemGb - 8) / heapGb)))

function assertDiskSpace(freeBytes, neededBytes, what) {
  const need = neededBytes + DISK_MARGIN
  if (freeBytes >= need) return
  const gb = (b) => (b / 2 ** 30).toFixed(1)
  throw new Error(`not enough disk for ${what}: need ${gb(need)} GB (incl. ${gb(DISK_MARGIN)} GB margin), free ${gb(freeBytes)} GB`)
}

const withPort = (props, port) => props.replace(/^(server-port|query\.port)=.*$/gm, `$1=${port}`)

function freeBytes(dir) {
  const { bavail, bsize } = fs.statfsSync(dir)
  return bavail * bsize
}

function dirSize(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .reduce((sum, e) => sum + (e.isFile() ? fs.statSync(path.join(e.parentPath, e.name)).size : 0), 0)
}

function prepareInstance(dir, props, port) {
  fs.mkdirSync(dir, { recursive: true })
  for (const name of SHARED) if (!fs.existsSync(path.join(dir, name))) fs.cpSync(path.join(SERVER_DIR, name), path.join(dir, name), { recursive: true })
  for (const name of SYNCED) if (fs.existsSync(path.join(SERVER_DIR, name))) fs.copyFileSync(path.join(SERVER_DIR, name), path.join(dir, name))
  const file = `${props}.properties`
  fs.writeFileSync(path.join(dir, file), withPort(fs.readFileSync(path.join(SERVER_DIR, file), 'utf8'), port))
}

function waitForLine(lines, pattern, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { lines.off('line', h); reject(new Error(`timeout waiting for ${pattern}`)) }, ms)
    const h = (line) => { if (pattern.test(line)) { clearTimeout(t); lines.off('line', h); resolve(line) } }
    lines.on('line', h)
  })
}

async function startServer(props = 'diamonds', { dir = SERVER_DIR, port = BASE_PORT, heapGb = HEAP_GB } = {}) {
  if (dir !== SERVER_DIR) prepareInstance(dir, props, port)
  const proc = spawn('java', [...javaArgs(heapGb), '--config', `${props}.properties`], { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = readline.createInterface({ input: proc.stdout })
  const exited = new Promise(resolve => proc.once('exit', resolve))
  const kill = () => proc.kill()
  const onSigint = () => { kill(); process.exit(130) }
  process.on('exit', kill)
  process.on('SIGINT', onSigint)
  exited.then(() => { process.off('exit', kill); process.off('SIGINT', onSigint) })
  try {
    await Promise.race([
      waitForLine(lines, /Done \(/, START_MS),
      exited.then(code => { throw new Error(`server exited during startup (${code})`) }),
    ])
  } catch (e) {
    kill()
    throw e
  }
  return {
    lines,
    // Sends a console command; with `reply`, resolves with the first output line matching it.
    command(cmd, reply, ms = 10000) {
      const answer = reply ? waitForLine(lines, reply, ms) : Promise.resolve(null)
      proc.stdin.write(`${cmd}\n`)
      return answer
    },
    async stop() {
      proc.stdin.write('stop\n')
      await exited
    },
  }
}

// Only while the server is stopped. Refuses to overwrite an existing pristine copy.
function snapshot() {
  if (fs.existsSync(PRISTINE)) throw new Error(`${PRISTINE} already exists; delete it first to re-snapshot`)
  fs.cpSync(WORLD, PRISTINE, { recursive: true })
}

let pristineBytes
const pristineSize = () => (pristineBytes ??= dirSize(PRISTINE))

// Pristine world copied into <dir>/diamonds; fails before copying when the disk can't hold it.
function restore(dir = SERVER_DIR) {
  if (!fs.existsSync(PRISTINE)) throw new Error(`no pristine snapshot at ${PRISTINE}`)
  const world = path.join(dir, 'diamonds')
  fs.rmSync(world, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  fs.mkdirSync(dir, { recursive: true })
  assertDiskSpace(freeBytes(dir), pristineSize(), `restoring ${world}`)
  fs.cpSync(PRISTINE, world, { recursive: true })
}

// Fail fast before an eval starts: every instance without a world yet needs a full pristine copy.
function checkDiskFor(specs) {
  const missing = specs.filter(({ dir }) => !fs.existsSync(path.join(dir, 'diamonds'))).length
  assertDiskSpace(freeBytes(SERVER_DIR), missing * pristineSize(), `${missing} new world copies`)
}

module.exports = { startServer, snapshot, restore, checkDiskFor, instanceSpec, maxInstances, assertDiskSpace, withPort, freeBytes, pristineSize, WORLD, PRISTINE }
