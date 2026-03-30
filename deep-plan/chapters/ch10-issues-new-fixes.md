# Chapter 10 — Visual & Layout Fixes (from issues_new, issues_new2)

> **Priority:** HIGH — visible rendering bugs in complex diagrams (5th attempt)
> **Parallel Agents:** 4 (Agent 10-T runs first, then 10-A/B/C in parallel)
> **Source:** issues_new.png (zoomed), issues_new2.png (full Lean Six Sigma diagram)
> **Testing:** TEST-FIRST — geometric assertion library written BEFORE any fixes

---

## Goal
Fix all visual and layout bugs captured in the issues_new*.png screenshots.
These affect complex multi-lane diagrams (especially Lean Six Sigma sample)
where node density exposes spacing, overlap, and routing failures.

**Critical difference from previous attempts:** This chapter uses a
**test-first approach**. Agent 10-T builds the geometric test infrastructure
and runs it against the CURRENT code to capture a baseline of failures.
Only then do Agents 10-A/B/C implement fixes — and every fix must flip
specific failing tests to green. No fix is considered done until its
corresponding geometric assertion passes across ALL 8 sample diagrams.

---

## Issue Analysis

### issues_new.png (zoomed view)
- Annotated "boxes on top of each other" — nodes stacking in same lane position
- Duplicate/overlapping decision diamonds ("Approved" rendered twice)
- "No" labels clipped or floating off decision arrows
- Annotation callout ("A Bottleneck 2-3 day delay") overlapping working nodes
- Dashed vertical arrow cutting straight through nodes (not routing around)
- Floating disconnected label "ahead"
- "Auto Budget Validation" node pushed far below, misplaced from its lane

### issues_new2.png (full Lean Six Sigma: Warranty Claim Processing)
- Extreme horizontal cramping — nodes overlapping each other within lanes
- Arrows routing through node bodies instead of around them
- Cross-lane arrows rendering as diagonals, not clean orthogonal paths
- White/blank rectangles (broken node rendering)
- Excessive unnecessary connection crossings
- Decision branch labels (Yes/No) overlapping or mispositioned
- Diagram doesn't scale gracefully at higher node density (>20 nodes)

---

## Why Previous Fixes Failed (Test Audit Findings)

The existing test suite has **critical blind spots** that let visual bugs pass:

| Problem | Evidence |
|---------|----------|
| `getBBox()` used without `getCTM()` transform correction | Dragged/repositioned nodes report pre-move coordinates |
| Zero lane-containment tests | Nodes escape lanes — tests still pass |
| Zero arrow-through-node collision tests | Arrows cut through nodes undetected |
| Zero connection label position tests | Labels float disconnected — no failure |
| Zero visual regression baselines | No golden screenshots for comparison |
| Tautological assertion in J10-S6 | `expect(count).toBeGreaterThanOrEqual(0)` — always true |
| DOM-structural tests only | Check element existence, not WHERE they render |
| `getAllNodeBBoxes` defined locally in 2 files | Not shared, not using transforms |

---

## PHASE 1: Agent 10-T — Test Infrastructure (RUNS FIRST)

> **Must complete before any fixes begin.**
> Creates the geometric assertion library, runs it against current code,
> captures the baseline failure count per diagram.

### Tasks

#### 10.T1 Create Geometric Helpers Library (`testing/tests/geo-helpers.js`)

Build a shared helper module with these functions, all using **`getCTM()` +
`matrixTransform()`** for correct SVG-space coordinates:

**Core data extraction:**
- `getAllNodeBBoxes(page)` — Returns `[{ id, x, y, w, h }]` for all visible
  nodes. Uses `getCTM()` to transform `getBBox()` corners through nested
  transforms to SVG root coordinates. Filters out zero-size boxes.
- `getAllConnections(page)` — Returns `[{ id, from, to, d }]` for all
  `<path data-conn-id>` elements in the connections layer.
- `getAllConnectionLabels(page)` — Returns `[{ connId, x, y, text }]` for
  all `<text>` elements associated with connections.
