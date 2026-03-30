# Process Graph — Test Journeys & User Stories

> This document is the authoritative source for what Playwright tests cover.
> Every spec file maps back to a journey here.

---

## Actors

| Actor | Description |
|-------|-------------|
| **Analyst** | Reads process diagrams to understand current state |
| **Consultant** | Presents before/after improvements to stakeholders |
| **Editor** | Modifies diagrams in-place (drag, label, JSON) |
| **Developer** | Integrates diagrams into reports (export) |

---

## Journey 1 — Smoke & Load (J1)

**Goal:** App is reachable, API responds, default diagram renders.

| ID | Story | Acceptance |
|----|-------|------------|
| J1-S1 | As any user, I open the app and see a rendered diagram | `#diagram-svg` has `<g>` children; no JS errors in console |
| J1-S2 | As any user, the backend API returns a diagram list | `GET /api/diagrams` returns JSON array with ≥1 entry |
| J1-S3 | As any user, the diagram selector is populated | `#json-selector` has ≥1 `<option>` elements |
| J1-S4 | As any user, switching diagrams re-renders | Change selector → new diagram title appears in SVG header |

---

## Journey 2 — Diagram Loading (J2)

**Goal:** Each sample diagram loads without errors and renders its structure.

| ID | Story | Acceptance |
|----|-------|------------|
| J2-S1 | Load `order-approval.json` | SVG contains ≥15 node groups (`[data-node-id]`) |
| J2-S2 | Load `ticket-triage.json` | SVG contains lane labels; no console errors |
| J2-S3 | Load `onboarding.json` | SVG contains ≥12 node groups |
| J2-S4 | Load via URL param `?process=ticket-triage.json` | Correct diagram loads on page open |
| J2-S5 | Load via URL param `?view=before` | View mode set to Before on page open |
| J2-S6 | Notes field renders in notebook when `notes` present | `#notebook` becomes visible |

---

## Journey 3 — View Modes (J3)

**Goal:** Analyst switches between Before / Split / After / Overlay views and sees correct node visibility.

| ID | Story | Acceptance |
|----|-------|------------|
| J3-S1 | Click Before → only before-phase nodes visible | Nodes with `phase=after` have `display:none` or are absent |
| J3-S2 | Click After → only after-phase nodes visible | Nodes with `phase=before` absent from SVG |
| J3-S3 | Click Split → both before and after nodes visible | Combined node count > Before-only count |
| J3-S4 | Click Overlay → both sets visible with diff classes | SVG nodes have `diff-added` or `diff-removed` classes |
| J3-S5 | Active button reflects current mode | Only the active `.view-btn` has class `active` |
| J3-S6 | URL param `?view=after` pre-selects After mode | After button is `active` on load |

---

## Journey 4 — Diff Engine (J4)

**Goal:** Analyst sees colour-coded additions, removals, and changes in Overlay mode.

| ID | Story | Acceptance |
|----|-------|------------|
| J4-S1 | Overlay mode — added nodes get `diff-added` class | At least one node has class `diff-added` in order-approval |
| J4-S2 | Overlay mode — removed nodes get `diff-removed` class | At least one node has class `diff-removed` |
| J4-S3 | Phase dots appear for diagrams with phases | `#phase-dots` is non-empty |
| J4-S4 | Clicking a phase dot filters to that phase | Node count changes after clicking first phase dot |
| J4-S5 | Clicking the active phase dot again shows all phases | Node count returns to full after deselect |

---

## Journey 5 — Process Simulation (J5)

**Goal:** Analyst runs an animated walkthrough of the process and reads step logs.

