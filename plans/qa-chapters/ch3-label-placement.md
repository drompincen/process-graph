# Chapter 3: Label Placement Fixes
## Iteration 15

### Labels Colliding With Nodes (0 violations)
Labels must never overlap node shapes.

✓ No label-node collisions

### Detached Labels (0 violations)
Connection labels must be anchored near their path.

✓ No detached labels

### Parallelism
- Label anchor logic: single fix in js/routing.js (label positioning section)
- Label-node collision avoidance: may also need JSON node spacing adjustments (parallel with Ch2)
