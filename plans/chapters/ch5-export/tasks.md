# Chapter 5 — Export + Polish
**Agent:** F (single, sequential after CH4)
**Blocks:** Nothing (final chapter)

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| T24 | export.js — SVG + PNG + PDF export | ⬜ | Needs CH4 complete |
| T25 | animations.css + light theme + responsive + URL params | ⬜ | Needs T24 |
| T26 | Integration — all 7 acceptance scenarios | ⬜ | Needs T25 |

## Outputs

- [ ] `js/export.js` — `exportSVG()`, `exportPNG()`, `exportPDF(mode)`, modal wired
- [ ] `css/animations.css` — all keyframes (crossfadeIn, diffPulse, popIn, slideIn, fadeIn, tokenPulse)
- [ ] `css/core.css` additions — `body.light-theme` overrides, responsive media queries
- [ ] `plans/DONE.md` — list of any known gaps, deferred items, or follow-up tasks

## Agent Launch Instructions

After CH4 complete:
- **F:** Read `plans/06-agent-F-export-polish.md`. Reference `archviz/docs/sample/js/export-pdf.js`. SVG export must be self-contained (inline CSS). PDF modal has 3 options.

## Integration Checklist (T26)

Run through each scenario and tick when passing:

- [ ] **Scenario 1:** Load → 4 view modes → metrics panel → diff chips correct
- [ ] **Scenario 2:** Simulate → token travels paths → badges → log → popup → FF → Replay
- [ ] **Scenario 3:** Edit mode → drag 20px snap → Ctrl+Z undo → inline edit → JSON editor sync
- [ ] **Scenario 4:** Story mode → 5 slide types → KPI HUD → keyboard nav → Escape
- [ ] **Scenario 5:** Export SVG standalone → PNG 2× → PDF all 3 modes → JSON round-trip
- [ ] **Scenario 6:** Sequence view → participants → lifelines → arrows → status icons
- [ ] **Scenario 7:** Light theme → all panels readable → no hard-coded dark colors

## Chapter Complete When

All 7 integration scenarios ticked. `plans/DONE.md` written.
