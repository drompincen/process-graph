# Phase 1: Problem Statement

## Project
BPMN Process Graph Visualizer — renders before/after process improvement diagrams from JSON.

## Core Problem
Arrow routing produces visually incorrect diagrams. Arrows enter boxes from the wrong side,
don't connect at edge centers, and the padding post-processor destroys approach directions.

## Current Architecture
```
JSON sample → computeLayout() → detectDirection() → getConnectionPoints()
           → path constructor (straightVert, straightHoriz, crossLaneDown, etc.)
           → addPaddingToWaypoints() → rebuildPathD()
           → renderConnectionLabel()
```

## Quantified Issues (from 19-check QA)
- 60 wrong-entry-direction: arrow enters box from wrong side relative to source position
- 24 flow-incomplete: orphan/dead-end nodes (mostly split/overlay phase issues)
- 18 shared-gateway-port: gateway branches share exit port
- 18 shared-arrow-origin: same root cause as shared-gateway-port
- 14 excessive-crossings: too many arrow crossings

## Root Causes
1. `addPaddingToWaypoints` inserts detour waypoints that change the final segment direction
2. `straightVert` L-bend goes H-then-V but padding adds nodes in between, changing approach
3. Gateway port routes don't always separate branches to distinct ports
4. `flow-incomplete` check doesn't account for phase-specific visibility

## Constraints
- Must preserve the 9px arrowhead offset (path stops 9px short, arrowhead fills gap)
- Must not break the 3 currently-passing diagrams
- JSON placement fixes preferred over code changes
- All 4 view modes must be tested (before, after, split, overlay)
- 7 sample files × 4 modes = 28 test cases
