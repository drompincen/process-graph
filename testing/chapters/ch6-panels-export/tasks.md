# CH-T6 — Metrics, Benefits & Export
**Agents:** G1 (metrics + benefits), G2 (export) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T24 | Run 10-metrics.spec.js — full pass | G1 | ⬜ | J10: 8 stories |
| T25 | Fix any metrics/benefits failures | G1 | ⬜ | Needs T24 |
| T26 | Run 11-export.spec.js — full pass | G2 | ⬜ | J11: 6 stories |
| T27 | Fix any export/download failures | G2 | ⬜ | Needs T26 |

---

## Agent G1 — Metrics & Benefits (T24 + T25)

### T24 — Run 10-metrics.spec.js

```bash
cd testing
npx playwright test tests/10-metrics.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J10-S1 | Enable Metrics Panel → `#metrics-panel` visible | display not `none` |
| J10-S2 | Panel has before/after rows | row count ≥ 2 |
| J10-S3 | Enable KPI HUD → `#kpi-hud` visible | display not `none` |
| J10-S4 | KPI HUD has text content | text length > 0 |
| J10-S5 | Enable Benefits → `#benefits-panel` has cards | child card count > 0 |
| J10-S6 | Hover benefit card → scope nodes highlighted | `.benefit-highlight` count ≥ 0 (not crashing) |
| J10-S7 | Disable Metrics Panel → hidden | display = `none` |
| J10-S8 | Diagrams without story → Story button hidden | `#btn-story` hidden for ticket-triage |

**Progress reporting:**
```
[T24 ▶ 0:00] Loading order-approval.json. Enabling metrics panel…
[T24 ▶ 0:15] J10-S1 PASS (metrics-panel visible). J10-S2 PASS (6 rows). Enabling KPI HUD…
[T24 ▶ 0:25] J10-S3 PASS. J10-S4 PASS (KPI labels shown). Enabling benefits…
[T24 ▶ 0:35] J10-S5 PASS (2 cards). J10-S6 PASS. J10-S7 PASS (hidden).
[T24 ✓ 0:50] J10-S8 PASS (ticket-triage has no story btn). 8/8. T24 → ✅
```

### T25 — Fix failures from T24

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J10-S1: panel not visible | `initMetrics` not called or checkbox ID wrong | Verify `#chk-show-metrics` checkbox wired in interactions.js `initOptionsMenu` |
| J10-S2: < 2 rows | `renderMetricsPanel` not populating table | Check `metrics.js renderMetricsPanel` — reads `graph.metrics.before` and `graph.metrics.after` |
| J10-S4: empty KPI HUD | `graph.story.kpis` empty or null | Verify order-approval.json has `story.kpis` array; check `renderKpiHud` reads it |
| J10-S5: 0 benefit cards | `graph.story.benefits` missing | Verify order-approval.json has `story.benefits`; check `renderBenefitCards` |
| J10-S8: Story button visible for ticket-triage | `initNarrative` called for all graphs | Verify main.js: `if (graph.story) initNarrative(graph)` — ticket-triage has no `story` key |

**Metrics panel selector note:**
The test uses `#metrics-panel tr, #metrics-panel .metric-row` — check which structure
`renderMetricsPanel` actually creates (table rows vs divs) and adjust spec if needed:
```bash
# Inspect what's rendered
npx playwright test tests/10-metrics.spec.js --headed --slow-mo=300 \
  --grep "J10-S2" --project=chromium
# Open DevTools and inspect #metrics-panel structure
```

**Progress reporting:**
```
[T25 ▶ 0:00] J10-S2 failing: 0 rows. Inspecting metrics-panel HTML structure…
[T25 ▶ 0:15] renderMetricsPanel uses <div class="metric-row"> not <tr>. Selector in spec needs updating.
[T25 ▶ 0:20] Updated spec selector. 8/8 passing. T25 → ✅
```

---

## Agent G2 — Export (T26 + T27)

### T26 — Run 11-export.spec.js

```bash
cd testing
npx playwright test tests/11-export.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J11-S1 | Export SVG → download event fires, `.svg` extension | download filename ends with `.svg` |
| J11-S2 | Export PNG → download event fires, `.png` extension | download filename ends with `.png` |
| J11-S3 | Export PDF → PDF modal opens | `#modal-export-pdf` visible |
| J11-S4 | PDF modal Cancel → modal closes | `#modal-export-pdf` hidden |
| J11-S5 | PDF modal Confirm → download fires | download event fires |
| J11-S6 | PDF modal radio options selectable | each radio can be checked |

**Progress reporting:**
```
[T26 ▶ 0:00] Loading order-approval. Opening options menu for export buttons…
[T26 ▶ 0:15] J11-S1 PASS (process-graph.svg downloaded). J11-S2 PASS (process-graph.png).
[T26 ▶ 0:25] J11-S3 PASS (PDF modal opens). J11-S4 PASS (cancel works).
[T26 ▶ 0:40] J11-S5 PASS (PDF downloaded). J11-S6 PASS (radios selectable).
[T26 ✓ 0:45] 6/6 passed. T26 → ✅
```

### T27 — Fix failures from T26

**J11-S1/S2: download event not firing:**
- Playwright captures downloads triggered by `<a download>` clicks or `window.open(blob:…)`
- Check `export.js exportSvg()` — it should create `const a = document.createElement('a'); a.href = blobUrl; a.download = 'process-graph.svg'; a.click()`
- If using `URL.createObjectURL`, Playwright should still catch it
- **Common issue:** `a.click()` inside a `setTimeout` — Playwright may miss it. Remove the setTimeout or increase `waitForEvent('download')` timeout

**J11-S2: PNG export hangs:**
- PNG export uses `html2canvas` which requires the element to be in the DOM and visible
- Verify `#svg-container` is visible when export runs
- If html2canvas fails silently, check for console errors during the test

**J11-S5: PDF download not firing:**
- jsPDF creates a Blob and triggers download via `doc.save(filename)`
- jsPDF's `save()` uses `<a download>` internally — Playwright should catch it
- Verify jsPDF is loaded: check `window.jspdf` exists before export runs

**J11-S3: modal not opening:**
- Check `export.js initExport` wires `#btn-export-pdf` click → `modal.style.display = 'block'`
- Verify the button is inside `#options-menu` and the menu is open when clicked

```bash
# Debug export with trace
npx playwright test tests/11-export.spec.js --trace=on --project=chromium
npx playwright show-trace playwright-report/
```

**Progress reporting:**
```
[T27 ▶ 0:00] J11-S2 failing: PNG download not caught. Checking html2canvas usage…
[T27 ▶ 0:15] html2canvas renders async; download triggered in .then() after waitForEvent resolves. Wrapping in Promise.all…
[T27 ✓ 0:30] 6/6 passing. T27 → ✅
```

---

## Outputs

- [ ] `10-metrics.spec.js` — 8/8 passing on chromium
- [ ] `11-export.spec.js` — 6/6 passing on chromium
- [ ] SVG download verified: contains `<svg>` markup
- [ ] PNG download verified: file is non-empty
- [ ] PDF download verified (via jsPDF `doc.save()`)
- [ ] Benefits hover screenshot confirms `.benefit-highlight` class applied

## Chapter Complete When

T24 and T26 both show ✅. Update CHAPTERS.md CH-T6 → ✅ Done.
