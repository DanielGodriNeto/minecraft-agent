# craft no_tool diagnosis and SPAREPICK

Cause (from code, no server run): craft -> nearbyOrPlaced -> placeFromInventory -> placeSpot finds no free cell in a 1-wide shaft -> digSpot -> breakBlock -> no_tool because no pickaxe is left. Matches the stuck rows (cobblestone 232, stick 11, crafting_table 1, pickaxes empty). STATIONABOVE (off) was a partial workaround; recoveryFor('craft:no_tool') table_spot needs a pickaxe-free path too. Fixed by hand-digging the wall (bot/skills.js digSpot, breakBlock byHand).
Not confirmed: why the spare was missing earlier (stone 130/131 and iron 249/250 wore together). Candidate: spareStep optionalFails cap of 2 drops the spare for good, or visible diamond / home trip outranks it. Not verified in logs.
SPAREPICK: planner.js sparePickStep (before home trip), cap 6, trigger pickLeft < 40 with 1 pickaxe. Tests: tests/planner.test.js (sparePick), tests/skills_units.test.js (breakBlock byHand).
Measure: paired slots, SPAREPICK=1 vs 0, stuck rate and class (b).