- `getLaneBounds(page)` — Returns `[{ id, y, height, x, width }]` for each
  lane `<rect>` in the lanes layer.

**Path parsing:**
- `parsePathToWaypoints(d)` — Parses SVG path `d` attribute into `[[x,y]]`
  waypoints. Handles M, L, H, V commands (orthogonal routing output).

**Geometric primitives:**
- `lineIntersectsRect(x1,y1,x2,y2, rx,ry,rw,rh)` — Cohen-Sutherland
  line-rect intersection test.
- `pointToSegmentDistance(px,py, x1,y1,x2,y2)` — Shortest distance from
  point to line segment.

**Assertion functions (return `{ pass, violations }`):**
- `assertNoOverlaps(page, padding=0)` — N² check on all node pair bounding
  boxes. Reports `{ pair: [idA, idB], overlapX, overlapY }` per violation.
- `assertWithinLane(page)` — For each node, find its containing lane by
  vertical center, then check top/bottom are within lane bounds (5px tolerance).
  Reports `{ nodeId, issue, overflow }` per violation.
- `assertOrthogonalArrows(page)` — For each connection path, parse waypoints
  and check every segment has `dx < 1` or `dy < 1`. Reports angle violations.
- `assertArrowsAvoidNodes(page)` — For each connection, check that NO
  intermediate path segment intersects any non-endpoint node bounding box
  (3px shrink on box to avoid edge-touching false positives).
- `assertLabelsAttached(page, maxDist=30)` — For each connection label,
  measure min distance to its path segments. Fail if > maxDist.
- `assertNoDuplicateIds(page)` — Check all `[id]` elements inside
  `#diagram-svg` for uniqueness.

#### 10.T2 Create Baseline Failure Spec (`testing/tests/17-geometric-baseline.spec.js`)

Run ALL 6 assertion functions against ALL 8 sample diagrams × 3 view modes
(before/split/after). This spec is expected to FAIL on the current code.

Structure:
```javascript
const ALL_DIAGRAMS = [
  'order-approval.json', 'lean-six-sigma.json',
  'manufacturing-fulfillment.json', 'expense-claim.json',
  'incident-response.json', 'decision-flow.json',
  'onboarding.json', 'ticket-triage.json',
];
const VIEW_MODES = ['before', 'split', 'after'];

for (diagram of ALL_DIAGRAMS) {
  for (mode of VIEW_MODES) {
    test('no overlaps', ...);
    test('within lanes', ...);
    test('orthogonal arrows', ...);
    test('arrows avoid nodes', ...);
    test('labels attached', ...);
    test('no duplicate IDs', ...);
  }
}
```

Each test logs violations to console on failure (for debugging) and uses
descriptive failure messages: `"3 overlapping pairs in lean-six-sigma/after: ..."`.

#### 10.T3 Create Visual Regression Spec (`testing/tests/18-visual-regression.spec.js`)

Use Playwright's `toHaveScreenshot()` for pixel-diff baseline testing:

- Screenshot ONLY `#diagram-svg` (not full page — avoids toolbar noise)
- Config: `maxDiffPixelRatio: 0.002`, `threshold: 0.04`, `animations: 'disabled'`
- Test matrix: all 8 diagrams × 3 view modes = 24 golden screenshots
- Separate baselines per browser project (`{projectName}/` in snapshot path)
- Initial baseline generation: `npx playwright test --update-snapshots`

Add to `playwright.config.js`:
```javascript
expect: {
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.002,
    threshold: 0.04,
    animations: 'disabled',
  },
},
snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
```

#### 10.T4 Create Stress Test Spec (`testing/tests/19-stress-test.spec.js`)

- Inject a synthetic 40-node diagram via the JSON editor panel
  (4 lanes × 10 nodes per lane, chained connections)
- Run all 6 geometric assertions against it
- Verify `nodeCount >= 30` actually rendered
- Separately test: expand to 60 nodes, verify no browser timeout

