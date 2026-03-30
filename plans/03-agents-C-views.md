# Agents C1, C2, C3 — View Modes
## Diff Engine · Sequence View · Narrative Mode

**Depends on:** Agents A + B (foundation + rendering)
**C1, C2, C3 run in parallel**
**C1 blocks:** Agent E1 (Metrics Panel uses diff results)
**C3 blocks:** Agent E2 (Benefits Panel used inside narrative)

---

## Agent C1 — Diff Engine + Before/After Views
**Files:** `js/diff.js` + `css/diff.css`

### View Modes

The header has 4 view-mode buttons. `state.viewMode` controls which is active.

| Button | `viewMode` | Behaviour |
|---|---|---|
| Before | `'before'` | Show only nodes/connections with `phase: 'before'` or `phase: 'both'` |
| Split | `'split'` | Two side-by-side half-diagrams in one SVG; vertical divider at x=svgWidth/2 |
| After | `'after'` | Show only nodes/connections with `phase: 'after'` or `phase: 'both'` |
| Overlay | `'overlay'` | After diagram + diff highlights (green added, red removed, amber changed) |

### Split View Layout

In `split` mode, `layout.js` uses half the SVG width for each side:
- Before nodes: rendered in x range `[labelColW, svgWidth/2 - 20]`
- After nodes: rendered in x range `[svgWidth/2 + 20, svgWidth - 20]`
- Vertical divider: dashed line at `x = svgWidth/2`
- Header labels: "BEFORE" left of divider, "AFTER" (green) right of divider

```xml
<!-- Divider line -->
<line x1="550" y1="0" x2="550" y2="{svgHeight}"
      stroke="#222d40" stroke-width="1.5" stroke-dasharray="6,4"/>

<!-- Section labels in header -->
<text x="314" y="29" fill="#64748b" ...>BEFORE</text>
<line x1="105" y1="24" x2="275" y2="24" stroke="#2a3550"/>

<text x="828" y="29" fill="#22c55e" ...>AFTER</text>
<line x1="565" y1="24" x2="790" y2="24" stroke="#1a3a22"/>
```

### Diff Classification (`diff.js`)

```js
/**
 * Compare before-phase and after-phase node sets.
 * Mutates graph.nodes — adds computed `_diff` property to each node.
 */
export function classifyDiff(graph) {
  const before = new Map(
    graph.nodes.filter(n => n.phase === 'before' || n.phase === 'both').map(n => [n.id, n])
  );
  const after = new Map(
    graph.nodes.filter(n => n.phase === 'after'  || n.phase === 'both').map(n => [n.id, n])
  );

  graph.nodes.forEach(node => {
    const inBefore = before.has(node.id);
    const inAfter  = after.has(node.id);

    if (inBefore && !inAfter)  node._diff = 'removed';
    else if (!inBefore && inAfter) node._diff = 'added';
    else if (inBefore && inAfter) {
      const b = before.get(node.id), a = after.get(node.id);
      node._diff = (b.label !== a.label || b.type !== a.type || b.lane !== a.lane)
        ? 'changed'
        : 'unchanged';
    }
  });
}

/**
 * Compute process improvement metrics from diff results.
 * Returns delta values to populate the metrics bar.
 */
export function computeDiffMetrics(graph) {
  const added     = graph.nodes.filter(n => n._diff === 'added').length;
  const removed   = graph.nodes.filter(n => n._diff === 'removed').length;
  const changed   = graph.nodes.filter(n => n._diff === 'changed').length;
  const handoffsBefore = graph.connections.filter(c => c.phase === 'before' && c.crossLane).length;
  const handoffsAfter  = graph.connections.filter(c => c.phase === 'after'  && c.crossLane).length;
  return { added, removed, changed, handoffsBefore, handoffsAfter };
}
```

### Overlay Mode

In `overlay` mode:
1. Render all `after`-phase nodes normally
2. Apply CSS class `diff-added`, `diff-removed`, or `diff-changed` to each `<g data-node-id>`
3. Removed nodes still rendered but dimmed + strikethrough text + red glow
4. Added nodes get green glow
5. Changed nodes get amber glow

### `css/diff.css`

