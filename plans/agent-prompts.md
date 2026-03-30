# Agent Launch Prompts
## Copy-paste prompts for spawning each implementation agent

> Each prompt is self-contained. The agent should read the relevant plan file
> first, then the archviz reference files listed, then implement.
> Working directory: `/mnt/c/Users/drom/IdeaProjects/process-graph`

---

## Agent A — Foundation

```
You are implementing the foundation layer of a BPMN process-graph diagramming app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/01-agent-A-foundation.md  (your spec)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (JSON schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/collab-animation.html      (HTML structure reference)
4. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/css/core.css               (CSS vars reference)
5. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/state.js                (state singleton reference)
6. /mnt/c/Users/drom/IdeaProjects/process-graph/preview.html                     (existing style reference)

Implement all files listed in the plan's "Deliverables" table.
Prioritise: index.html, state.js, constants.js, data.js, core.css, sample/order-approval.json.
The app must open in a browser without JS errors after your work.
Do not implement rendering logic — leave stub calls for renderer.js, routing.js, etc.
```

---

## Agent B1 — Swimlane Layout Engine

```
You are implementing the swimlane layout engine for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/02-agents-B-rendering.md  (your spec, Agent B1 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (JSON schema)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/js/state.js                      (state singleton — already implemented by Agent A)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/data.js                       (data parser — already implemented)
5. /mnt/c/Users/drom/IdeaProjects/process-graph/preview.html                     (coordinate reference)

Implement: js/layout.js
Export: computeLayout(graph, svgWidth), getConnectionPoints(src, tgt, dir), NODE_DIMS constant.
Pure coordinate math only — no DOM manipulation.
Write a self-test at the bottom (behind if (import.meta.url === ...) guard) that validates computeLayout
against the sample JSON.
```

---

## Agent B2 — Node Shape Renderer

```
You are implementing SVG node shape rendering for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/02-agents-B-rendering.md  (your spec, Agent B2 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (JSON schema — node types)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/js/layout.js                     (layout engine output shape)
4. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/rendering.js            (archviz render() pattern)
5. /mnt/c/Users/drom/IdeaProjects/process-graph/uml_example.html                 (SVG style reference)
6. /mnt/c/Users/drom/IdeaProjects/process-graph/preview.html                     (diff overlay style reference)

Implement: js/renderer.js, css/diagram.css
Export: renderAll(graph), renderLanes(graph, layout), renderNodes(graph, layout, viewMode),
        renderMetricsBar(graph, layout), injectDefs(layout).
All 7 node types must render. Diff overlay chips (NEW/REMOVED) must render in #overlays-layer.
```

---

## Agent B3 — Orthogonal Routing Engine

```
You are implementing the orthogonal connection routing engine for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/02-agents-B-rendering.md  (your spec, Agent B3 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (connection types)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/js/layout.js                     (layout engine output)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/uml_example.html                 (orthogonal path examples)
5. /mnt/c/Users/drom/IdeaProjects/process-graph/preview.html                     (arrowhead polygon technique)

Implement: js/routing.js
Export: renderConnections(graph, layout, viewMode), computeOrthogonalPath(conn, layout).
All 6 routing cases must work: straight-horiz, straight-vert, loop-back, cross-lane-down,
cross-lane-up, elbow. All 3 connection types (sequence, message, conditional) must render
with correct dash/color. Arrowheads must be explicit polygons (not SVG markers).
```

---

## Agent C1 — Diff Engine + Before/After Views

```
You are implementing the diff engine and before/after view modes for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/03-agents-C-views.md  (your spec, Agent C1 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md          (phase visibility rules)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/js/renderer.js               (renderAll orchestration)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/layout.js                 (split view geometry)
5. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/core-data.js        (isVisibleInPhase reference)

Implement: js/diff.js, css/diff.css
Export: classifyDiff(graph), computeDiffMetrics(graph), renderPhaseDots(graph), isVisible(item, viewMode, phase).
The 4 view mode buttons (Before/Split/After/Overlay) must all work.
Split view renders both sides in one SVG with divider line.
Overlay applies CSS diff classes to node <g> elements.
```

---

## Agent C2 — Sequence View

```
You are implementing the BPMN sequence/message flow view for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/03-agents-C-views.md      (your spec, Agent C2 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (sequence step schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/sequence-view.js        (reference implementation)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/state.js                      (state.activeSequence)

Implement: js/sequence-view.js
Adapt archviz sequence-view.js for BPMN context (BPMN participants not tech services).
Sequence view checkbox must toggle between spatial and sequence panels.
Adaptive column widths based on label length.
Status icons on participant headers (✓ ready / ⏳ wip).
```

---

## Agent C3 — Narrative Mode

