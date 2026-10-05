const fs = require('fs'), path = require('path'), readline = require('readline')
const LOGS = path.join(__dirname, '..', '..', 'logs')
const evalRows = () => fs.readFileSync(path.join(LOGS, 'eval.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
async function eachLine(file, fn, prefilter) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  for await (const l of rl) { if (!l || (prefilter && !l.includes(prefilter))) continue; try { fn(JSON.parse(l)) } catch (e) { /* truncated line */ } }
}
const files = (re) => fs.readdirSync(LOGS).filter(f => re.test(f)).map(f => path.join(LOGS, f))
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) }
const band = (y) => y > 60 ? 'surface>60' : y >= 0 ? '0..60' : y >= -40 ? '-40..0' : 'deep<-40'
module.exports = { fs, path, LOGS, evalRows, eachLine, files, q, band }
