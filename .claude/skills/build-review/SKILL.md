---
name: build-review
description: Use when the user says "build and review", "build it and review", or asks for a feature or fix to be built and then criticised. Runs a team of sub-agents - builders that implement test-first, then independent reviewers that give percentage scores and ranked, specific feedback - and loops until the reviewers pass it.
---

# Build and review

The main session stays lean: it plans, dispatches, merges the feedback and reports. It does not read big files or edit code itself.

## 0. Prepare
- State the goal, the files each builder owns, and the acceptance check in 3-6 lines. If two builders would touch the same file, run them one after the other, not together.
- Never start a server or a live test while an eval is running (`bot/eval.js` owns the server). Unit tests (`cd bot && npm test`) are always safe.
- Rules for every agent: test-first; minimal diffs in the surrounding style; one micro-commit per logical change (Conventional Commits, `fix(scope): ...`); local only, never push; no AI attribution anywhere; never touch `.env*`, `.github/`, Dockerfiles, lockfiles, `logs/eval*`, `server/`; do not commit `server/diamonds.properties`.

## 1. Build (sonnet `implementer`, in the background)
- One builder per independent area. Each gets: the diagnosed problem with file:line, the exact behaviour wanted, tests to write first, and what NOT to change.
- Ask every builder to verify the claim in the code first and to say if it is wrong.
- Each builder reports in under 200 words: commits (hash + message), the real `npm test` pass/fail line, what it could not verify offline, what it skipped and why.

## 2. Review (sonnet `code-reviewer`, `general-purpose` for design or stats; read-only)
Start these only after the builders finish. Run all reviewers in parallel, each with a different lens:
1. **Correctness reviewer** - reads `git show` of the new commits and the code around them. Looks for loops that never end, counters that never reset, state that survives death, races, regressions in nearby rules.
2. **Tests reviewer** - do the new tests fail without the fix and could they pass while live behaviour is broken? Missing regression cases.
3. **Design reviewer** - does the change fit the architecture (`docs/BOT_BEHAVIOR.md`), is it the simplest fix at the root cause, does it add another ad hoc counter?
4. **Evidence reviewer** (when the change claims to help the success rate) - is there data behind it, how would it be measured (paired A/B on the same slots, n and power), what could it make worse?

Every reviewer answers in this exact shape, under 350 words:
- Scores 0-100% with a 1-2 sentence justification citing file:line or data: **Correctness, Test quality, Design fit, Evidence, Risk of regression (higher = riskier)**, and an **Overall**.
- **Findings**, ranked by expected impact: severity (blocker / major / minor), file:line, why it matters, the specific fix.
- **Verdict**: PASS (all scores >= 70% and no blocker), FIX (list what), or REVERT (with reason).

## 3. Feedback loop
- Merge the reviews into one table: item, reviewers who raised it, severity, decision (fix / skip with reason).
- Send every blocker and major finding back to a builder (`SendMessage` to the same agent when it is still alive, else a new `implementer`). One more review round after the fixes, at most 3 rounds. Stop earlier if all scores >= 70% and no blockers.
- Do not bundle: big fix rounds caused regressions in this project. One change per commit, and behaviour changes go behind a param or env switch so they can be A/B tested.

## 4. Report to the user
- What was built (commits), the score table per reviewer, what was fixed after feedback, what was skipped and why, the real test output, and what still needs a live check or an eval.
- Say plainly if a gate was not run.