| ID | Story | Acceptance |
|----|-------|------------|
| J5-S1 | Click Simulate → token appears on SVG | `.anim-token` element present in `#token-layer` |
| J5-S2 | Token moves to second node | After 1.5s, token `cx` attribute has changed |
| J5-S3 | Log pane receives entries | `#log-entries` has ≥1 `.log-entry` child |
| J5-S4 | Step badge appears on visited node | `.step-badge` element present in `#token-layer` |
| J5-S5 | Pause stops movement | Click Pause → token position frozen for 1s |
| J5-S6 | Next-step advances one step while paused | Log entry count increments by exactly 1 |
| J5-S7 | Fast-forward completes simulation quickly | All steps log within 3s |
| J5-S8 | Second Simulate click restarts from beginning | Log entries cleared; new token at step 0 |
| J5-S9 | Pause/Step checkbox forces step-by-step mode | Auto-advance does not occur after enabling |
| J5-S10 | Delay slider changes step duration | `state.stepDelay` reflects slider value |

---

## Journey 6 — Edit Mode (J6)

**Goal:** Editor drags nodes, edits labels, and uses undo/redo.

| ID | Story | Acceptance |
|----|-------|------------|
| J6-S1 | Enable Edit Mode → body has class `is-editing` | `document.body.classList.contains('is-editing')` is true |
| J6-S2 | Enable Edit Mode → node cursor is `grab` | CSS computed cursor on `[data-node-id]` is `grab` |
| J6-S3 | Drag a node 40px right → position updates | Node `transform` translate X increases by ~40px |
| J6-S4 | Dragged position snaps to 20px grid | Final X is a multiple of 20 |
| J6-S5 | Ctrl+Z reverts drag | Node returns to original position |
| J6-S6 | Double-click node shows inline text input | `<input>` with z-index appears |
| J6-S7 | Type new label + Enter → label updates in SVG | Node `<text>` contains the new value |
| J6-S8 | Ctrl+Z reverts label change | Label returns to original |
| J6-S9 | Disable Edit Mode → body loses `is-editing` | Class removed |

---

## Journey 7 — JSON Editor (J7)

**Goal:** Editor views and modifies the raw JSON, uploads a file, and downloads.

| ID | Story | Acceptance |
|----|-------|------------|
| J7-S1 | Open JSON Editor via Options → editor pane visible | `#editor-pane` display is not `none` |
| J7-S2 | Editor textarea contains valid JSON | Parse `#json-editor` value succeeds |
| J7-S3 | Edit title in textarea + Update → SVG re-renders | SVG header text reflects new title |
| J7-S4 | Invalid JSON shows error message | `#editor-error` has non-empty text |
| J7-S5 | Download JSON button triggers file download | `<a>` with `blob:` href is created |
| J7-S6 | Upload valid JSON file → diagram re-renders | `#diagram-svg` node count changes |

---

## Journey 8 — Sequence View (J8)

**Goal:** Analyst switches to UML sequence diagram view.

| ID | Story | Acceptance |
|----|-------|------------|
| J8-S1 | Enable Sequence View → sequence container visible | `#sequence-container` display is not `none` |
| J8-S2 | `#sequence-svg` contains lifeline elements | SVG has `<line>` elements for lifelines |
| J8-S3 | Sequence arrows correspond to animation steps | Arrow count ≈ step count in `activeSequence` |
| J8-S4 | Disable Sequence View → reverts to diagram | `#sequence-container` hidden; `#svg-container` visible |

---

## Journey 9 — Narrative / Story Mode (J9)

**Goal:** Consultant presents the AS-IS→TO-BE story to stakeholders.

| ID | Story | Acceptance |
|----|-------|------------|
| J9-S1 | Story button visible for diagrams with `story` | `#btn-story` display is not `none` |
| J9-S2 | Click Story → narrative view opens full-screen | `#narrative-view` display is not `none` |
| J9-S3 | First slide shows Problem headline | `#slide-container` contains problem text |
| J9-S4 | Arrow-right navigates to next slide | Slide index increments; content changes |
| J9-S5 | Nav dot click jumps to that slide | Correct dot has `active` class |
| J9-S6 | KPI HUD appears in narrative sidebar | `#narrative-kpi-hud` has content |
| J9-S7 | Font size A+ increases slide font | `--narrative-font-scale` CSS var increases |
| J9-S8 | Esc key closes narrative view | `#narrative-view` hidden |
| J9-S9 | URL param `?story=true` auto-opens narrative | Narrative visible on page load |

