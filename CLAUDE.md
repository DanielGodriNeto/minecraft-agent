# Minecraft diamond bot

Mineflayer bot that mines and deposits diamonds. Read `docs/BOT_BEHAVIOR.md` first (what the bot values and why), then `PLAN.md`.

## Commands (run from `bot/`)
- `npm test` - unit tests, safe any time (no server).
- `npm run test:live` - flat-world skill tests; starts a server, never run while an eval is running.
- `node eval.js <firstSlot> <lastSlot> <bots> <minutes> [instances]` - eval on slots from `slots.json` (0-99 held-out gate, run once; 100-199 dev; 200-599 train). 12 bots per server max; instances = parallel servers (max 4). On this 32 GB box use `MC_HEAP_GB=3 node eval.js ... 3` (3 instances validated; 4 left only 1.7 GB free).
- Restore `server/diamonds.properties` after any server run: `git checkout -- server/diamonds.properties`.

## Workflow
- "build and review" -> use the `build-review` skill (`.claude/skills/build-review/SKILL.md`): builders implement test-first, independent reviewers score and give ranked feedback, loop until they pass.
- The main session delegates work to sub-agents (sonnet for code, haiku for log scanning) and stays lean.
- One change per commit and per eval round; put behaviour changes behind a param/env switch for A/B. Success is measured on paired slots; 24 runs alone cannot show a change smaller than ~25 points.
- Commits are local only, Conventional Commits, no AI attribution.
