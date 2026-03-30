# Cleanup & ArchViz-Style UI Plan

## Goal
Strip process-graph down to a single sample (car-loan.json), adopt the archviz UI pattern (slider only, no buttons), and run the QA closed loop until clean.

## Phase 1: Remove everything except car-loan

### Delete sample JSONs
Delete all except car-loan.json:
- sample/decision-flow.json
- sample/expense-claim.json
- sample/incident-response.json
- sample/lean-six-sigma.json
- sample/manufacturing-fulfillment.json
- sample/onboarding.json
- sample/order-approval.json
- sample/ticket-triage.json

### Update dropdown in js/main.js
Replace the fallback diagrams list with just:
```javascript
const fallback = [
  { file: 'car-loan.json', label: 'Auto Loan Application' },
];
```

### Remove old test files
Keep only:
- helpers.js, geo-helpers.js
- 01-smoke.spec.js
- 02-phase-navigation.spec.js
- 03-phase-integrity.spec.js
- 04-geometric-quality.spec.js
- 06-edit-mode.spec.js
- 08-qa-phase-audit.spec.js

Delete:
- 05-simulation.spec.js (will be replaced by play/ff)
- 07-diff-mode.spec.js (diff not needed for now)

## Phase 2: ArchViz-style UI

### Study archviz UI
Read `/mnt/c/Users/drom/IdeaProjects/archviz/src/main/resources/static/index.html` for:
- How the phase slider looks
- How play/fast-forward animation works
- How font size +/- buttons work
- How the header is laid out (no before/split/after/overlay buttons)

### Remove from index.html
- Before/Split/After/Overlay buttons (#view-mode-group)
- Old phase-dots div (#phase-dots)
- Simulate button (#btn-play) — replaced by archviz-style play/ff
- Any split/overlay CSS

### Add to index.html (archviz-style)
- Phase slider (already exists, keep it)
- Play button: auto-advance through phases with animation
- Fast-forward button: jump to last phase
- Rewind button: jump to phase 0
- Font size +/- buttons
- Clean header: title | diagram selector | phase slider | play controls | font +/-

### Playback controls
```
[|◀] [▶ Play] [▶▶] [A-] [A+]
```
- Rewind: set phase to 0
- Play: auto-advance phases every 2 seconds (configurable)
- Fast-forward: jump to last phase
- A-/A+: decrease/increase SVG text font size

## Phase 3: QA Closed Loop

1. Run 08-qa-phase-audit.spec.js (4 phases × 14 checks)
2. Capture screenshots per phase
3. Visual inspection (Claude reads PNGs)
4. Fix any issues
5. Repeat until all 4 phases CLEAN
6. Copy to confirmed/

## Execution

Single agent swarm — one agent at a time since files overlap:
1. Agent: cleanup (delete files, update main.js dropdown)
2. Agent: archviz-ui (rewrite index.html header, add play/ff, font +/-)
3. Agent: test-update (fix remaining tests for new UI)
4. QA loop: automated + visual inspection

## Files to modify
- js/main.js — dropdown list
- index.html — full header rewrite
- css/core.css — new control styles
- testing/tests/*.spec.js — update for new UI

## Files to delete
- sample/*.json (7 files, keep car-loan.json)
- testing/tests/05-simulation.spec.js
- testing/tests/07-diff-mode.spec.js
