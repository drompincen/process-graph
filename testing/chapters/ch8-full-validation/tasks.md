# CH-T8 — Full Validation & Report
**Agent:** I (sequential — final integration gate)
**Blocks:** Nothing (final chapter)
**Blocked by:** CH-T1, CH-T2, CH-T3, CH-T4, CH-T5, CH-T6, CH-T7

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T32 | Full chromium run — all 13 spec files, 0 failures | I | ⬜ | All previous chapters must be ✅ |
| T33 | Full firefox run — all 13 spec files, 0 failures | I | ⬜ | Needs T32 |
| T34 | Generate HTML report + update journey status in journeys.md | I | ⬜ | Needs T33 |

---

## Prerequisites Checklist

Before starting CH-T8, confirm each chapter is ✅:

- [ ] CH-T0 complete — backend running, Playwright installed
- [ ] CH-T1 complete — smoke (5/5) + loading (8/8)
- [ ] CH-T2 complete — views (6/6) + diff (6/6)
- [ ] CH-T3 complete — simulation (9/9)
- [ ] CH-T4 complete — edit (9/9) + json-editor (6/6)
- [ ] CH-T5 complete — sequence (5/5) + narrative (9/9)
- [ ] CH-T6 complete — metrics (8/8) + export (6/6)
- [ ] CH-T7 complete — options (8/8) + zoom (7/7)

**Total expected from prior chapters:** 92 tests across 13 spec files

---

## T32 — Full Chromium Run

```bash
cd testing
npx playwright test --project=chromium --reporter=list
```

**Expected output:**
```
Running 92 tests using 4 workers

  ✓ 01-smoke.spec.js (5)
  ✓ 02-diagram-loading.spec.js (8)
  ✓ 03-view-modes.spec.js (6)
  ✓ 04-diff.spec.js (6)
  ✓ 05-simulation.spec.js (9)
  ✓ 06-edit-mode.spec.js (9)
  ✓ 07-json-editor.spec.js (6)
  ✓ 08-sequence-view.spec.js (5)
  ✓ 09-narrative.spec.js (9)
  ✓ 10-metrics.spec.js (8)
  ✓ 11-export.spec.js (6)
  ✓ 12-options.spec.js (8)
  ✓ 13-zoom.spec.js (7)

  92 passed (chromium)
```

**If any test fails at this stage:**
1. It was passing in isolation but fails in the full suite (state leak between tests)
2. Check for shared state via `state.js` — each test should navigate to `/` fresh via `loadApp()`
3. Run the failing spec in isolation to confirm it passes alone:
   ```bash
   npx playwright test tests/XX-failing.spec.js --project=chromium
   ```
4. If it passes alone but fails in full run — it's a `beforeEach`/`afterEach` isolation issue
5. Add `page.goto('/')` at the start of the failing `beforeEach` to reset state

**State isolation pattern (add to any flaky spec):**
```javascript
test.beforeEach(async ({ page }) => {
  // Hard reset to clear any carryover state from previous test
  await page.goto('/');
  await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
});
```

**Progress reporting:**
```
[T32 ▶ 0:00] Starting full chromium run — 92 tests, 4 workers…
[T32 ▶ 0:15] 01-smoke: 5/5. 02-loading: 8/8. 03-views: 6/6. 04-diff: running…
[T32 ▶ 0:30] 04-diff: 6/6. 05-simulation: 9/9. 06-edit: running…
[T32 ▶ 0:45] 06-edit: 9/9. 07-json: 6/6. 08-sequence: 5/5. 09-narrative: running…
[T32 ▶ 1:00] 09-narrative: 9/9. 10-metrics: 8/8. 11-export: running…
[T32 ▶ 1:15] 11-export: 6/6. 12-options: 8/8. 13-zoom: 7/7.
[T32 ✓ 1:20] 92/92 passed, 0 failed. T32 → ✅
```

---

## T33 — Full Firefox Run

```bash
cd testing
npx playwright test --project=firefox --reporter=list
```

Firefox-specific issues to watch for:

| Issue | Likely cause | Fix |
|-------|-------------|-----|
| SVG cursor `grab` fails (J6-S2) | Firefox uses `-moz-grab` in older versions | Accept `grab` OR `-moz-grab` in the assertion |
| Download events not firing (J11) | Firefox download handling differs | Verify `<a download>` approach works — may need `page.waitForEvent('download', {timeout: 10000})` |
| `getComputedStyle` returns different values | Firefox computes colours differently | Use approximate assertions for colour-based tests |
| Narrative keyboard (J9-S4) | Firefox `ArrowRight` key event behaviour | Verify `page.keyboard.press('ArrowRight')` fires keydown in Firefox |
| `getScreenCTM()` null (animation) | Firefox SVG CTM in hidden elements | Ensure SVG is visible before animation starts |

**Progress reporting:**
```
[T33 ▶ 0:00] Starting full firefox run — 92 tests, 4 workers…
[T33 ▶ 0:30] 78/92 passing. 14 failing — investigating…
[T33 ▶ 0:45] J6-S2: cursor assertion — adding Firefox fallback. J11-S2: download timeout — increasing to 10s.
[T33 ▶ 1:00] Fixes applied. Re-running failing tests…
[T33 ✓ 1:15] 92/92 passed on firefox. T33 → ✅
```

---

## T34 — Generate HTML Report + Update Journey Status

### Generate HTML Report

```bash
cd testing
npx playwright test --reporter=html
npx playwright show-report  # opens browser to playwright-report/index.html
```

The report will show:
- Pass/fail per test, per browser
- Screenshots on failure
- Trace files for debugging
- Duration per test

### Update journeys.md

For each journey (J1–J13), update the status table to reflect final result.
Replace `⬜` with `✅` (pass) or `❌` (fail with note) for each story ID.

**Status update format in journeys.md:**
```markdown
| J1-S1 | As any user, I open the app and see a rendered diagram | ✅ chromium + firefox |
| J1-S2 | As any user, the backend API returns a diagram list | ✅ chromium + firefox |
```

### Update CHAPTERS.md

Mark CH-T8 as ✅ Done in the Overall Progress table.

Add a final summary block at the top of CHAPTERS.md:
```markdown
## Final Test Results — {DATE}

| Browser | Passed | Failed | Skipped |
|---------|--------|--------|---------|
| Chromium | 92 | 0 | 0 |
| Firefox | 92 | 0 | 0 |

Report: `testing/playwright-report/index.html`
```

**Progress reporting:**
```
[T34 ▶ 0:00] Generating HTML report…
[T34 ▶ 0:05] Report generated at playwright-report/index.html. Updating journeys.md…
[T34 ▶ 0:15] All 92 stories marked ✅. Updating CHAPTERS.md final summary…
[T34 ✓ 0:20] CH-T8 complete. All 30 tasks across 9 chapters done. T34 → ✅
```

---

## Full Journey Coverage Summary

| Journey | Spec | Tests | Browsers |
|---------|------|-------|---------|
| J1 Smoke | 01-smoke | 5 | chromium + firefox |
| J2 Loading | 02-diagram-loading | 8 | chromium + firefox |
| J3 View Modes | 03-view-modes | 6 | chromium + firefox |
| J4 Diff Engine | 04-diff | 6 | chromium + firefox |
| J5 Simulation | 05-simulation | 9 | chromium + firefox |
| J6 Edit Mode | 06-edit-mode | 9 | chromium + firefox |
| J7 JSON Editor | 07-json-editor | 6 | chromium + firefox |
| J8 Sequence View | 08-sequence-view | 5 | chromium + firefox |
| J9 Narrative | 09-narrative | 9 | chromium + firefox |
| J10 Metrics | 10-metrics | 8 | chromium + firefox |
| J11 Export | 11-export | 6 | chromium + firefox |
| J12 Options | 12-options | 8 | chromium + firefox |
| J13 Zoom | 13-zoom | 7 | chromium + firefox |
| **Total** | **13 specs** | **92 tests** | **2 browsers** |

---

## Outputs

- [ ] `playwright-report/index.html` generated
- [ ] 92/92 passing on chromium
- [ ] 92/92 passing on firefox
- [ ] `journeys.md` updated — all story IDs show ✅
- [ ] `CHAPTERS.md` updated — CH-T8 shows ✅, final results table added

## Chapter Complete When

T32, T33, T34 all show ✅. The test suite is fully green across both browsers.
