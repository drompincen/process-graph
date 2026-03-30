# Process Designer — Deep Plan Progress Tracker

> **Goal:** Transform the current process-graph viewer (~55% complete) into a full
> Process Designer Editor matching every rule in `rules.txt.txt`.
> **Total Gaps:** 36 features across 8 chapters → **60 tasks implemented**
> **Architecture:** Multi-agent parallel execution per chapter (19 agents total)

---

## Status Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked

---

## Chapter 0 — Data Model & Port System Foundation ✅
**Agents:** 2 parallel | **Files touched:** `state.js`, `data.js`, `constants.js`, `sample/decision-flow.json`
- [x] 0.1 Define port model (id, direction, cardinality, position)
- [x] 0.2 Add Merge node type to constants + data model
- [x] 0.3 Add Process Group node type to constants + data model
- [x] 0.4 Define connection matrix as config object
- [x] 0.5 Add swimlane `type` field (persona/system/agent/department)
- [x] 0.6 Update JSON schema to include new node/port/lane fields
- [x] 0.7 Update sample JSONs with new types

## Chapter 1 — Rendering: New Node Types & Ports ✅
**Agents:** 2 parallel | **Files touched:** `renderer.js`, `routing.js`, `layout.js`, `css/diagram.css`, `state.js`
- [x] 1.1 Render Merge node (small circle r=15 with gradient)
- [x] 1.2 Render Process Group container (header + collapsible body)
- [x] 1.3 Render visible port anchors on hover/select
- [x] 1.4 Decision node distinct port geometry (top-in, L/R/bottom-out)
- [x] 1.5 Port anchor visual indicators (small circles at port positions)
- [x] 1.6 Angular separation for decision outgoing arrows (min 20°)
- [x] 1.7 Process Group collapse/expand toggle

## Chapter 2 — Connection System & Arrow Rules ✅
**Agents:** 3 parallel | **Files touched:** `routing.js`, `interactions.js`, `data.js`, `constants.js`, `css/diagram.css`
- [x] 2.1 Implement connection matrix validation engine (canConnect)
- [x] 2.2 Port-to-port snapping (arrows snap to specific ports, not node edges)
- [x] 2.3 Enforce decision port cardinality (0-1 arrow per port, 2-5 total)
- [x] 2.4 Block invalid connections with red highlight + tooltip
- [x] 2.5 Arrow label anchoring at geometric path midpoint with auto-reposition
- [x] 2.6 Cross-lane handoff auto-annotation (dashed circle indicator)
- [x] 2.7 No self-connections enforcement
- [x] 2.8 No arrows crossing swimlane headers
- [x] 2.9 Minimum 8-12px padding enforcement on all routes (ARROW_PADDING=10)

## Chapter 3 — Editor: Node & Connection Creation ✅
**Agents:** 3 parallel | **Files touched:** `interactions.js`, `renderer.js`, `state.js`, `css/panels.css`, `css/widgets.css`, `css/diagram.css`, `index.html`
- [x] 3.1 Node palette / toolbar (drag-and-drop node creation, 8 node types)
- [x] 3.2 Drag-to-connect: draw arrow from port to port
- [x] 3.3 Valid target port highlighting during drag-to-connect (green/dim)
- [x] 3.4 Node deletion (select + Delete key, with connection cleanup)
- [x] 3.5 Connection deletion (click arrow + Delete key)
- [x] 3.6 Node property editor panel (dynamic fields per node type)
- [x] 3.7 Context menu (right-click) for nodes, connections, and canvas
- [x] 3.8 Multi-select (Shift+click and box select)

## Chapter 4 — Swimlane Editing & Reassignment ✅
**Agents:** 2 parallel | **Files touched:** `interactions.js`, `layout.js`, `renderer.js`, `state.js`
- [x] 4.1 Swimlane creation UI (+ button with name/type/color form)
- [x] 4.2 Swimlane deletion UI (right-click, empty-only guard)
- [x] 4.3 Swimlane renaming (double-click header, inline input)
- [x] 4.4 Swimlane type selection (persona/system/agent/department with icons)
- [x] 4.5 Drag node across lanes → update owner metadata (full 2D drag)
- [x] 4.6 Swimlane auto-resize based on content (min 120px)
- [x] 4.7 Lane reordering (drag lane header with insertion indicator)

## Chapter 5 — Validation Engine ✅
**Agents:** 2 parallel | **Files touched:** new `validation.js`, new `validation-ui.js`, `renderer.js`, `state.js`, `css/widgets.css`, `index.html`, `main.js`
- [x] 5.1 Exactly one Start node validation
- [x] 5.2 At least one End node validation
- [x] 5.3 No dangling arrows validation
- [x] 5.4 All decision branches must reconnect (BFS convergence check)
- [x] 5.5 Cycle detection via DFS (unless loop mode enabled)
- [x] 5.6 All tasks must belong to a swimlane
- [x] 5.7 No orphaned nodes (bidirectional BFS from Start)
- [x] 5.8 No unlabelled decision branches
- [x] 5.9 Decision node: exactly 1 incoming, 2-5 outgoing
- [x] 5.10 All outgoing arrows from distinct ports
- [x] 5.11 Validation UI panel (clickable issues, node navigation, warning badges)
- [x] 5.12 Loop mode toggle for allowing cycles

