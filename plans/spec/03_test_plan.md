# Phase 3: Test Plan

## Test Structure
Each fix gets tested at 3 levels before anything goes to confirmed/.

### Level 1: Automated QA (19 checks)
```bash
npx playwright test tests/qa-screenshot-audit.spec.js -g "<sample> / <mode>"
```
Must show: CLEAN, 0 issues.

### Level 2: Arrow Attachment Audit
```bash
npx playwright test tests/qa-arrow-attachment.spec.js -g "<sample> / <mode>"
```
Must show: 0 off-center attachments.

### Level 3: Visual Inspection (HD PNG)
```bash
npx playwright test tests/qa-hd-capture.spec.js -g "<sample> / <mode>"
```
Then READ the PNG and apply full QA skill checklist:
- Arrowheads attached to lines
- Arrows enter at edge CENTER
- Entry direction matches source position
- No arrows behind boxes
- No excessive detours
- Labels visible and non-overlapping
- Swimlanes properly sized
- Flow reads left-to-right
- Business stakeholder would understand it

### Confirmation Gate
Only when ALL THREE levels pass → move PNG to qa-png/confirmed/

## Test Matrix (28 total)
| Sample | before | after | split | overlay |
|--------|--------|-------|-------|---------|
| order-approval | □ | □ | □ | □ |
| ticket-triage | □ | □ | □ | □ |
| onboarding | □ | □ | □ | □ |
| incident-response | □ | □ | □ | □ |
| expense-claim | □ | ✓ | □ | □ |
| manufacturing-fulfillment | □ | □ | □ | □ |
| lean-six-sigma | □ | □ | □ | □ |

✓ = in confirmed/  □ = not yet passing

## Regression Prevention
After any code change, re-run ALL 28 test cases. If any previously-passing
test regresses, revert the code change and try a different approach.

## Expected Issue Count Trajectory
Starting: 134 issues
Target: 0 issues across all 28 test cases
Each iteration must REDUCE the total, never increase.
If an iteration increases issues → revert and reassess.
