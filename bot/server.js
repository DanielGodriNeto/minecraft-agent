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

function waitForLine(lines, pattern, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { lines.off('line', h); reject(new Error(`timeout waiting for ${pattern}`)) }, ms)
    const h = (line) => { if (pattern.test(line)) { clearTimeout(t); lines.off('line', h); resolve(line) } }
    lines.on('line', h)
  })
}

async function startServer(props = 'diamonds') {
  const proc = spawn('sh', ['start.sh', props], { cwd: SERVER_DIR, stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = readline.createInterface({ input: proc.stdout })
  const exited = new Promise(resolve => proc.once('exit', resolve))
  await Promise.race([
    waitForLine(lines, /Done \(/, START_MS),
    exited.then(code => { throw new Error(`server exited during startup (${code})`) }),
  ])
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

function restore() {
  if (!fs.existsSync(PRISTINE)) throw new Error(`no pristine snapshot at ${PRISTINE}`)
  fs.rmSync(WORLD, { recursive: true, force: true })
  fs.cpSync(PRISTINE, WORLD, { recursive: true })
}

module.exports = { startServer, snapshot, restore, WORLD, PRISTINE }
