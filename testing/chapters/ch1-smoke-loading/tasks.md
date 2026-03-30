# CH-T1 — Smoke & Diagram Loading
**Agents:** B1 (smoke), B2 (diagram loading) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T4 | Run 01-smoke.spec.js — full pass | B1 | ⬜ | J1: 5 stories |
| T5 | Fix any failures in T4 | B1 | ⬜ | Needs T4 |
| T6 | Run 02-diagram-loading.spec.js — full pass | B2 | ⬜ | J2: 8 stories |
| T7 | Fix any failures in T6 | B2 | ⬜ | Needs T6 |

B1 and B2 run simultaneously. Each agent owns their task pair independently.

---

## Agent B1 — Smoke Tests (T4 + T5)

### T4 — Run 01-smoke.spec.js

```bash
cd testing
npx playwright test tests/01-smoke.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J1-S1 | App loads, SVG renders node groups | `[data-node-id]` count > 0 |
| J1-S2 | `/api/diagrams` returns ≥1 entry | HTTP 200, JSON array |
| J1-S3 | `#json-selector` has ≥1 option | option count ≥ 1 |
| J1-S4 | Switching diagrams re-renders | node count > 0 after switch |
| J1-S5 | No uncaught JS errors on load | pageerror events = 0 |

**Progress reporting (every ~15s):**
```
[T4 ▶ 0:00] Launching chromium, navigating to /…
[T4 ▶ 0:15] J1-S1 PASS (SVG has 17 nodes). J1-S2 PASS (3 diagrams). Running J1-S3…
[T4 ▶ 0:25] J1-S3 PASS. J1-S4 PASS. Running J1-S5…
[T4 ✓ 0:35] 5/5 passed. No failures. Updating T4 → ✅
```

### T5 — Fix failures from T4

Only run if T4 has failures. For each failing story:

1. **Re-run with trace:**
   ```bash
   npx playwright test tests/01-smoke.spec.js --headed --trace=on
   ```
2. **Open trace viewer:**
   ```bash
   npx playwright show-trace playwright-report/trace.zip
   ```
3. **Common fixes:**

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J1-S1 timeout on `[data-node-id]` | renderer.js import error | Check `js/renderer.js` exports `renderAll` |
| J1-S2 404 on `/api/diagrams` | Backend not started or wrong root | Verify CH-T0 T2 completed; check ProcessGraph.java logs |
| J1-S5 console errors | Circular import or missing module | See browser console in trace; fix broken import |

**Progress reporting:**
```
[T5 ▶ 0:00] Investigating J1-S1 failure. Opening trace…
[T5 ▶ 0:15] Found: renderer.js throws on import. Checking circular deps…
[T5 ✓ 0:45] Fixed import in routing.js. Re-ran T4: 5/5. T5 → ✅
```

---

## Agent B2 — Diagram Loading (T6 + T7)

### T6 — Run 02-diagram-loading.spec.js

```bash
cd testing
npx playwright test tests/02-diagram-loading.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J2-S1 | order-approval.json renders ≥15 nodes | node count ≥ 15 |
| J2-S2 | ticket-triage.json renders without errors | node count > 0, no errors |
| J2-S3 | onboarding.json renders ≥12 nodes | node count ≥ 12 |
| J2-S4 | `?process=ticket-triage.json` URL param loads diagram | selector value = filename |
| J2-S5 | `?view=before` URL param sets Before mode | `#btn-before` active |
| J2-S6 | Notes field renders in notebook | `#notebook` visible + non-empty |
| J2-S7 | Lane labels present in SVG | `#lanes-layer text` count > 0 |
| J2-S8 | Connections layer has paths | `#connections-layer path` count > 0 |

**Progress reporting:**
```
[T6 ▶ 0:00] Loading order-approval.json…
[T6 ▶ 0:15] J2-S1 PASS (19 nodes). J2-S2 PASS. J2-S3 PASS (14 nodes).
[T6 ▶ 0:30] J2-S4 PASS. J2-S5 PASS. J2-S6 PASS. Running J2-S7, J2-S8…
[T6 ✓ 0:45] 8/8 passed. T6 → ✅
```

### T7 — Fix failures from T6

Common failures and fixes:

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J2-S1: node count < 15 | Some nodes filtered out in split mode | Verify default `state.viewMode = 'split'` in state.js |
| J2-S4: selector value wrong | `discoverDiagrams` doesn't read URL params | Check `applyUrlParams()` in main.js sets selector value |
| J2-S6: notebook not visible | `notes` field missing from sample JSON | Add `"notes"` key to order-approval.json |
| J2-S8: no paths | routing.js not rendering connections | Check `renderConnections` call in `renderAll` |

**Progress reporting:**
```
[T7 ▶ 0:00] J2-S4 failing. Investigating URL param handling…
[T7 ▶ 0:15] applyUrlParams() sets state.viewMode but not selector.value. Fixing main.js…
[T7 ✓ 0:30] Fix applied. 8/8 passing. T7 → ✅
```

---

## Outputs

- [ ] `01-smoke.spec.js` — 5/5 passing on chromium
- [ ] `02-diagram-loading.spec.js` — 8/8 passing on chromium
- [ ] Any source fixes committed with test failure context
- [ ] Zero console errors on diagram load for all 3 sample files

## Chapter Complete When

T4 and T6 both show ✅ (with or without fixes from T5/T7). Update CHAPTERS.md CH-T1 → ✅ Done.