```css
/* Overlay mode — applied as class on <g data-node-id> */
.node.diff-added rect,
.node.diff-added polygon {
  fill: rgba(34, 197, 94, 0.12);
  stroke: #22c55e;
  stroke-width: 1.8px;
}
.node.diff-added { filter: url(#glow-green); }

.node.diff-removed rect,
.node.diff-removed polygon {
  fill: rgba(239, 68, 68, 0.12);
  stroke: #ef4444;
  stroke-width: 1.8px;
  opacity: 0.8;
}
.node.diff-removed { filter: url(#glow-red); }
.node.diff-removed text { text-decoration: line-through; }

.node.diff-changed rect,
.node.diff-changed polygon {
  fill: rgba(245, 158, 11, 0.12);
  stroke: #f59e0b;
  stroke-width: 1.8px;
}
.node.diff-changed { filter: url(#glow-amber); }

/* Diff stat chips in overlay mode header */
.diff-stat-added   { background: #14532d; color: #86efac; }
.diff-stat-removed { background: #7f1d1d; color: #fca5a5; }
.diff-stat-changed { background: #78350f; color: #fcd34d; }
```

### Phase dots (improvement phases)

When `graph.phases` is present, render dot indicators in the header bar:

```js
export function renderPhaseDots(graph, layout) {
  // Dots are small circles; active = filled, past = border-only, future = dim
  // Click: set state.selectedPhase, re-render
  // Shows nodes tagged with that phase AND 'both' nodes
}
```

---

## Agent C2 — Sequence View (BPMN Message Flow)
**File:** `js/sequence-view.js`

### What it shows

A separate SVG panel activated by the "Sequence View" checkbox. Shows the
animation sequence steps as a UML-style sequence diagram with:
- Participant columns (one per unique node appearing in `activeSequence`)
- Vertical lifelines (dashed)
- Horizontal arrows with step labels
- Status icons on participants (ready ✓ / wip ⏳)

This is directly adapted from archviz `sequence-view.js` with BPMN framing.

### Differences from archviz

- Participants are BPMN nodes (not architecture services)
- Arrows are grouped by swimlane (participant header shows lane name)
- Message flows shown as dashed arrows; sequence flows as solid arrows
- No separate "actor" concept — every participant is a process node

### Adaptive column width

```js
const MIN_COL_W = 140;
const MAX_COL_W = 200;

function calcColWidth(participants) {
  const maxLabel = Math.max(...participants.map(p => p.label.length));
  if (maxLabel > 20) return MAX_COL_W;
  if (maxLabel > 14) return 160;
  return MIN_COL_W;
}
```

### SVG structure

```
┌──────────┬────────────┬────────────┬───────────┐  ← participant headers
│  Start   │  Submit    │  Auto      │  Manager  │     (height=60px)
│          │  Form      │  Check     │  Review   │
└──────────┴────────────┴────────────┴───────────┘
     │            │           │            │         ← lifelines (dashed)
     │───────────→│           │            │         ← step 1 arrow + label
     │            │──────────→│            │         ← step 2
     │            │           │───────────→│         ← step 3
     │            │           │←───────────│         ← step 4 (return)
```

---

## Agent C3 — Narrative Mode (AS-IS → TO-BE Story)
**Files:** `js/narrative.js` + `css/narrative.css`

### Overview

Directly adapted from archviz `narrative.js` (900+ lines). The story structure
maps to process improvement language:
- **Problem slide** → AS-IS pain points, baseline metrics, affected steps
- **Vision slide** → TO-BE state, KPI targets, acceptance criteria
- **Phase slides** → Improvement initiatives, idea cards, timeline

### Trigger

`graph.story` key present → show 📖 Story button in header.
Click → activate narrative mode (full-page overlay, keyboard navigation).

### Slide types

#### Problem Slide
```
┌─────────────────────────────────────────────────────────────┐
│  AS-IS: Current State                                       │
│  ─────────────────────────────────────────────────────────  │
│  "Purchase approvals take 2–3 days and have 15% error rate" │
│                                                             │
│  [48 hrs avg cycle time]  <── impact badge                  │
│                                                             │
│  Description: Finance manually checks every request...      │
│                                                             │
│  🔴 Risks:                                                  │
│    • Manual checks miss policy changes                      │
│    • No audit trail                                         │
│                                                             │
│  🔗 Evidence: Q3 Process Audit | Employee Survey            │
│                                                             │
│  In Scope:  [Submit Form] [Finance Check] [Mgr Review]      │
└─────────────────────────────────────────────────────────────┘
```