## Chapter 6 — Layout, Zoom & Mini-Map ✅
**Agents:** 2 parallel | **Files touched:** `layout.js`, `interactions.js`, `renderer.js`, `index.html`, `css/widgets.css`, new `minimap.js`
- [x] 6.1 Auto-layout engine (Sugiyama-style: BFS layers, barycenter, crossing reduction)
- [x] 6.2 "Clean Layout" button in toolbar
- [x] 6.3 Grid snap at 10px (verified already set)
- [x] 6.4 Node overlap prevention during drag
- [x] 6.5 Mini-map widget (bottom-right canvas, viewport indicator)
- [x] 6.6 Mini-map click-to-navigate (click + drag)
- [x] 6.7 Smooth zoom refinement (toward cursor, 20-300%, zoom-to-fit on dbl-click)

## Chapter 7 — Advanced Features & Polish ✅
**Agents:** 3 parallel | **Files touched:** `animation.js`, new `versioning.js`, new `comments.js`, `validation.js`, `validation-ui.js`, `state.js`, `index.html`, `main.js`, `css/panels.css`, `css/widgets.css`, new `css/animation.css`, `deep-plan/schema.json`
- [x] 7.1 Undo/redo expansion (full graph snapshots cover all ops, redo stack added)
- [x] 7.2 Versioning: save/restore named snapshots (versioning.js + panel UI)
- [x] 7.3 Commenting system (per-node threads, badges, popover UI)
- [x] 7.4 KPI overlays on diagram nodes (toggle, colored pills)
- [x] 7.5 Time/duration simulation mode (parseDuration, clock, speed control, summary)
- [x] 7.6 Agent-based simulation (multi-token, probability weights, P50/P90/P99 stats)
- [x] 7.7 JSON Schema file updated with all new fields
- [x] 7.8 Process Group nesting limit (max 3 levels, in validation.js)
- [x] 7.9 Decision-to-Decision connection config toggle (UI checkbox + state)

---

## Execution Summary

| Phase | Chapters | Agents | Status |
|-------|----------|--------|--------|
| 1 | Ch0 (Foundation) | 2 | ✅ Complete |
| 2 | Ch1 + Ch2 (Rendering + Connections) | 5 | ✅ Complete |
| 3 | Ch3 + Ch5 (Editor + Validation) | 5 | ✅ Complete |
| 4 | Ch4 + Ch6 (Swimlanes + Layout) | 4 | ✅ Complete |
| 5 | Ch7 (Advanced) | 3 | ✅ Complete |
| **Total (Ph1-5)** | **8 chapters** | **19 agents** | **60/60 tasks ✅** |

---

## Chapter 8 — Visual Fixes (from issues2, issues3, issues4)
**Agents:** 3 parallel | **Source:** issues2.png, issues3.png, issues4.png
- [x] 8.1 Fix vertical node distribution (nodes cramped at top of lane)
- [x] 8.2 Fix nodes crossing lane boundaries (clamp to lane bounds)
- [x] 8.3 Fix SVG canvas size (massive empty space below diagram)
- [x] 8.4 Fix auto-layout lane centering
- [x] 8.5 Fix cross-lane arrow routing (diagonal cuts → orthogonal)
- [x] 8.6 Fix message/dashed arrow routing (use same algo as sequence)
- [x] 8.7 Fix decision label positioning (Yes/No placement)
- [x] 8.8 Fix annotation callout arrows (broken/disconnected)
- [x] 8.9 Fix swimlane header labels (show icon + readable name)
- [x] 8.10 Swimlane header layout (proper sizing + visibility)
- [x] 8.11 Swimlane visual separation (dividers + alternating opacity)

## Chapter 9 — Visual Polish & Inspiration (from inspiration.png, inspiration2.png) ✅
**Agents:** 3 parallel | **Source:** n8n / Railway workflow editor aesthetics
- [x] 9.1 Card-style nodes with shadows + accent bar
- [x] 9.2 Node type icons (clipboard, question mark, play, stop, etc.)
- [x] 9.3 Node subtitle/description line (duration, owner, description)
- [x] 9.4 Interactive "+" port buttons (replace static circles)
- [x] 9.5 Smooth curved arrows option (bezier alternative to orthogonal)
- [x] 9.6 Arrow hover effects (width, brightness, tooltip)
- [x] 9.7 Connection flow animation (animated dots along arrows)
- [x] 9.8 Process group colored section styling
- [x] 9.9 Grid & background refinement (smaller dots, crosshairs)
- [x] 9.10 Typography & readability improvements
- [x] 9.11 Toolbar & panel visual polish
- [x] 9.12 Color theme refinement (richer dark, cleaner light)

