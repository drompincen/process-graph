# Chapter 2 — View Modes
**Agents:** C1 (diff), C2 (sequence), C3 (narrative) — run in parallel after CH1
**Blocks:** CH4

## Parallel Streams

```
C1: T11 (diff + Before/Split/After/Overlay) ────────────────────────────────────┐
C2: T12 (sequence-view.js) ─────────────────────────────────────────────────────┤──► CH4
C3: T13 (problem+vision slides) ──► T14 (phase slides + KPI HUD + keyboard nav) ┘
```

## Tasks

| ID | Task | Agent | Status | Blocked By |
|----|------|-------|--------|-----------|
| T11 | diff.js — classifyDiff + isVisible + view mode buttons | C1 | ⬜ | T10 |
| T12 | sequence-view.js — BPMN sequence diagram | C2 | ⬜ | T10 |
| T13 | narrative.js — Problem + Vision slides | C3 | ⬜ | T10 |
| T14 | narrative.js — Phase slides + KPI HUD + keyboard nav | C3 | ⬜ | T13 |

## Outputs

- [ ] `js/diff.js` — `classifyDiff()`, `computeDiffMetrics()`, `isVisible()`, `renderPhaseDots()`
- [ ] `css/diff.css` — `.diff-added`, `.diff-removed`, `.diff-changed`, `.diff-unchanged`
- [ ] `js/sequence-view.js` — `renderSequenceView()`; checkbox wired
- [ ] `js/narrative.js` — full story mode, all 3 slide types, keyboard nav, KPI HUD
- [ ] `css/narrative.css` — slide layouts, .slide-problem/.vision/.phase, slideIn animation

## Parallel Launch Instructions

After T10 (renderAll complete), launch simultaneously:
- **C1:** Read `plans/03-agents-C-views.md` (C1 section). Implement `js/diff.js` + `css/diff.css`.
- **C2:** Read `plans/03-agents-C-views.md` (C2 section). Implement `js/sequence-view.js`. Can reference `archviz/docs/sample/js/sequence-view.js` directly.
- **C3:** Read `plans/03-agents-C-views.md` (C3 section). Implement `js/narrative.js` + `css/narrative.css`. Heavy reference to `archviz/docs/sample/js/narrative.js`.

## Chapter Complete When

- Overlay mode shows diff highlights; Split mode shows both sides with divider
- Sequence view checkbox renders readable SVG sequence diagram
- 📖 Story button opens narrative; all slides navigate; KPI HUD updates
