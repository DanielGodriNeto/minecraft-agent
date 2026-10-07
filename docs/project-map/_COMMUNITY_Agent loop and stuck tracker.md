---
type: community
cohesion: 0.08
members: 35
---

# Agent loop and stuck tracker

**Cohesion:** 0.08 - loosely connected
**Members:** 35 nodes

## Members
- [[COLUMNS]] - code - bot/agent.js
- [[DIG_STUCK]] - code - bot/agent.js
- [[GROUPS]] - code - bot/planner.js
- [[IDLE_EXEMPT]] - code - bot/agent.js
- [[IRON_PICKS_1]] - code - bot/agent.js
- [[LEG_BLOCKED]] - code - bot/agent.js
- [[T_2]] - code - bot/agent.js
- [[TIERS]] - code - bot/agent.js
- [[agent.js]] - code - bot/agent.js
- [[countFailure()]] - code - bot/agent.js
- [[countHostiles()]] - code - bot/agent.js
- [[failBranchLeg()]] - code - bot/agent.js
- [[fixedBranchY()]] - code - bot/agent.js
- [[fs_14]] - code - bot/agent.js
- [[ironLeft()]] - code - bot/agent.js
- [[isNight()]] - code - bot/skills.js
- [[jitterParams()]] - code - bot/agent.js
- [[nearestAnimal()]] - code - bot/skills.js
- [[observe()]] - code - bot/agent.js
- [[path_16]] - code - bot/agent.js
- [[remember()]] - code - bot/agent.js
- [[signature()]] - code - bot/agent.js
- [[simulateStuckColumn()]] - code - tests/agent.test.js
- [[sumOf()]] - code - bot/agent.js
- [[traceLine()]] - code - bot/agent.js
- [[trackDigging()]] - code - bot/agent.js
- [[trackGoUp()]] - code - bot/agent.js
- [[trackHomeTrip()]] - code - bot/agent.js
- [[trackRestock()]] - code - bot/agent.js
- [[trackShelter()]] - code - bot/agent.js
- [[tryRecovery()]] - code - bot/agent.js
- [[walkAfter()]] - code - bot/planner.js
- { nextAction, walkAfter, lingerHeldReturn, recoveryFor, GROU… - code - bot/agent.js
- { runSkill, findVisible, stopPathing, resetTrail, cheapestPi… - code - bot/agent.js
- { stuckEscalation, newHistory, fruitlessDeaths, clearLoopMem… - code - bot/agent.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Agent_loop_and_stuck_tracker
SORT file.name ASC
```

## Connections to other communities
- 16 edges to [[_COMMUNITY_Minor cluster 30]]
- 13 edges to [[_COMMUNITY_LONGRUN and recovery]]
- 11 edges to [[_COMMUNITY_Minor cluster 21]]
- 9 edges to [[_COMMUNITY_Skills core]]
- 8 edges to [[_COMMUNITY_Planner decisions]]
- 8 edges to [[_COMMUNITY_Minor cluster 47]]
- 5 edges to [[_COMMUNITY_Minor cluster 33]]
- 5 edges to [[_COMMUNITY_Combat live tests]]
- 4 edges to [[_COMMUNITY_Minor cluster 40]]
- 4 edges to [[_COMMUNITY_Planner unit tests]]
- 3 edges to [[_COMMUNITY_Bot entry and commands]]
- 2 edges to [[_COMMUNITY_Crafting and weapons]]
- 2 edges to [[_COMMUNITY_Minor cluster 25]]
- 1 edge to [[_COMMUNITY_Eval rows and arms]]
- 1 edge to [[_COMMUNITY_Dig-down and fall hazards]]
- 1 edge to [[_COMMUNITY_Movement helpers]]
- 1 edge to [[_COMMUNITY_Telemetry tests]]
- 1 edge to [[_COMMUNITY_Eval harness]]

## Top bridge nodes
- [[agent.js]] - degree 96, connects to 16 communities
- [[observe()]] - degree 17, connects to 8 communities
- [[tryRecovery()]] - degree 6, connects to 4 communities
- [[remember()]] - degree 13, connects to 3 communities
- [[jitterParams()]] - degree 5, connects to 3 communities