```
You are implementing the AS-IS → TO-BE narrative story mode for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/03-agents-C-views.md      (your spec, Agent C3 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (story object schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/narrative.js            (reference implementation ~900 lines)
4. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/css/narrative.css          (slide styles reference)

Implement: js/narrative.js, css/narrative.css
Adapt archviz narrative.js: replace arch-specific language with process-improvement language.
Problem slide → "AS-IS Current State". Vision slide → "TO-BE Target State".
Phase slides → improvement initiative cards.
Keyboard navigation (arrow keys, space, escape) required.
KPI HUD updates as user navigates slides.
```

---

## Agent D1 — Animation Engine

```
You are implementing the process simulation animation engine for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/04-agents-D-interactivity.md  (your spec, Agent D1 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md                  (sequence step schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/animation.js                (reference implementation)
4. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/logging.js                  (log pane reference)
5. /mnt/c/Users/drom/IdeaProjects/process-graph/js/routing.js                        (path waypoints needed for token)

Implement: js/animation.js, css/animation.css
Token is SVG <circle> in #token-layer (not a div like archviz).
Token travels along orthogonal path waypoints (parse M/L commands from pathD).
Step badges in #overlays-layer (SVG, not div children).
All 5 playback controls: Play/Pause/Next/FF/Replay.
Pane resizer for log pane height.
```

---

## Agent D2 — Edit Mode

```
You are implementing drag-to-reposition and inline label editing for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/04-agents-D-interactivity.md  (your spec, Agent D2 section)
2. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/ui-interactions.js          (drag reference)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/js/layout.js                         (coordinate system)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/renderer.js                       (renderAll, syncEditorFromGraph stubs)

Implement: js/interactions.js (edit mode portions)
Drag targets are SVG <g data-node-id> elements (not divs).
20px snap grid (coarser than archviz's 10px).
Lane constraint: dragged node stays in its lane unless Ctrl held.
Inline label edit via <foreignObject> + <textarea>.
Ctrl+Z undo via state.undoStack.
View mode buttons wiring (Before/Split/After/Overlay).
All Options dropdown checkboxes wired to their features.
```

---

## Agent D3 — JSON Editor + File Ops

```
You are implementing the JSON editor sidebar, file upload/download, and UI wiring for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/04-agents-D-interactivity.md  (your spec, Agent D3 section)
2. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/file-operations.js          (file ops reference)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/data-loading.js             (diagram selector reference)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/data.js                           (parseGraph, stripComments)

Implement: js/file-ops.js, css/widgets.css (JSON editor + log pane + notebook styles)
JSON editor sidebar with live "Update Diagram" button.
File upload (validate nodes array), download JSON, diagram selector dropdown.
Notebook widget styled as cream notepad with red margin line.
Diagram auto-discovery from sample/ directory or hardcoded fallback list.
```

---

## Agent E1 — Metrics Panel + KPI HUD

```
You are implementing the process metrics panel and KPI HUD for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/05-agents-E-analytics.md  (your spec, Agent E1 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (metrics schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/narrative.js            (renderKpiHud reference, search for kpiHud)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/js/diff.js                       (computeDiffMetrics)
5. /mnt/c/Users/drom/IdeaProjects/process-graph/preview.html                     (metrics bar SVG reference)

Implement: js/metrics.js, css/panels.css (metrics section)
SVG metrics bar at diagram bottom with before/after delta badges.
Floating metrics panel (toggled via Options) with all 6 KPI rows.
KPI HUD (story mode top-right) with live accumulation per phase.
Delta badge logic: ↓50% green, ↑25% red, string metrics displayed as-is.
```

---

## Agent E2 — Benefits Panel

```
You are implementing the process improvement benefits panel for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/05-agents-E-analytics.md  (your spec, Agent E2 section)
2. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/data-model.md              (story.benefits schema)
3. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/benefits.js             (reference implementation)
4. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/css/benefits.css           (card styles reference)

Implement: js/benefits.js, append to css/panels.css
Benefit cards: title, icon (✅/⏳), KPI range, progress bar, bound node chips.
Auto-positioning: right-side if space ≥ 200px, else bottom-right.
Click on card or chip → highlight bound SVG nodes for 3 seconds (green glow).
Phase accumulation: show benefits up to and including selectedPhase.
```

---

## Agent F — Export + Polish

```
You are implementing export functionality and final polish for a BPMN process-graph app.

Read these files first:
1. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/06-agent-F-export-polish.md  (your spec)
2. /mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/js/export-pdf.js              (PDF export reference)
3. /mnt/c/Users/drom/IdeaProjects/process-graph/css/core.css                        (existing CSS vars)
4. /mnt/c/Users/drom/IdeaProjects/process-graph/plans/06-agent-F-export-polish.md  (integration checklist)

Implement: js/export.js, css/animations.css, light theme additions to css/core.css
SVG export: self-contained with inlined CSS in <defs><style>.
PNG export: html2canvas at 2× scale.
PDF export modal: 3 options (diagram/sequence/both).
Light theme: --css-var overrides + SVG fill overrides.
All 7 integration scenarios in the acceptance checklist must pass.
```
