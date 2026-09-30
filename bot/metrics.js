// Eval metrics (Phase 2.5): every reported number, with a bootstrap 95% CI on the success rate.
const BOOTSTRAP_SAMPLES = 2000

// Deterministic PRNG so a CI is reproducible from the same runs.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

function bootstrapCI(values, rand = mulberry32(1)) {
  const means = Array.from({ length: BOOTSTRAP_SAMPLES }, () =>
    mean(values.map(() => values[Math.floor(rand() * values.length)]))).sort((a, b) => a - b)
  return [means[Math.floor(0.025 * BOOTSTRAP_SAMPLES)], means[Math.floor(0.975 * BOOTSTRAP_SAMPLES)]]
}

// A run that ended by error or disconnect says nothing about the bot: stuck, deaths, lost and timeout do.
const isInvalid = (r) => r.reason === 'error' || r.reason === 'disconnected'

// runs: [{ deposited, deaths, reason, minutes, invalid? }]; invalid rows are counted apart, not in any rate.
function summarize(all) {
  const runs = all.filter(r => !r.invalid)
  const invalidRuns = all.length - runs.length
  if (runs.length === 0) return { runs: 0, successRate: null, successCI: null, diamondsPerHour: null, deathsPerHour: null, stuckRate: null, invalidRuns }
  const hours = runs.reduce((h, r) => h + r.minutes / 60, 0)
  const success = runs.map(r => (r.deposited >= 1 ? 1 : 0))
  return {
    runs: runs.length,
    successRate: mean(success),
    successCI: bootstrapCI(success),
    diamondsPerHour: runs.reduce((n, r) => n + r.deposited, 0) / hours,
    deathsPerHour: runs.reduce((n, r) => n + r.deaths, 0) / hours,
    stuckRate: mean(runs.map(r => (r.reason === 'stuck' ? 1 : 0))),
    invalidRuns,
  }
}

module.exports = { summarize, isInvalid, bootstrapCI, mulberry32 }