---

## Journey 10 — Metrics & Benefits (J10)

**Goal:** Analyst reads before/after KPI deltas and improvement cards.

| ID | Story | Acceptance |
|----|-------|------------|
| J10-S1 | Enable Metrics Panel → panel visible | `#metrics-panel` display is not `none` |
| J10-S2 | Panel shows before/after rows | Panel contains ≥2 table rows with metric values |
| J10-S3 | Enable KPI HUD → HUD visible | `#kpi-hud` display is not `none` |
| J10-S4 | KPI HUD shows metric names and values | HUD text contains at least one unit label |
| J10-S5 | Enable Benefits panel → cards visible | `#benefits-panel` has child elements |
| J10-S6 | Hover benefit card highlights scope nodes | At least one `[data-node-id]` gets class `benefit-highlight` |

---

## Journey 11 — Export (J11)

**Goal:** Developer exports the diagram as SVG, PNG, and PDF.

| ID | Story | Acceptance |
|----|-------|------------|
| J11-S1 | Export SVG → download triggered | Download event fires; filename ends with `.svg` |
| J11-S2 | Export PNG → download triggered | Download event fires; filename ends with `.png` |
| J11-S3 | Export PDF → modal opens | `#modal-export-pdf` visible |
| J11-S4 | PDF modal cancel → modal closes | `#modal-export-pdf` hidden |
| J11-S5 | PDF modal confirm → download triggered | Download event fires |

---

## Journey 12 — Options & Theme (J12)

**Goal:** User toggles light theme and manages panel visibility.

| ID | Story | Acceptance |
|----|-------|------------|
| J12-S1 | Options menu opens on button click | `#options-menu` visible |
| J12-S2 | Options menu closes on outside click | `#options-menu` hidden |
| J12-S3 | Light Theme checkbox → `body.light-theme` applied | `document.body.classList.contains('light-theme')` |
| J12-S4 | Uncheck Light Theme → dark mode restored | `light-theme` class removed |
| J12-S5 | Notes checkbox shows/hides notebook | `#notebook` toggles visibility |

---

## Journey 13 — Zoom Presets (J13)

**Goal:** User switches between Fit, HD (1080p), and 4K rendering widths.

| ID | Story | Acceptance |
|----|-------|------------|
| J13-S1 | Default is Fit — SVG width ≈ container width | `#btn-zoom-fit` has class `active` on load |
| J13-S2 | Click HD → SVG viewBox width is 1920 | `#diagram-svg` viewBox contains `1920` |
| J13-S3 | Click 4K → SVG viewBox width is 3840 | `#diagram-svg` viewBox contains `3840` |
| J13-S4 | 4K mode enables horizontal scroll | `#svg-container` scrollWidth > clientWidth |
| J13-S5 | Click Fit → returns to container-relative width | `#btn-zoom-fit` active; SVG width ≤ 1920 |
| J13-S6 | Zoom state persists across diagram switch | Switch diagram → zoom preset unchanged |

---

## Execution Map (Multi-Agent)

| Agent | Spec Files | Journeys |
|-------|-----------|---------|
| TA-1 | `01-smoke.spec.js` | J1 |
| TA-2 | `02-diagram-loading.spec.js` | J2 |
| TA-3 | `03-view-modes.spec.js`, `04-diff.spec.js` | J3, J4 |
| TA-4 | `05-simulation.spec.js` | J5 |
| TA-5 | `06-edit-mode.spec.js` | J6 |
| TA-6 | `07-json-editor.spec.js` | J7 |
| TA-7 | `08-sequence-view.spec.js`, `09-narrative.spec.js` | J8, J9 |
| TA-8 | `10-metrics.spec.js`, `11-export.spec.js`, `12-options.spec.js`, `13-zoom.spec.js` | J10–J13 |

All TA-1…TA-8 agents run in parallel after the JBang backend is confirmed up.
