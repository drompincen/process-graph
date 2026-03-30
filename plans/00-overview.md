# Process-Graph — Multi-Agent Implementation Plan
## Overview & Agent Map

> **Goal:** Deliver the same functional depth as archviz but for BPMN-style
> business process diagrams — swimlanes, orthogonal routing, diff views,
> process simulation, narrative mode, and KPI tracking.

---

## Archviz → Process-Graph Feature Mapping

| Archviz Feature | Process-Graph Equivalent | Delta / New |
|---|---|---|
| Spatial view (div nodes, SVG edges) | Swimlane diagram (SVG-native nodes + orthogonal edges) | New: SVG-native, orthogonal routing, lane layout |
| Sequence view (SVG UML) | Message flow view (BPMN message flows between pools) | New: pools/lanes, BPMN notation |
| Story mode (Problem→Vision→Phases) | Process improvement narrative (AS-IS→TO-BE→Impact) | Adapted: process framing |
| Phase slider (reveals layers) | Before/After toggle + multi-phase improvement rollout | New: diff highlighting |
| Flow dropdown (named sequences) | Path selector (happy path, exception, escalation) | Same concept |
| Step-through animation | Process simulation (token travels swim-lane steps) | New: swimlane-aware routing |
| JSON editor sidebar | JSON editor sidebar | Same |
| Edit mode (drag, grid-snap) | Edit mode (drag, snap to 20px grid) | New: snap to lane grid |
| PDF export | SVG + PNG + PDF export | New: SVG export |
| Dark/Light theme | Dark/Light theme | Same |
| Zones (infrastructure boundaries) | Swimlanes + pools | Lanes replace zones |
| Node types (16 tech types) | BPMN node types (task, subprocess, gateway, events, annotation) | New types |
| Node tags (legacy/new/core…) | Node diff state (added/removed/changed/unchanged) | New diff semantics |
| Node status (ready/wip) | Node state (bottleneck, automated, manual) | New states |
| Benefits panel | Process improvement cards (time/cost/quality KPIs) | Adapted |
| KPI HUD | Process metrics HUD (cycle time, handoffs, error rate) | Adapted |
| Log pane | Step log (process simulation trace) | Same |
| Notebook | Process notes | Same |
| Step badges (animation) | Token/step badges on nodes during simulation | Same |
| Popup toasts | Bottleneck alerts, automation callouts | Adapted |
| Collision-avoiding SVG edges | Orthogonal routing engine | New: right-angle paths |
| Bezier curves | NOT used — orthogonal only | Replaced |
| File upload/download/save | File upload/download/save | Same |
| URL params (`?collab=`, `?story=`) | URL params (`?process=`, `?story=`) | Same |

---

## Agent Stream Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 0 — Foundation (Sequential, all agents depend on this)                   │
│  Agent A  :  Skeleton + State + CSS Architecture + Data Model                  │
└──────────────────────────────┬──────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ PHASE 1 — Rendering (all parallel after Agent A)           │
│  Agent B1       │  │  Agent B2       │  │  Agent B3       │
│  Swimlane       │  │  Node Shapes    │  │  Routing Engine  │
│  Layout Engine  │  │  (all 7 types)  │  │  (orthogonal)   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         └───────────────────┬┴────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ PHASE 2 — View Modes & Interactivity (parallel)           │
│  Agent C1       │ │  Agent C2       │ │  Agent C3       │
│  Diff Engine    │ │  Sequence View  │ │  Narrative Mode │
│  Before/After   │ │  (BPMN msg flow)│ │  AS-IS→TO-BE   │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘

          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Agent D1       │ │  Agent D2       │ │  Agent D3       │
│  Animation      │ │  Edit Mode      │ │  JSON Editor    │
│  Simulation     │ │  Drag + Inline  │ │  + File Ops     │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         └───────────────────┬┴────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ PHASE 3 — Analytics & Polish (parallel)                   │
│  Agent E1       │ │  Agent E2       │ │  Agent F        │
│  Metrics Panel  │ │  Benefits Panel │ │  Export+Polish  │
│  + KPI HUD      │ │  + Improvement  │ │  SVG/PNG/PDF    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## File Structure (target)

