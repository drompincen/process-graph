# Phase 4: Implementation Phases

## Phase A: Implement Entry Direction Resolution (code change)
**Files:** `js/routing.js`
**Functions:** New `resolveEntryDirection()`, modify `computeOrthogonalPath()`
**Risk:** Low — new function, minimal changes to existing code
**Test:** Run 28 tests, count wrong-entry-direction (target: < 20, from 60)

## Phase B: Fix Padding Direction Preservation (code change)
**Files:** `js/routing.js` → `applyPaddingAndLabels()`
**Functions:** Modify padding to protect final segment direction
**Risk:** Medium — padding is complex, may cause arrow-through-node regressions
**Test:** Run 28 tests, verify arrow-through-node doesn't increase

## Phase C: Fix Gateway Port Separation (code change)
**Files:** `js/routing.js` → `resolveGatewayOutPort()`
**Functions:** Ensure no two branches from same gateway share a port
**Risk:** Low — isolated function
**Test:** Run 28 tests, count shared-gateway-port (target: 0, from 18)

## Phase D: Fix Flow Completeness Check (test change)
**Files:** `testing/tests/qa-screenshot-audit.spec.js`
**Functions:** Make flow check phase-aware (split/overlay show nodes from both phases)
**Risk:** Low — test-only change
**Test:** Run 28 tests, count flow-incomplete (target: 0, from 24)

## Phase E: JSON Placement Fixes (per sample)
**Files:** `sample/*.json`
**Strategy:** For each remaining wrong-entry-direction issue:
  1. Check if aligning source/target x values fixes it
  2. Check for overlap-resolution displacement
  3. Adjust x values accounting for before-phase nodes at same position
**Test:** One sample at a time, all 4 modes

## Phase F: Crossing Reduction (JSON placement)
**Files:** `sample/*.json`
**Strategy:** Reorder node x-positions to minimize arrow crossings
**Test:** Run 28 tests, count excessive-crossings (target: 0, from 14)

## Phase G: Final Confirmation
**Process:**
  1. Run all 28 automated tests — must be 0 issues
  2. Take HD PNGs of all 14 (7 samples × before + after)
  3. Visual inspect each one with full QA skill
  4. Move passing PNGs to confirmed/
  5. Run split/overlay modes — fix any cross-phase issues
  6. Final confirmed/ should have all 28 PNGs

## Execution Order
A → test → B → test → C → test → D → test → E (per sample) → F → G

## Budget Guard
If any phase takes > 3 iterations without reducing issue count → STOP.
Re-spec that phase with a different approach before continuing.
