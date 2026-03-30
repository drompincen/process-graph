# Process-Graph

BPMN-style business process diagramming app — swimlanes, orthogonal routing,
before/after diff views, process simulation, narrative mode, and KPI tracking.
Styled after the archviz dark aesthetic.

---

## Running

**Prerequisites:** Java 17+ and [JBang](https://jbang.dev)

```bash
# Linux / macOS
./run.sh

# Windows (PowerShell)
./run.ps1
```

App opens at **http://localhost:8080**

The backend (`ProcessGraph.java`) is a single-file Spring Boot app launched via JBang.
It serves the frontend as static files and exposes one API endpoint (`GET /api/diagrams`)
that auto-discovers the diagrams in `sample/`.

To add a new diagram: drop a `.json` file into `sample/` — it appears in the dropdown on next load.

---

## Agent Operating Protocol

> This section is the authoritative guide for any agent (or agent team) working
> on this repo. Read it before touching any code.

### 1. Always start by reading the task list

```
TaskList   →  find the lowest-numbered unblocked pending task
TaskGet N  →  read the full description before starting
```

Never start work without claiming a task first.

### 2. Claim before you code

```
TaskUpdate N status=in_progress owner=<your-agent-id>
```

This prevents two agents picking up the same task.

### 3. Divide and conquer — parallel windows

The work is organised into 5 parallel execution windows (see `plans/DELIVERY.md`).
Within each window, multiple agents can run simultaneously on different tasks.
**Never work on a task whose `blockedBy` list contains any incomplete task.**

```
Window 1 — CH0 (sequential):  T1 → T2 → T3 → T4
Window 2 — CH1 (3 parallel):  T5 | T6 | T8  (then T7, T9, T10)
Window 3 — CH2+CH3 (6 parallel): T11|T12|T13|T15|T17|T19 (then T14|T16|T18|T20)
Window 4 — CH4 (2 parallel):  T21 | T23  (then T22)
Window 5 — CH5 (sequential):  T24 → T25 → T26
```

### 4. Use the chapter tasks.md as your checklist

Each chapter has a `plans/chapters/chN-*/tasks.md`. Tick output checkboxes as
files are created. This is the persistent record — the task system is the live
signal.

### 5. Mark completed immediately when done

```
TaskUpdate N status=completed
```

Do this **before** starting the next task. Completing a task unblocks downstream
agents automatically.

### 6. Report status every 15 seconds during implementation

When actively implementing, print a brief status line every ~15 seconds:

```
[T1 ▶ 0:15] Writing index.html DOM structure — header + stage + log-pane done
[T1 ▶ 0:30] Adding all SVG layer <g> IDs — nodes/connections/annotations layers done
[T1 ✓ 0:45] index.html complete. Starting state.js
```

Format: `[T{id} {▶|✓|✗} {elapsed}] {what you just finished or are doing next}`

### 7. Never skip the acceptance criteria

Each task description ends with "Done when:" criteria. Do not mark a task
complete until those criteria pass. If blocked, create a new task describing
the blocker rather than marking the original complete.

### 8. Key reference files

| What you need | Where to look |
|---|---|
| Task specs (full detail) | `plans/01-agent-A-foundation.md` through `plans/06-agent-F-export-polish.md` |
| Chapter checklists | `plans/chapters/chN-*/tasks.md` |
| JSON schema | `plans/data-model.md` |
| Agent launch prompts | `plans/agent-prompts.md` |
| Overall delivery map | `plans/DELIVERY.md` |
| Archviz reference code | `/mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/` |
| Style reference (dark SVG) | `preview.html`, `uml_example.html` |

### 9. File conventions

- All JS files are ES modules (`import`/`export`) — no CommonJS
- CSS uses `--css-vars` from `core.css` — no hard-coded colour values in component CSS
- SVG nodes use `data-node-id` attribute for targeting
- Arrowheads are explicit `<polygon>` elements — never `marker-end`
- All coordinates lane-relative in JSON (`laneY`), absolute in layout object

### 10. When you finish your chapter

Update the chapter's `tasks.md` (tick all output checkboxes) and update
`plans/DELIVERY.md` Overall Progress table to `✅ Complete`. Then run
`TaskList` to see what just unblocked.

---

## Quick Start (for humans)

```bash
# Open in browser — no build step required
open index.html
# or
python3 -m http.server 8080  # then visit localhost:8080
```

---

## Project Structure

```
process-graph/
  index.html              App shell
  js/
    main.js               Entry point
    state.js              Global state + DOM refs
    constants.js          BPMN icons, colour maps, default JSON
    data.js               JSON parser + validator
    layout.js             Lane geometry + node bounds (pure math)
    renderer.js           SVG node shapes + lane rendering + renderAll
    routing.js            Orthogonal path engine + arrowheads
    diff.js               Before/after diff + view mode switching
    sequence-view.js      BPMN sequence diagram SVG
    narrative.js          AS-IS→TO-BE story slides
    animation.js          Process simulation token + step badges
    interactions.js       Drag/snap/edit + Options wiring
    file-ops.js           JSON editor + upload/download
    metrics.js            Metrics panel + KPI HUD
    benefits.js           Improvement benefit cards
    export.js             SVG/PNG/PDF export
  css/
    core.css              Layout, header, theme vars (dark + light)
    diagram.css           SVG node shapes, lane styles
    diff.css              Diff state colour overlays
    animation.css         keyframes (popIn, fadeIn, slideIn, tokenPulse)
    panels.css            Metrics, KPI HUD, benefits cards
    narrative.css         Story slide layouts
    widgets.css           JSON editor, log pane, notebook, toasts
  sample/
    order-approval.json   Canonical demo (all features exercised)
  plans/
    DELIVERY.md           Master chapter tracker
    chapters/             Per-chapter task checklists
    *.md                  Full agent specs
```

---

## Feature Summary

| Feature | Status |
|---|---|
| Swimlane diagram (horizontal lanes, rotated labels) | ⬜ |
| 7 BPMN node types (start/end events, task, subprocess, gateway, annotation, intermediate event) | ⬜ |
| Orthogonal routing (right-angle paths, no bezier) | ⬜ |
| 3 connection types (sequence solid, message dashed-blue, conditional dashed-amber) | ⬜ |
| Before / Split / After / Overlay view modes | ⬜ |
| Diff engine (added/removed/changed/unchanged per node) | ⬜ |
| Process simulation (SVG token, step badges, log pane, popups) | ⬜ |
| Edit mode (drag 20px snap, inline label edit, Ctrl+Z undo) | ⬜ |
| JSON editor sidebar + file upload/download | ⬜ |
| Sequence view (BPMN sequence diagram SVG) | ⬜ |
| Narrative mode (AS-IS→TO-BE story slides, KPI targets) | ⬜ |
| Process metrics panel (before/after KPI deltas) | ⬜ |
| KPI HUD (live accumulation during story mode) | ⬜ |
| Benefits panel (improvement cards, progress bars, node highlighting) | ⬜ |
| SVG / PNG / PDF export | ⬜ |
| Dark / Light theme | ⬜ |
| Phase dots (incremental rollout phases) | ⬜ |
| Flow dropdown (named process paths) | ⬜ |
| URL params (?process=, ?story=, ?view=) | ⬜ |