```
process-graph/
  index.html
  js/
    main.js           ← Agent A  (entry, init, orchestration)
    state.js          ← Agent A  (singleton state + DOM refs)
    constants.js      ← Agent A  (BPMN icons, default JSON, color maps)
    data.js           ← Agent A  (JSON parse, strip comments, normalize)
    layout.js         ← Agent B1 (lane geometry, absolute coordinate calc)
    renderer.js       ← Agent B2 (SVG node shapes, all 7 BPMN types)
    routing.js        ← Agent B3 (orthogonal path engine, elbow calc)
    diff.js           ← Agent C1 (before/after diff classification)
    sequence-view.js  ← Agent C2 (BPMN message flow / sequence SVG)
    narrative.js      ← Agent C3 (AS-IS→TO-BE story slides)
    animation.js      ← Agent D1 (token simulation, step-through)
    interactions.js   ← Agent D2 (drag, snap, inline label edit)
    file-ops.js       ← Agent D3 (JSON editor, upload, download, save)
    metrics.js        ← Agent E1 (metrics panel + KPI HUD)
    benefits.js       ← Agent E2 (improvement cards, progress bars)
    export.js         ← Agent F  (SVG serialize, PNG, PDF)
  css/
    core.css          ← Agent A  (layout, header, theme vars)
    diagram.css       ← Agent B2 (SVG node shapes, lane styles)
    diff.css          ← Agent C1 (added/removed/changed color overlays)
    animation.css     ← Agent D1 (token animation, badge popIn)
    panels.css        ← Agent E1 (metrics card, KPI HUD, benefits)
    narrative.css     ← Agent C3 (story slides, KPI targets)
    widgets.css       ← Agent D3 (JSON editor, notebook, log pane)
  sample/
    order-approval.json    ← Agent A  (canonical demo diagram)
    ticket-triage.json     ← Agent C3 (narrative demo)
    onboarding.json        ← Agent D1 (simulation demo)
```

---

## Key Architectural Decisions vs Archviz

| Decision | Archviz | Process-Graph | Reason |
|---|---|---|---|
| Node rendering | HTML divs | SVG `<g>` elements | Easier orthogonal routing, single coordinate system, cleaner export |
| Edge routing | Bezier curves | Orthogonal (L-shapes) | BPMN standard; swimlane diagrams need right-angle paths |
| Swimlanes | Zones (div-based) | Native SVG lanes with gradient fills | Lanes are first-class in process diagrams |
| Diff | None | First-class before/after diff with color overlay | Core use case |
| Connection types | One style | Sequence (solid) + Message (dashed blue) + Conditional (dashed amber) | BPMN semantics |
| Node coordinate system | Absolute px | Lane-relative y, absolute x | Enables lane reorder, consistent lane heights |
| Export | PDF only | SVG + PNG + PDF | SVG is self-contained for embedding |

---

## Dependency Graph (critical path)

```
Agent A → Agent B1 → Agent B2 → Agent B3
                              → Agent C1
       → Agent B2 → Agent C2
                  → Agent C3
                  → Agent D1
                  → Agent D2 → Agent D3
       → Agent B3 → Agent D1
                  → Agent E1
       → Agent C1 → Agent E1
                  → Agent E2
       → Agent D1 → Agent F
       → Agent D2 → Agent F
       → Agent E1 → Agent F
       → Agent E2 → Agent F
```

**Critical path:** A → B1 → B2 → B3 → C1 → E1 → F

---

## Phase Summary

| Phase | Agents | Deliverable | Can run in parallel? |
|---|---|---|---|
| 0 — Foundation | A | `index.html`, skeleton JS/CSS, demo JSON, state, data model | No (blocks all) |
| 1 — Rendering | B1, B2, B3 | Working swimlane diagram with all node types and orthogonal edges | Yes (B1/B2/B3 parallel) |
| 2 — Features | C1, C2, C3, D1, D2, D3 | All view modes, diff, simulation, edit mode | Yes (all 6 parallel after Phase 1) |
| 3 — Polish | E1, E2, F | Metrics, benefits, export, light theme | Yes (E1/E2/F parallel after Phase 2) |

---

## Sample JSON (canonical demo)

See `plans/data-model.md` for the complete annotated JSON schema.
See `sample/order-approval.json` for the reference implementation.
