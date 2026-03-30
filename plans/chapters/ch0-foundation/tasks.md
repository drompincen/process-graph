# Chapter 0 — Foundation
**Agent:** A (single, sequential)
**Blocks:** All other chapters

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| T1 | HTML skeleton + state.js + constants.js | ⬜ | First task — unblocked |
| T2 | data.js — parser + validation | ⬜ | Needs T1 |
| T3 | core.css + diagram.css + main.js | ⬜ | Needs T2 |
| T4 | sample/order-approval.json | ⬜ | Needs T3 |

## Outputs (tick when file exists and passes basic check)

- [ ] `index.html` — opens in browser, no JS errors, all DOM IDs present
- [ ] `js/state.js` — exports `state`, `dom`, `initDom()`
- [ ] `js/constants.js` — exports `BPMN_ICONS`, `DIFF_COLORS`, `LANE_COLORS`, `DEFAULT_JSON`
- [ ] `js/data.js` — exports `parseGraph`, `isVisible`, `stripComments`
- [ ] `js/main.js` — imports all modules, calls init chain
- [ ] `css/core.css` — all --css-vars present, dark + light theme
- [ ] `css/diagram.css` — SVG canvas + grid styles
- [ ] `sample/order-approval.json` — parseGraph() succeeds; all 7 node types present

## Agent Briefing

Read: `plans/01-agent-A-foundation.md` and `plans/data-model.md`
Archviz references: `archviz/docs/sample/collab-animation.html`, `archviz/docs/sample/css/core.css`, `archviz/docs/sample/js/state.js`

## Chapter Complete When

All 8 output files ticked. Calling `renderAll({})` from console doesn't crash (stub ok).