#### 10.T5 Run Baseline & Record Failure Counts

Execute the full test suite against CURRENT code (no fixes yet):
```bash
cd testing && npx playwright test tests/17-geometric-baseline.spec.js --reporter=json
```

Record per-diagram, per-assertion failure counts in a markdown table in this
chapter file. These become the "before" numbers that fixes must improve.

#### 10.T6 Fix Existing Test Issues

- Fix tautological `expect(count).toBeGreaterThanOrEqual(0)` in `10-metrics.spec.js`
- Promote `getAllNodeBBoxes`, `findOverlaps`, `getPathD` from local defs in
  `14-drag-advanced.spec.js` and `16-gateway-routing.spec.js` to imports from
  `geo-helpers.js`
- Delete or convert the 5 `debug-arrow*.spec.js` files (no assertions, just noise)

---

## PHASE 2: Agents 10-A, 10-B, 10-C — Fixes (RUN IN PARALLEL after 10-T)

### Agent 10-A: Node Overlap & Spacing Engine

**Files:** `js/layout.js`, `js/constants.js`

#### 10.1 Fix Node-on-Node Overlap Detection
- In `layout.js`, after coordinate assignment, run a **collision pass** that
  detects any two nodes whose bounding boxes overlap (with 20px padding)
- When overlap detected: shift the second node right (or down if same column)
  by `nodeWidth + NODE_GAP`
- Must handle both auto-layout and manual (JSON-specified) coordinates
- **Gate test:** `assertNoOverlaps(page)` passes for ALL 8 diagrams

#### 10.2 Fix Minimum Horizontal Spacing
- Enforce `NODE_GAP_H = 80` minimum between any two same-lane-row nodes
- In `autoLayout()` layer assignment: each column gets 80px clearance minimum
- For manually-positioned nodes: nudge rightward node if within 80px
- **Gate test:** `assertNoOverlaps(page, padding=10)` passes (10px min gap)

#### 10.3 Fix Lane Boundary Containment
- After layout, clamp pass: `node.y >= laneTop + 20` and
  `node.y + nodeHeight <= laneBottom - 20`
- If node doesn't fit: expand lane height to accommodate
- Detect nodes pushed below all lanes and reassign to correct lane
- **Gate test:** `assertWithinLane(page)` passes for ALL 8 diagrams

#### 10.4 Fix Annotation Overlap with Working Nodes
- After placing working nodes, position annotations in secondary pass
  avoiding all working node bounding boxes
- Prefer placement left/right of target, fallback above/below
- Annotation callout line must not cross other nodes
- **Gate test:** `assertNoOverlaps(page)` includes annotations

---

### Agent 10-B: Arrow Routing & Label Fixes

**Files:** `js/routing.js`, `js/renderer.js`

#### 10.5 Fix Arrows Routing Through Nodes
- After computing initial path, run **node avoidance pass**: for each
  segment, check intersection with all non-endpoint node bounding boxes
  (use `lineIntersectsRect` with 3px shrink)
- If intersection: add waypoints to detour above or below (shorter path wins)
- Apply to all connection types (sequence, message, conditional)
- **Gate test:** `assertArrowsAvoidNodes(page)` passes for ALL 8 diagrams

#### 10.6 Fix Cross-Lane Arrow Orthogonal Routing
- Enforce strict H/V segments: exit source horizontally → vertical in lane
  gap → enter target horizontally
- Adjacent lanes: single L-bend. Non-adjacent: Z-shaped with vertical in
  inter-lane gaps (not through lane bodies)
- **Gate test:** `assertOrthogonalArrows(page)` passes for ALL 8 diagrams

#### 10.7 Fix Decision Branch Label Positioning
- Place labels at 25% of path length from source (not geometric midpoint)
- Offset perpendicular: "Yes" above/left, "No" below/right (consistent)
- If label would overlap a node: shift further along path
- Add semi-transparent background rect behind label text
- **Gate test:** `assertLabelsAttached(page, 30)` passes for ALL 8 diagrams

