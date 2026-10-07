---
type: community
cohesion: 0.15
members: 20
---

# Armor death analysis

**Cohesion:** 0.15 - loosely connected
**Members:** 20 nodes

## Members
- [[ARMS_2]] - code - analysis/measure/gift_common.js
- [[K]] - code - analysis/measure/stuck_armor.js
- [[armor_deaths.js]] - code - analysis/measure/armor_deaths.js
- [[arms_1]] - code - analysis/measure/armor_deaths.js
- [[by]] - code - analysis/measure/armor_deaths.js
- [[by_1]] - code - analysis/measure/stuck_armor.js
- [[cat()]] - code - analysis/measure/gift_common.js
- [[giftRows()]] - code - analysis/measure/gift_common.js
- [[gift_common.js]] - code - analysis/measure/gift_common.js
- [[hits()]] - code - analysis/measure/gift_common.js
- [[median()]] - code - analysis/measure/gift_common.js
- [[pos()_1]] - code - analysis/measure/stuck_armor.js
- [[skillsByRun()]] - code - analysis/measure/gift_common.js
- [[skillsOf()]] - code - analysis/measure/earlyseal_telemetry.js
- [[slots]] - code - analysis/measure/armor_deaths.js
- [[stuck]] - code - analysis/measure/stuck_armor.js
- [[stuck_armor.js]] - code - analysis/measure/stuck_armor.js
- [[{ ARMS, giftRows, t0, skillsByRun, median }]] - code - analysis/measure/stuck_armor.js
- [[{ fs, LOGS, eachLine, files, path }]] - code - analysis/measure/gift_common.js
- [[{ giftRows, t0, skillsByRun, hits, cat, median }]] - code - analysis/measure/armor_deaths.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Armor_death_analysis
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Analysis loaders]]
- 5 edges to [[_COMMUNITY_Minor cluster 22]]
- 5 edges to [[_COMMUNITY_Minor cluster 36]]
- 4 edges to [[_COMMUNITY_Minor cluster 28]]

## Top bridge nodes
- [[gift_common.js]] - degree 20, connects to 4 communities
- [[skillsByRun()]] - degree 8, connects to 3 communities
- [[median()]] - degree 5, connects to 2 communities
- [[armor_deaths.js]] - degree 11, connects to 1 community
- [[stuck_armor.js]] - degree 11, connects to 1 community