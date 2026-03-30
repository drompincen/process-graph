# Chapter 1 — Rendering Engine
**Agents:** B1 (layout), B2 (shapes), B3 (routing) — run in parallel after CH0
**Blocks:** CH2, CH3

## Parallel Streams

```
B1: T5 ─────────────────────────────────────────────────────────────────┐
B2: T6 ──► T7 ──────────────────────────────────────────────────────────┤──► T10
B3: T8 ──► T9 ──────────────────────────────────────────────────────────┘
```

## Tasks

| ID | Task | Agent | Status | Blocked By |
|----|------|-------|--------|-----------|
| T5  | layout.js — lane geometry + node bounds | B1 | ⬜ | T4 |
| T6  | renderer.js — SVG defs + lane rendering | B2 | ⬜ | T4 |
| T7  | renderer.js — all 7 BPMN node shapes | B2 | ⬜ | T5, T6 |
| T8  | routing.js — straight + vertical paths | B3 | ⬜ | T4 |
| T9  | routing.js — elbow, loop-back + renderConnections | B3 | ⬜ | T8 |
| T10 | renderer.js — renderAll orchestrator + metrics bar | B2 | ⬜ | T6, T7, T9 |

## Outputs

- [ ] `js/layout.js` — `computeLayout()`, `getConnectionPoints()`, `NODE_DIMS` exported
- [ ] `js/renderer.js` — `renderAll()`, `renderLanes()`, `renderNodes()`, `injectDefs()`, `renderMetricsBar()`
- [ ] `js/routing.js` — `renderConnections()`, `computeOrthogonalPath()` for all 6 routing cases
- [ ] `css/diagram.css` — node type classes, diff state classes, cursor states

## Parallel Launch Instructions

After T4 (demo JSON) is complete, launch three agents simultaneously:
- **B1:** Read `plans/02-agents-B-rendering.md` (B1 section). Implement `js/layout.js` only.
- **B2:** Read `plans/02-agents-B-rendering.md` (B2 section). Start with T6 (defs+lanes); T7 needs T5 done first.
- **B3:** Read `plans/02-agents-B-rendering.md` (B3 section). Start with T8; T9 needs T8 done.

## Chapter Complete When

`renderAll(parsedGraph)` draws: grid background, 4 lane bands, all node types, all connections with correct routing and arrowheads, metrics bar.