#### 10.8 Fix Floating Disconnected Labels
- Always recompute label position from CURRENT path coordinates
- After any layout change, force label reposition
- Remove orphaned `<text>` elements with no corresponding `<path>`
- **Gate test:** `assertLabelsAttached(page, 40)` passes; zero orphan texts

---

### Agent 10-C: Rendering Integrity & Dense Diagram Scaling

**Files:** `js/renderer.js`, `js/routing.js`, `js/layout.js`

#### 10.9 Fix Blank/Broken Node Rendering
- In `renderNode()`: defensive checks for missing/empty label, missing type,
  missing lane
- Unknown type → fallback to `task` rendering (not blank rect)
- Empty label → render "[Untitled]" placeholder
- Ensure switch covers ALL types: task, decision, terminal, annotation,
  subprocess, merge, process-group, start-event, end-event, intermediate-event
- **Gate test:** Synthetic JSON with broken data renders with no blank rects

#### 10.10 Reduce Unnecessary Connection Crossings
- After computing all paths, run crossing reduction pass
- Heuristic: same-direction connections route in same vertical order as sources
- Shared-target connections fan in from consistent side
- **Gate test:** lean-six-sigma crossing count reduced vs naive (log both counts)

#### 10.11 Dense Diagram Scaling
- If node count > 15: multiply `NODE_GAP` and `NODE_GAP_H` by 1.5×
- If node count > 25: multiply by 2×
- Auto-expand SVG canvas width proportionally
- Zoom-to-fit on initial load for large diagrams
- **Gate test:** 40-node stress test passes all geometric assertions

#### 10.12 Duplicate Node Rendering Prevention
- Before rendering, check for existing `<g data-node-id="X">` — remove first
- Add `clearDiagram()` at start of every full render pass
- Investigate root cause: likely double render() or stale DOM on view switch
- **Gate test:** `assertNoDuplicateIds(page)` passes for ALL 8 diagrams + all view modes

---

## PHASE 3: Final Validation

### 10.V1 Run Full Geometric Suite
```bash
cd testing && npx playwright test tests/17-geometric-baseline.spec.js
```
ALL 144 tests (8 diagrams × 3 modes × 6 assertions) must pass.

### 10.V2 Run Visual Regression
```bash
cd testing && npx playwright test tests/18-visual-regression.spec.js --update-snapshots
```
Generate golden screenshots AFTER all fixes are applied. Review each
screenshot manually against the issues_new*.png to confirm fixes are visible.

### 10.V3 Run Stress Tests
```bash
cd testing && npx playwright test tests/19-stress-test.spec.js
```
40-node synthetic diagram must pass all geometric assertions.

### 10.V4 Run Full Existing Suite (No Regressions)
```bash
cd testing && npx playwright test
```
ALL existing tests must still pass (no regressions from ch8/ch9 fixes).

### 10.V5 Cross-Browser Verification
Run full suite on both Chromium AND Firefox projects:
```bash
cd testing && npx playwright test --project=chromium --project=firefox
```

---

## Execution Order

```
 Phase 1 (Sequential — must complete first)
 ┌──────────────────────────────────────────────────┐
 │ Agent 10-T: Test Infrastructure                   │
 │  T1 → T2 → T3 → T4 → T5 → T6                   │
 │  Deliverables:                                    │
 │   - testing/tests/geo-helpers.js                  │
 │   - testing/tests/17-geometric-baseline.spec.js   │
 │   - testing/tests/18-visual-regression.spec.js    │
 │   - testing/tests/19-stress-test.spec.js          │
 │   - Baseline failure count table                  │
 │   - Existing test cleanup                         │
 └──────────────────────┬─────────────────────────────┘
                        │
 Phase 2 (Parallel — after Phase 1)
 ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
 │ Agent 10-A   │ │ Agent 10-B   │ │ Agent 10-C   │
 │ Overlap &    │ │ Arrow &      │ │ Rendering &  │
 │ Spacing      │ │ Labels       │ │ Scaling      │
 │ 10.1-10.4    │ │ 10.5-10.8    │ │ 10.9-10.12   │
 └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
        └────────────────┼────────────────┘
                         │
 Phase 3 (Sequential — after all fixes)
 ┌──────────────────────────────────────────────────┐
 │ Validation: V1 → V2 → V3 → V4 → V5              │
 └──────────────────────────────────────────────────┘
```