#### Vision Slide
```
┌─────────────────────────────────────────────────────────────┐
│  TO-BE: Target State                                        │
│  ─────────────────────────────────────────────────────────  │
│  "Automated portal reduces approvals to under 2 hours"      │
│                                                             │
│  KPI Targets:                                               │
│  Cycle Time  ████████░░░░  1–2 hrs  (was 48)  High conf    │
│  Error Rate  ███░░░░░░░░░  1–3%     (was 15%) Medium conf  │
│  Handoffs    ██░░░░░░░░░░  1        (was 4)   High conf    │
│                                                             │
│  ✓ Acceptance Criteria:                                     │
│    • Portal handles 100% of standard requests (<$10k)       │
└─────────────────────────────────────────────────────────────┘
```

#### Phase Slide
```
┌──────────────────────────────────────┬──────────────────────┐
│  Phase 2: Automate                   │  Benefits            │
│  ─────────────────────────────────   │  ──────────────────  │
│  Real-time API call to Finance       │  ⏳ Faster Approvals  │
│  system replaces manual spreadsheet  │  48h → 1–2h          │
│  check — removes Finance lane        │  ████████░░  ↓96%    │
│                                      │                      │
│  ┌─────────────────────────────────┐ │  KPI HUD             │
│  │ 💡 Auto Budget Check            │ │  ──────────────────  │
│  │ Cycle Time  ↓30h  (high conf)   │ │  Cycle Time: 48h     │
│  │ Handoffs    ↓2    (high conf)   │ │  ▼ lower is better  │
│  └─────────────────────────────────┘ │                      │
└──────────────────────────────────────┴──────────────────────┘
```

### KPI HUD (top-right, updates per slide)

Same as archviz KPI HUD — live running total of KPI values as user navigates
through phases. Accumulates `expectedKpiImpacts` from idea cards.

### `css/narrative.css`

```css
#narrative-view {
  position: fixed; inset: var(--header-h) 0 0 0;
  z-index: 200;
  background: var(--bg-main);
  display: grid;
  grid-template-columns: 1fr 280px;
  overflow: hidden;
}

.slide-card {
  border-radius: 12px;
  padding: 32px;
  animation: slideIn 0.3s ease;
}
.slide-problem { background: linear-gradient(135deg, #1a0505, #2a0a0a); border: 1px solid #7f1d1d; }
.slide-vision  { background: linear-gradient(135deg, #051a0a, #0a2a12); border: 1px solid #14532d; }
.slide-phase   { background: linear-gradient(135deg, #050d1a, #0a1527); border: 1px solid #1e3a5f; }

.kpi-target-bar { /* progress bar showing baseline → target range */ }
.idea-card { /* hypothesis + KPI delta chips */ }

@keyframes slideIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

### HTML sanitization

Same as archviz — allow: `b, strong, i, em, u, br, ul, ol, li, p, sub, sup` only.
Strip all other tags before rendering slide description HTML.

### Keyboard shortcuts

```js
document.addEventListener('keydown', e => {
  if (!state.storyMode) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') navigateSlide(+1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')                     navigateSlide(-1);
  if (e.key === 'Escape')                                                  hideNarrative();
});
```

### Back-to-story button

When user clicks a "scope chip" node in problem slide → exits narrative, zooms
to that node in the spatial diagram. Shows "← Back to Story" bar above canvas.

---

## Shared: `renderAll()` orchestration

`js/renderer.js` exports a top-level `renderAll(graph)` that:
1. Calls `classifyDiff(graph)` (diff.js)
2. Calls `computeLayout(graph, svgWidth)` (layout.js)
3. Calls `renderLanes(graph, layout)` (renderer.js)
4. Calls `renderNodes(graph, layout, viewMode)` (renderer.js)
5. Calls `renderConnections(graph, layout, viewMode)` (routing.js)
6. Calls `renderMetricsBar(graph, layout)` (renderer.js)
7. Calls `renderPhaseDots(graph)` (diff.js)
8. Calls `updateFlowDropdown(graph)` (renderer.js)
9. If narrative: calls `renderNarrativeControls(graph)` (narrative.js)
10. If sequence view: calls `renderSequenceView(graph)` (sequence-view.js)
