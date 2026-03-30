# Chapter 5: JSON Sample Coordinate Adjustments
## Iteration 15

These are the specific JSON sample files that need node position / lane height changes.
**Each file can be edited independently — maximum parallelism.**

✓ No JSON adjustments needed — all samples are geometrically clean

### Adjustment Strategy
1. For overlapping nodes: increase `x` spacing by at least the overlap amount + 30px buffer
2. For crowded nodes: increase `x` gap to ≥ 40px
3. For lane spills: increase lane `height` by spill amount + 20px buffer
4. For label collisions: increase spacing between source and target nodes by 60px
5. After JSON edits, re-run the QA loop to verify fixes
