# BPMN Process Graph — QA & Quality Guide

## Project Purpose
A BPMN-style process diagram visualizer that shows before/after process improvements.
It renders process flows from JSON sample files as SVG diagrams with swimlanes, gateways,
and animated transitions across 4 view modes: before, split, after, overlay.

## Quality Standard
Every diagram must be a professional-grade BPMN diagram that a business stakeholder
could read and understand. No sloppy arrows, no overlapping boxes, no diagonal
connectors, no ambiguous flows.

---

## Quality Checker — 19 Automated Checks

The checker runs as a Playwright test: `testing/tests/qa-screenshot-audit.spec.js`

### Geometry & Rendering (checks 1-8)
| # | Check | What it catches |
|---|-------|----------------|
| 1 | node-overlap | Two nodes visually collide |
| 2 | diagonal-arrow | Arrow segment is not purely H or V |
| 3 | arrow-through-node | Arrow passes through a non-endpoint node |
| 4 | label-detached | Connection label too far from its path |
| 5 | label-node-collision | Label overlaps a node shape |
| 6 | lane-violation | Node outside its swimlane |
| 7 | node-crowding | Nodes < 20px apart |
| 8 | non-perpendicular-entry | Arrow enters/exits at non-90° angle |

### Port & Origin Rules (checks 9-11)
| # | Check | What it catches |
|---|-------|----------------|
| 9 | invalid-port-attachment | Arrow endpoint not on node edge |
| 10 | shared-arrow-origin | Two gateway arrows exit from same pixel |
| 11 | shared-gateway-port | Two gateway branches use the same port |

### Routing Quality (checks 12-14)
| # | Check | What it catches |
|---|-------|----------------|
| 12 | arrow-path-detour | Arrow path > 3.5x straight-line distance |
| 13 | arrow-off-canvas | Arrow waypoint outside content area |
| 14 | wrong-entry-direction | Arrow enters from wrong side relative to source |

### BPMN Structural (checks 15-17)
| # | Check | What it catches |
|---|-------|----------------|
| 15 | start-end-violation | Start has incoming or end has outgoing |
| 16 | missing-decision-label | Gateway branch without Yes/No label |
| 17 | flow-incomplete | Orphan node or dead end |

### Layout & Proportionality (checks 18-19)
| # | Check | What it catches |
|---|-------|----------------|
| 18 | excessive-crossings | More than 2 arrow crossings |
| 19 | lane-disproportionate | Empty lane taking too much space |

---

## Closed-Loop QA Process

Protocol: `scripts/qa-claude-loop.md`

```
┌────────────────┐
│ Phase 1: CAPTURE│──→ Playwright captures PNGs + runs 19 checks
└───────┬────────┘
        ▼
┌────────────────┐
│ Phase 2: ANALYZE│──→ Generate fix plan chapters
└───────┬────────┘
        ▼
┌────────────────────────┐
│ Phase 3: VISUAL INSPECT│──→ READ PNGs, apply full QA skill checklist
└───────┬────────────────┘    (MANDATORY — automated pass + visual fail = FAILED)
        ▼
┌────────────────┐
│ Phase 4: FIX   │──→ Fix JSON placement FIRST, code changes ONLY if systemic
└───────┬────────┘
        ▼
┌────────────────┐
│ Phase 5: RE-RUN│──→ Go back to Phase 1
└───────┬────────┘
        ▼
┌────────────────────────┐
│ Phase 6: CONFIRM       │──→ Only when ALL checks pass + visual passes:
│                        │    move PNGs to qa-png/confirmed/
└────────────────────────┘
```

### Fix Priority Order
1. **JSON placement first** — align connected nodes to same x/y for clean vertical/horizontal arrows
2. **Code changes only if systemic** — affects ALL diagrams, not just one sample
3. **Never remove the 9px arrowhead offset** — path lines stop 9px short, arrowhead fills the gap
4. **Test one sample at a time** — fix, test, visually confirm, then move to next

### View Modes to Test
All 4 modes for each sample:
- **before** — original process only
- **after** — improved process only
- **split** — both before and after side by side (may have cross-phase conflicts)
- **overlay** — both overlaid with diff coloring

---

## Sample Files
Located in `sample/`:
- order-approval.json
- ticket-triage.json
- onboarding.json
- incident-response.json
- expense-claim.json
- manufacturing-fulfillment.json
- lean-six-sigma.json

Each contains: lanes, nodes (with x position and lane assignment), connections,
phases (before/after), and diff markers (added/removed/changed).

---

## Key Files

| File | Purpose |
|------|---------|
| `js/layout.js` | Node positioning, lane sizing, direction detection, port positions |
| `js/routing.js` | Arrow path construction, arrowheads, label placement, padding |
| `js/renderer.js` | SVG rendering of nodes, lanes, connections |
| `testing/tests/qa-screenshot-audit.spec.js` | 19-check automated QA |
| `testing/tests/qa-arrow-attachment.spec.js` | Arrow edge-center attachment audit |
| `scripts/qa-claude-loop.md` | Closed-loop QA protocol for Claude |
| `scripts/qa-analyze.js` | Report analyzer + chapter generator |
| `qa-png/confirmed/` | Only PNGs that pass ALL checks + visual inspection |

---

## Known Remaining Issues (as of latest run)

| Category | Count | Root Cause | Fix Strategy |
|----------|-------|-----------|--------------|
| wrong-entry-direction | 60 | `addPaddingToWaypoints` inserts detour points that change the final approach direction | Fix padding to preserve original entry direction |
| flow-incomplete | 24 | Some nodes in split/overlay mode lack connections (phase-specific) | May need phase-aware flow check |
| shared-gateway-port | 18 | Gateway branches share exit port | Already partially fixed with out-bottom/out-br separation |
| shared-arrow-origin | 18 | Same root as shared-gateway-port | Fix gateway port assignment |
| excessive-crossings | 14 | Complex diagrams with many cross-lane arrows | JSON node repositioning |

---

## Rules for Making Changes

### JSON Changes (preferred)
- Align cross-lane connected nodes to same x → produces clean vertical arrows
- Check overlap with before-phase nodes at same x (overlap resolution shifts them)
- Increase lane heights if nodes spill outside
- Cascade: shifting one node right → shift all downstream nodes by same amount

### Code Changes (only when systemic)
- NEVER remove the 9px arrowhead offset from path endpoints
- After ANY routing change, visually inspect arrowheads in HD PNGs
- The `addPaddingToWaypoints` function is the biggest source of visual bugs —
  it inserts detour points that change approach directions
- `detectDirection` determines how cross-lane arrows route — currently always
  uses vertical (down/up) for cross-lane connections
- Gateway port routes (`gatewayPortRoute`) handle decision branch separation
