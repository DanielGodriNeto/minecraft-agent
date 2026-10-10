// Chat tier 1: owner + addressed + rules/aliases/fuzzy -> intent. Pure; no I/O, no LLM.
const defaultGoals = require('../goals/goals.json')

const MAX_COUNT = 2304
const STOP_ANY = new Set(['stop', 'pare', 'parar', 'halt', 'cancela', 'cancele', 'cancel', 'chega', 'abort'])
const NEGATIONS = new Set(['nao', 'dont', 'don', 'not', 'never', 'nunca'])
const STATUS_PHRASES = ['status', 'como esta', 'como vai', 'o que esta fazendo', 'what are you doing', 'how are you', 'progresso', 'progress']
const COME_FIRST = new Set(['vem', 'venha', 'come'])
const GOAL_VERBS = new Set(['pegue', 'pega', 'pegar', 'consiga', 'consegue', 'conseguir', 'get', 'mine', 'minere', 'minerar', 'mina',
  'traga', 'trazer', 'traz', 'bring', 'fetch', 'find', 'ache', 'achar', 'encontre', 'encontrar', 'quero', 'want', 'give',
  'busque', 'buscar', 'colete', 'coletar', 'collect', 'gather', 'craft', 'faca', 'fazer', 'make'])
const MAX_WORDS = new Set(['todos', 'todas', 'tudo', 'max', 'maximo', 'maximum', 'all', 'everything', 'monte', 'lots'])
const NUMBER_WORDS = { um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3, quatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, sete: 7, seven: 7, oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10 }
const DIGITS = /^x?(\d+)x?$/

const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tokenize = s => normalize(s).match(/[a-z0-9_]+/g) ?? []

// Optimal-string-alignment edit distance (insert/delete/substitute/adjacent swap).
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}
const maxTypos = len => (len <= 3 ? 0 : len <= 6 ? 1 : 2)

const aliasCache = new WeakMap()
function aliasIndex(goals) {
  if (!aliasCache.has(goals)) {
    const list = []
    for (const [item, g] of Object.entries(goals.goals)) for (const a of g.aliases ?? []) list.push({ item, alias: tokenize(a).join(' ') })
    aliasCache.set(goals, list)
  }
  return aliasCache.get(goals)
}

// Best alias over all token windows: smallest distance, then longest window. -> { item, plural } | null
function matchItem(tokens, goals) {
  const index = aliasIndex(goals)
  let best = null
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const text = tokens.slice(i, i + size).join(' ')
      for (const { item, alias } of index) {
        const dist = editDistance(text, alias)
        if (dist > maxTypos(alias.length)) continue
        if (!best || dist < best.dist || (dist === best.dist && size > best.size)) best = { dist, size, item, plural: text.endsWith('s') }
      }
    }
  }
  return best
}

function parseCount(tokens) {
  if (tokens.some(t => MAX_WORDS.has(t))) return 'max'
  for (const t of tokens) {
    const digits = DIGITS.exec(t)
    if (digits) return Number(digits[1])
    if (Object.hasOwn(NUMBER_WORDS, t)) return NUMBER_WORDS[t]
  }
  return null
}

function parseGoal(tokens, goals) {
  if (!tokens.some(t => GOAL_VERBS.has(t))) return null
  const count = parseCount(tokens)
  const rest = tokens.filter(t => !GOAL_VERBS.has(t) && !MAX_WORDS.has(t) && !Object.hasOwn(NUMBER_WORDS, t) && !DIGITS.test(t))
  const found = matchItem(rest, goals)
  if (!found) return null
  const n = count ?? (found.plural ? 'max' : 1)
  if (n !== 'max' && (!Number.isInteger(n) || n < 1 || n > MAX_COUNT)) return null
  return { kind: 'goal', item: found.item, count: n }
}

function createRateLimiter({ minIntervalMs = 2000, now = Date.now } = {}) {
  const last = new Map()
  return {
    allow(sender) {
      const key = normalize(sender)
      const t = now()
      if (last.has(key) && t - last.get(key) < minIntervalMs) return false
      last.set(key, t)
      return true
    },
  }
}

function classify(tokens, text, goals) {
  if (tokens.some(t => NEGATIONS.has(t))) return { kind: 'unknown', text }
  if (tokens.some(t => STOP_ANY.has(t)) || tokens[0] === 'para') return { kind: 'stop' }
  const joined = tokens.join(' ')
  if (STATUS_PHRASES.some(p => joined.includes(p))) return { kind: 'status' }
  const goal = parseGoal(tokens, goals)
  if (goal) return goal
  if (COME_FIRST.has(tokens[0]) || tokens.includes('aqui')) return { kind: 'come' }
  return { kind: 'unknown', text }
}

function parseChat({ sender, text, botName, owners, isOwner, limiter, goals = defaultGoals }) {
  const ignore = { kind: 'ignore' }
  if (typeof sender !== 'string' || typeof text !== 'string') return ignore
  // isOwner (uuid-aware) wins over the name list when provided.
  const allowed = typeof isOwner === 'function' ? isOwner(sender) === true : (owners ?? []).some(o => normalize(o) === normalize(sender))
  if (!allowed) return ignore
  const name = normalize(botName)
  const all = tokenize(text)
  if (!all.includes(name)) return ignore
  const tokens = all.filter(t => t !== name)
  const intent = classify(tokens, text.trim(), goals)
  if (intent.kind !== 'stop' && limiter && !limiter.allow(sender)) return ignore // stop is never throttled
  return intent
}

module.exports = { parseChat, createRateLimiter, editDistance }