## Chapter 10 — Visual & Layout Fixes (from issues_new, issues_new2) 🔲
**Agents:** 4 (10-T first, then 10-A/B/C parallel) | **Source:** issues_new.png, issues_new2.png
**Approach:** TEST-FIRST — geometric assertions before fixes (5th attempt, no more regressions)

### Phase 1: Agent 10-T — Test Infrastructure (RUNS FIRST)
- [ ] 10.T1 Create geo-helpers.js (getCTM-based bounding boxes, path parsing, 6 assertion fns)
- [ ] 10.T2 Create 17-geometric-baseline.spec.js (144 tests: 8 diagrams × 3 modes × 6 assertions)
- [ ] 10.T3 Create 18-visual-regression.spec.js (24 golden screenshots with pixel diff)
- [ ] 10.T4 Create 19-stress-test.spec.js (40-node synthetic diagram)
- [ ] 10.T5 Run baseline & record failure counts (before fixes)
- [ ] 10.T6 Fix existing test issues (tautological assertion, dedup helpers, delete debug specs)

### Phase 2: Parallel Fix Agents (after 10-T completes)

#### Agent 10-A: Node Overlap & Spacing Engine
- [ ] 10.1 Fix node-on-node overlap detection (collision pass in layout.js)
- [ ] 10.2 Fix minimum horizontal spacing (80px NODE_GAP_H enforcement)
- [ ] 10.3 Fix lane boundary containment (clamp pass + lane auto-expand)
- [ ] 10.4 Fix annotation overlap with working nodes (secondary placement pass)

#### Agent 10-B: Arrow Routing & Label Fixes
- [ ] 10.5 Fix arrows routing through nodes (node avoidance pass)
- [ ] 10.6 Fix cross-lane arrow orthogonal routing (strict H/V segments)
- [ ] 10.7 Fix decision branch label positioning (25% path offset + side consistency)
- [ ] 10.8 Fix floating disconnected labels (recompute from current path coords)

#### Agent 10-C: Rendering Integrity & Dense Diagram Scaling
- [ ] 10.9 Fix blank/broken node rendering (defensive type/label fallbacks)
- [ ] 10.10 Reduce unnecessary connection crossings (crossing reduction pass)
- [ ] 10.11 Dense diagram scaling (auto-expand gaps for 15+/25+ node diagrams)
- [ ] 10.12 Duplicate node rendering prevention (clear + dedup before render)

### Phase 3: Validation
- [ ] 10.V1 All 144 geometric tests pass
- [ ] 10.V2 24 golden screenshots generated & reviewed
- [ ] 10.V3 Stress tests pass
- [ ] 10.V4 All existing tests pass (zero regressions)
- [ ] 10.V5 Cross-browser (Chromium + Firefox)

---

## Chapter 11 — Options Panel & Light Theme Fixes 🔲
**Agents:** 2 (11-T first, then 11-A) | **Source:** User report: light theme not working
**Approach:** TEST-FIRST

### Phase 1: Agent 11-T — Test Infrastructure
- [ ] 11.T1 Create 20-options-comprehensive.spec.js (all 10 option toggles)
- [ ] 11.T2 Create 21-light-theme.spec.js (visual element color verification + WCAG contrast)
- [ ] 11.T3 Theme persistence & interaction tests (across diagram/mode switches)

### Phase 2: Agent 11-A — Light Theme Fixes
- [ ] 11.1 Fix SVG canvas & grid background in light theme
- [ ] 11.2 Fix node fills in light theme (all 10 types)
- [ ] 11.3 Fix lane backgrounds in light theme
- [ ] 11.4 Fix connection colors in light theme
- [ ] 11.5 Fix panel & widget backgrounds in light theme
- [ ] 11.6 Fix diff overlay colors in light theme

---

## Extended Execution Plan

| Phase | Chapters | Agents | Status |
|-------|----------|--------|--------|
| 6 | Ch8 (Visual Fixes) | 3 | ✅ Complete |
| 7 | Ch9 (Visual Polish) | 3 | ✅ Complete |
| 8 | Ch10 (Issues New — Test-First) | 4 | 🔲 Not Started |
| 9 | Ch11 (Options & Light Theme) | 2 | 🔲 Not Started |

## Codebase Growth

| Metric | Before | After Ch0-9 |
|--------|--------|-------------|
| JS + CSS lines | ~5,400 | ~13,000+ |
| JS modules | 10 | 14 (+validation, validation-ui, versioning, comments, minimap) |
| Node types | 8 | 10 (+merge, process-group) |
| Feature completeness | ~55% | ~95% |