---

## File Change Map

| File | Agent | Changes |
|------|-------|---------|
| `testing/tests/geo-helpers.js` | 10-T | **NEW** — Complete geometric assertion library |
| `testing/tests/17-geometric-baseline.spec.js` | 10-T | **NEW** — 144 geometric tests across all diagrams |
| `testing/tests/18-visual-regression.spec.js` | 10-T | **NEW** — 24 golden screenshot tests |
| `testing/tests/19-stress-test.spec.js` | 10-T | **NEW** — 40/60-node synthetic diagram tests |
| `testing/playwright.config.js` | 10-T | Add `toHaveScreenshot` config + snapshot path |
| `testing/tests/helpers.js` | 10-T | Import & re-export geo-helpers for shared use |
| `testing/tests/10-metrics.spec.js` | 10-T | Fix tautological assertion |
| `js/layout.js` | 10-A | Collision pass, spacing, lane clamping, annotation placement |
| `js/constants.js` | 10-A | `NODE_GAP_H`, density scaling thresholds |
| `js/routing.js` | 10-B, 10-C | Node avoidance, orthogonal enforcement, crossing reduction |
| `js/renderer.js` | 10-B, 10-C | Label recompute, defensive rendering, dedup |
| `sample/test-edge-cases.json` | 10-C | **NEW** — Synthetic edge-case test data |

---

## Acceptance Criteria (ALL must pass)

- [ ] `geo-helpers.js` exists with all 6 assertion functions + helpers
- [ ] Baseline failure counts recorded before fixes
- [ ] `17-geometric-baseline.spec.js`: 144/144 tests pass (all diagrams × modes × assertions)
- [ ] `18-visual-regression.spec.js`: 24/24 golden screenshots generated & reviewed
- [ ] `19-stress-test.spec.js`: 40-node synthetic diagram passes all assertions
- [ ] Load `lean-six-sigma.json` — zero node overlaps
- [ ] Load `lean-six-sigma.json` — zero arrows through node bodies
- [ ] Load `lean-six-sigma.json` — all cross-lane arrows are orthogonal
- [ ] Load any sample — zero duplicate node IDs in SVG DOM
- [ ] Load any sample — all decision labels visible and near their arrow
- [ ] Load any sample — all nodes contained within their lane bounds
- [ ] Load any sample — no blank/white rectangles
- [ ] All existing test specs still pass (zero regressions)
- [ ] Tests pass on both Chromium AND Firefox
- [ ] Tautological assertion in 10-metrics.spec.js fixed
- [ ] debug-arrow*.spec.js files deleted or converted

---

## Sample Complexity Ranking (test priority order)

| Rank | Sample | Nodes | Conns | Lanes | Why critical |
|------|--------|-------|-------|-------|-------------|
| 1 | lean-six-sigma.json | 33 | 34 | 5 | Most dense, 5 gateways, loops, dual converge |
| 2 | manufacturing-fulfillment.json | 30 | 30 | 4 | 3 sequential subprocesses, rework loop |
| 3 | expense-claim.json | 19 | 18 | 3 | Self-loop, 3-way gateway, annotation |
| 4 | decision-flow.json | 14 | 14 | 3 | Only sample with merge + process-group |
| 5 | order-approval.json | 19 | 14 | 4 | Self-loop, 3 participant types, narrative |
| 6 | incident-response.json | 17 | 17 | 4 | Parallel branches, severity routing |
| 7 | ticket-triage.json | 13 | 11 | 3 | Simplest gateway diagram |
| 8 | onboarding.json | 12 | 10 | 4 | Linear flow, no gateways |
