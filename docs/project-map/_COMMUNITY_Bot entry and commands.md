---
type: community
cohesion: 0.06
members: 53
---

# Bot entry and commands

**Cohesion:** 0.06 - loosely connected
**Members:** 53 nodes

## Members
- [[ITEMS]] - code - bot/commands.js
- [[assert_4]] - code - tests/commands.test.js
- [[assert_5]] - code - tests/enchants.test.js
- [[assert_6]] - code - tests/physics.test.js
- [[authFromEnv()]] - code - bot/bot.js
- [[bot.js]] - code - bot/bot.js
- [[commands.js]] - code - bot/commands.js
- [[commands.test.js]] - code - tests/commands.test.js
- [[createBot()]] - code - bot/bot.js
- [[damageFields()]] - code - bot/telemetry.js
- [[enchants.test.js]] - code - tests/enchants.test.js
- [[handleCommand()]] - code - bot/bot.js
- [[isOwner()]] - code - bot/commands.js
- [[isPickaxe()]] - code - bot/telemetry.js
- [[itemInfo()]] - code - bot/telemetry.js
- [[keepHitboxOutOfBlocks()]] - code - bot/physicsfix.js
- [[lostPicks()]] - code - bot/telemetry.js
- [[mineflayer_1]] - code - bot/bot.js
- [[normalizeEnchants()]] - code - bot/physicsfix.js
- [[noteSealFail()]] - code - bot/telemetry.js
- [[nudgeOffEdges()]] - code - bot/physicsfix.js
- [[occupant()]] - code - bot/telemetry.js
- [[parseCommand()]] - code - bot/commands.js
- [[patchItemEnchants()]] - code - bot/physicsfix.js
- [[path_5]] - code - bot/bot.js
- [[physics.test.js]] - code - tests/physics.test.js
- [[physicsfix.js]] - code - bot/physicsfix.js
- [[pickList()]] - code - bot/telemetry.js
- [[pushRecent()]] - code - bot/telemetry.js
- [[registry]] - code - tests/enchants.test.js
- [[round1()]] - code - bot/telemetry.js
- [[safe()]] - code - bot/telemetry.js
- [[setStorage()]] - code - bot/bot.js
- [[startObjective()]] - code - bot/bot.js
- [[status()]] - code - bot/bot.js
- [[stopObjective()]] - code - bot/agent.js
- [[stuckRow()]] - code - bot/telemetry.js
- [[telemetry.js]] - code - bot/telemetry.js
- [[telemetryFields()]] - code - bot/telemetry.js
- [[telemetryOn()]] - code - bot/telemetry.js
- [[test]] - code - tests/enchants.test.js
- [[trackRecipeBook()]] - code - bot/skills.js
- [[{ keepHitboxOutOfBlocks, patchItemEnchants }]] - code - bot/bot.js
- [[{ normalizeEnchants }]] - code - bot/telemetry.js
- [[{ normalizeEnchants, patchItemEnchants }]] - code - tests/enchants.test.js
- [[{ nudgeOffEdges }]] - code - tests/physics.test.js
- [[{ parseCommand, isOwner }]] - code - bot/bot.js
- [[{ parseCommand, isOwner }_1]] - code - tests/commands.test.js
- [[{ pathfinder }]] - code - bot/bot.js
- [[{ runObjective, stopObjective }]] - code - bot/bot.js
- [[{ test }_4]] - code - tests/commands.test.js
- [[{ test }_5]] - code - tests/physics.test.js
- [[{ trackRecipeBook, runSkill, skillMovements }]] - code - bot/bot.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Bot_entry_and_commands
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_Skills core]]
- 3 edges to [[_COMMUNITY_Agent loop and stuck tracker]]
- 3 edges to [[_COMMUNITY_Eval harness]]
- 2 edges to [[_COMMUNITY_Movement helpers]]
- 2 edges to [[_COMMUNITY_Minor cluster 30]]
- 1 edge to [[_COMMUNITY_Eval rows and arms]]
- 1 edge to [[_COMMUNITY_Minor cluster 40]]
- 1 edge to [[_COMMUNITY_Telemetry tests]]

## Top bridge nodes
- [[bot.js]] - degree 27, connects to 5 communities
- [[telemetry.js]] - degree 19, connects to 3 communities
- [[stopObjective()]] - degree 6, connects to 3 communities
- [[createBot()]] - degree 9, connects to 2 communities
- [[handleCommand()]] - degree 7, connects to 1 community