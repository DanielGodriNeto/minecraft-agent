---
type: community
cohesion: 0.08
members: 40
---

# Eval harness

**Cohesion:** 0.08 - loosely connected
**Members:** 40 nodes

## Members
- [[PROPS]] - code - bot/eval.js
- [[RESULTS_1]] - code - bot/eval.js
- [[SWITCHES_1]] - code - bot/eval.js
- [[abortedInstances]] - code - bot/eval.js
- [[agent]] - code - bot/eval.js
- [[assignArms()]] - code - bot/eval.js
- [[botsPerProc()]] - code - bot/worker.js
- [[chunk()]] - code - bot/eval.js
- [[distribute()]] - code - bot/eval.js
- [[eval.js]] - code - bot/eval.js
- [[freeGb()]] - code - bot/eval.js
- [[fs_12]] - code - bot/eval.js
- [[heapGbFor()]] - code - bot/eval.js
- [[instanceSpec()]] - code - bot/server.js
- [[liveInstances]] - code - bot/eval.js
- [[localRunner()]] - code - bot/eval.js
- [[lostSlots]] - code - bot/eval.js
- [[main()_3]] - code - bot/eval.js
- [[maxInstances()]] - code - bot/server.js
- [[memoryGuardAction()]] - code - bot/eval.js
- [[newBot()]] - code - bot/eval.js
- [[os_3]] - code - bot/eval.js
- [[parseInstances()]] - code - bot/eval.js
- [[path_14]] - code - bot/eval.js
- [[pickInstances()]] - code - bot/eval.js
- [[runBatch()]] - code - bot/eval.js
- [[runShare()]] - code - bot/eval.js
- [[sampleTps()_1]] - code - bot/eval.js
- [[skillLogPath()]] - code - bot/eval.js
- [[snapshot()]] - code - bot/server.js
- [[startMemoryGuard()]] - code - bot/eval.js
- [[tpsFromLine()]] - code - bot/eval.js
- [[withDeadline()]] - code - bot/eval.js
- [[{ botsPerProc, startMeter, runInProcs }]] - code - bot/eval.js
- [[{ createBot }_3]] - code - bot/eval.js
- [[{ execSync }]] - code - bot/eval.js
- [[{ giveCommands, equipGift, wornPoints }_1]] - code - bot/eval.js
- [[{ longrunFields }]] - code - bot/eval.js
- [[{ startServer, rssGb, snapshot, restore, checkDiskFor, instanceSpec, maxInstances }]] - code - bot/eval.js
- [[{ summarize, isInvalid, mulberry32 }]] - code - bot/eval.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Eval_harness
SORT file.name ASC
```

## Connections to other communities
- 12 edges to [[_COMMUNITY_Eval rows and arms]]
- 11 edges to [[_COMMUNITY_Server manager]]
- 9 edges to [[_COMMUNITY_Minor cluster 43]]
- 7 edges to [[_COMMUNITY_Minor cluster 29]]
- 6 edges to [[_COMMUNITY_Minor cluster 20]]
- 5 edges to [[_COMMUNITY_Minor cluster 38]]
- 3 edges to [[_COMMUNITY_Bot entry and commands]]
- 3 edges to [[_COMMUNITY_LONGRUN and recovery]]
- 1 edge to [[_COMMUNITY_Agent loop and stuck tracker]]

## Top bridge nodes
- [[eval.js]] - degree 83, connects to 9 communities
- [[main()_3]] - degree 13, connects to 3 communities
- [[runBatch()]] - degree 12, connects to 3 communities
- [[newBot()]] - degree 4, connects to 1 community
- [[instanceSpec()]] - degree 4, connects to 1 community