# Playtest analysis pack (1329 traced runs, slots 200-583, all A/B arms mixed)

Files
- REPORT.md   full report: endings, funnel %, time per skill, failure reasons, deaths, per-arm table, 25 case studies
- runs.csv    one row per run (milestone minute + y for wood, cobble, each pickaxe, y<0, y<=-50, 1st and 3rd diamond)
- runs.json   same plus death list, time per skill, last 8 decisions, failSigs
- timelines/  decision-by-decision logs (time, pos, hp, food, pickaxes, cobble, wood, diamonds, failure) for 25 case runs

Headline numbers
- Funnel: wood 94% -> stone pick 92% -> iron pick 85.5% (median min 7.3) -> y<=-50 83% (min 10.1) -> 1st diamond 78% (min 15.8) -> 3 diamonds 51.5% -> banked 67.6%
- 22% of runs never reach a diamond; of those, 65% end stuck, median lowest y was 16 (they never got deep)
- 138 runs (13% of those that mined a diamond) never banked it: 77 stuck, 32 died, 28 timed out. Banking odds fall with a later first diamond: 92% (<10 min) -> 80% (>30 min)
- Stuck runs (38%): median end at minute 32, 66% end on the surface (y>0); top last failure is go_up:not_reached (72 runs)
- Banked runs spend ~2x more time exploring/digging; the median banked run deposits 5 diamonds, 204 runs bank exactly 1
- Death counter counts respawns too (1011 deaths over 1329 runs), so many deaths happen after the bot continues; 15% of runs END in death
- Caveat: arms differ between rows; compare only paired arms in REPORT section 9. Early-minute stats are timestamps of the decision log, not exact game events.
