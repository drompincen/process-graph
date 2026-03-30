# Process Graph — Multi-Agent Test Plan

> How to run the full Playwright E2E suite, and how agents should split the work.

---

## Quick Start

```bash
cd testing
npm install
npx playwright install --with-deps chromium firefox
npm test
```

`global-setup.js` starts the JBang backend automatically.
`global-teardown.js` kills it when done.
The backend must not already be running on port 8080.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js ≥18 | https://nodejs.org |
| JBang | https://jbang.dev / `sdk install jbang` |
| Java 17+ | Any JDK distribution |
| Playwright browsers | `npx playwright install --with-deps chromium firefox` |

---

## Directory Layout

```
testing/
  journeys.md               — All user stories (source of truth for what is tested)
  TESTING.md                — This file
  package.json              — Playwright dependency
  playwright.config.js      — Config: baseURL, globalSetup/Teardown, 4 workers
  global-setup.js           — Start JBang backend, wait for port 8080
  global-teardown.js        — SIGTERM the backend process
  tests/
    helpers.js              — Shared page helpers (loadApp, openOptions, enableEditMode…)
    01-smoke.spec.js        — J1: App loads, API OK, selector populated
    02-diagram-loading.spec.js  — J2: All 3 sample diagrams, URL params
    03-view-modes.spec.js   — J3: Before/Split/After/Overlay buttons
    04-diff.spec.js         — J4: diff-added/diff-removed classes, phase dots
    05-simulation.spec.js   — J5: Token, log pane, step badges, pause, ff
    06-edit-mode.spec.js    — J6: Drag, snap, undo, inline label edit
    07-json-editor.spec.js  — J7: Live edit, validation, upload, download
    08-sequence-view.spec.js — J8: UML sequence SVG
    09-narrative.spec.js    — J9: Story slides, KPI HUD, keyboard nav
    10-metrics.spec.js      — J10: Metrics panel, KPI HUD, benefits cards
    11-export.spec.js       — J11: SVG/PNG/PDF export
    12-options.spec.js      — J12: Options menu, light theme, panel toggles
    13-zoom.spec.js         — J13: Fit/HD/4K zoom presets
```

---

## Chapter-Based Execution Plan

See **`chapters/CHAPTERS.md`** for the master tracker and full multi-agent plan.
Chapter files contain per-task instructions, progress reporting format, fix guides,
and done-when criteria.

```
testing/chapters/
  CHAPTERS.md                  ← master tracker (update this as chapters complete)
  ch0-infrastructure/tasks.md  ← T1–T3:  npm install, JBang backend, smoke gate
  ch1-smoke-loading/tasks.md   ← T4–T7:  01-smoke + 02-diagram-loading (B1+B2 parallel)
  ch2-views-diff/tasks.md      ← T8–T11: 03-view-modes + 04-diff (C1+C2 parallel)
  ch3-simulation/tasks.md      ← T12–T15: 05-simulation + visual slow-mo (D single)
  ch4-edit-json/tasks.md       ← T16–T19: 06-edit-mode + 07-json-editor (E1+E2 parallel)
  ch5-sequence-narrative/tasks.md ← T20–T23: 08-sequence + 09-narrative (F1+F2 parallel)
  ch6-panels-export/tasks.md   ← T24–T27: 10-metrics + 11-export (G1+G2 parallel)
  ch7-options-zoom/tasks.md    ← T28–T31: 12-options + 13-zoom (H1+H2 parallel)
  ch8-full-validation/tasks.md ← T32–T34: full chromium + firefox run + report (I sequential)
```

### Multi-Agent Execution Plan

Playwright runs 4 workers in parallel (`workers: 4`). For human agents writing or
fixing tests, the table below assigns each spec to an agent stream.

### Phase 1 — Backend Up (sequential, 1 agent)

```
Agent SETUP:
  1. cd testing && npm install
  2. npx playwright install --with-deps chromium
  3. Verify: curl http://localhost:8080/api/diagrams  (or let global-setup do it)
```

### Phase 2 — All spec agents in parallel (8 agents)

After the backend confirms healthy, launch all agents simultaneously:

| Agent | Owns | Command |
|-------|------|---------|
| TA-1 | `01-smoke.spec.js` | `npx playwright test tests/01-smoke.spec.js` |
| TA-2 | `02-diagram-loading.spec.js` | `npx playwright test tests/02-diagram-loading.spec.js` |
| TA-3 | `03-view-modes.spec.js` + `04-diff.spec.js` | `npx playwright test tests/03-* tests/04-*` |
| TA-4 | `05-simulation.spec.js` | `npx playwright test tests/05-simulation.spec.js` |
| TA-5 | `06-edit-mode.spec.js` | `npx playwright test tests/06-edit-mode.spec.js` |
| TA-6 | `07-json-editor.spec.js` | `npx playwright test tests/07-json-editor.spec.js` |
| TA-7 | `08-sequence-view.spec.js` + `09-narrative.spec.js` | `npx playwright test tests/08-* tests/09-*` |
| TA-8 | `10-metrics.spec.js` + `11-export.spec.js` + `12-options.spec.js` + `13-zoom.spec.js` | `npx playwright test tests/10-* tests/11-* tests/12-* tests/13-*` |

Each agent:
1. Runs its spec files
2. Reports pass/fail per story ID (e.g. `J5-S3 PASS`)
3. On failure: attaches screenshot + trace from `playwright-report/`
4. Opens a GitHub issue or comments on the failing task

### Phase 3 — Full run + report (1 agent)

```bash
npm test
npx playwright show-report
```

---

## Running Specific Journeys

```bash
# Single journey
npx playwright test tests/05-simulation.spec.js

# Grep by story ID
npx playwright test --grep "J5-S3"

# All journeys in headed mode (debugging)
npm run test:headed

# Interactive UI mode
npm run test:ui
```

---

## Failure Triage Guide

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Port 8080 not open within 60000ms` | JBang not on PATH or Java missing | Install JBang; verify `jbang --version` |
| `[data-node-id]` not found | JS module import error at startup | Check browser console in trace |
| Token never appears (J5) | `state.layout` null at simulate time | renderAll must complete before simulate |
| `is-editing` not set (J6) | Edit mode CSS/JS mismatch | See `interactions.js` `initEditModeToggle` |
| ViewBox wrong in zoom tests (J13) | `state.zoomPreset` not wired | Check zoom-btn click handler in `main.js` |
| Narrative never opens (J9) | `graph.story` missing or null | Use `order-approval.json` only |

---

## Coverage Matrix

| Journey | Stories | Spec file |
|---------|---------|-----------|
| J1 Smoke | 5 | 01-smoke |
| J2 Loading | 8 | 02-diagram-loading |
| J3 View Modes | 6 | 03-view-modes |
| J4 Diff | 6 | 04-diff |
| J5 Simulation | 9 | 05-simulation |
| J6 Edit Mode | 9 | 06-edit-mode |
| J7 JSON Editor | 6 | 07-json-editor |
| J8 Sequence | 5 | 08-sequence-view |
| J9 Narrative | 9 | 09-narrative |
| J10 Metrics | 8 | 10-metrics |
| J11 Export | 6 | 11-export |
| J12 Options | 8 | 12-options |
| J13 Zoom | 7 | 13-zoom |
| **Total** | **92** | **13 spec files** |
