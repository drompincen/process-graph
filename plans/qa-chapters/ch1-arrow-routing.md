# Chapter 1: Arrow Routing Fixes
## Iteration 15

### Diagonal Arrows (0 violations)
Arrows must be purely orthogonal (horizontal or vertical segments only).

✓ No diagonal arrows found

### Arrows Through Nodes (0 violations)
No arrow may pass through a non-endpoint node.

✓ No arrow-through-node violations

### Parallelism
- Diagonal arrow fixes: modify `js/routing.js` (single file, all fixes in parallel)
- Arrow-through-node: split between routing.js fixes and JSON coordinate adjustments (parallel tracks)
