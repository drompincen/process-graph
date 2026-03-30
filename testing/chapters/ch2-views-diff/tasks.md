# CH-T2 — View Modes & Diff Engine
**Agents:** C1 (view modes), C2 (diff) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T8  | Run 03-view-modes.spec.js — full pass | C1 | ⬜ | J3: 6 stories |
| T9  | Fix any failures in T8 | C1 | ⬜ | Needs T8 |
| T10 | Run 04-diff.spec.js — full pass | C2 | ⬜ | J4: 6 stories |
| T11 | Fix any failures in T10 | C2 | ⬜ | Needs T10 |

---

## Agent C1 — View Modes (T8 + T9)

### T8 — Run 03-view-modes.spec.js

```bash
cd testing
npx playwright test tests/03-view-modes.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J3-S1 | Before mode — before nodes visible | node count > 0; `#btn-before.active` |
| J3-S2 | After mode — after nodes visible | node count > 0; `#btn-after.active` |
| J3-S3 | Split mode — combined count ≥ Before count | split nodes ≥ before nodes |
| J3-S4 | Overlay mode — diff classes on nodes | `.diff-added` or `.diff-removed` count > 0 |
| J3-S5 | Only one `.view-btn.active` at a time | active count = 1 for each mode |
| J3-S6 | `?view=after` URL param pre-selects After | `#btn-after.active` on load |

**Progress reporting:**
```
[T8 ▶ 0:00] Loading order-approval.json. Testing Before mode…
[T8 ▶ 0:15] J3-S1 PASS. J3-S2 PASS. J3-S3 PASS (split=19 > before=10).
[T8 ▶ 0:30] J3-S4 PASS (diff classes applied). J3-S5 PASS.
[T8 ✓ 0:40] J3-S6 PASS. 6/6 passed. T8 → ✅
```

### T9 — Fix failures from T8

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J3-S1: no nodes in Before mode | `isVisible()` logic inverted | Review `data.js isVisible()` — before nodes should show when viewMode='before' |
| J3-S4: no diff classes | `applyDiffClasses` not called | Verify `initDiff(graph)` called after `renderAll` in main.js |
| J3-S5: multiple active buttons | Click handler not removing `active` | Check `initViewModeButtons()` in interactions.js |
| J3-S6: URL param ignored | `applyUrlParams` not updating button | Ensure button click or classList.add('active') called |

**Progress reporting:**
```
[T9 ▶ 0:00] J3-S4 failed: 0 diff-added nodes. Checking initDiff call…
[T9 ▶ 0:15] Found: initDiff called before renderAll completes async. Reordering…
[T9 ✓ 0:25] 6/6 passing. T9 → ✅
```

---

## Agent C2 — Diff Engine (T10 + T11)

### T10 — Run 04-diff.spec.js

```bash
cd testing
npx playwright test tests/04-diff.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J4-S1 | Overlay — at least one `diff-added` node | count > 0 |
| J4-S2 | Overlay — at least one `diff-removed` node | count > 0 |
| J4-S3 | Phase dots rendered for order-approval | `#phase-dots` button count > 0 |
| J4-S4 | Clicking first phase dot filters nodes | node count changes; dot has active state |
| J4-S5 | Clicking active dot again shows all phases | node count returns to full |
| J4-S6 | Split mode — no diff classes applied | `.diff-added` + `.diff-removed` count = 0 |

**Progress reporting:**
```
[T10 ▶ 0:00] Setting overlay mode. Checking diff classes on order-approval…
[T10 ▶ 0:15] J4-S1 PASS (4 diff-added). J4-S2 PASS (3 diff-removed).
[T10 ▶ 0:25] J4-S3 PASS (3 phase dots). Testing phase filter…
[T10 ✓ 0:40] J4-S4 PASS. J4-S5 PASS. J4-S6 PASS. 6/6. T10 → ✅
```

### T11 — Fix failures from T10

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J4-S1/S2: 0 diff nodes | `classifyDiff` not returning expected map | Check `diff.js classifyDiff` — nodes with `phase='after'` should be `added`, `phase='before'` should be `removed` |
| J4-S3: 0 phase dots | `renderPhaseDots` not injecting buttons | Check `renderer.js renderPhaseDots` — verify `graph.phases` array is read |
| J4-S4: node count unchanged after dot click | Phase filter not re-rendering | Check `state.selectedPhase` set + `renderAll` called in phase dot click handler |
| J4-S6: diff classes persist in split mode | `applyDiffClasses` called regardless of mode | Check `initDiff` — should only apply classes in 'overlay' mode |

**Progress reporting:**
```
[T11 ▶ 0:00] J4-S3 failing: 0 phase dots. Checking renderPhaseDots…
[T11 ▶ 0:15] Found: graph.phases array exists but renderPhaseDots checks wrong key. Fixing…
[T11 ✓ 0:30] All fixed. 6/6 passing. T11 → ✅
```

---

## Outputs

- [ ] `03-view-modes.spec.js` — 6/6 passing on chromium
- [ ] `04-diff.spec.js` — 6/6 passing on chromium
- [ ] diff-added / diff-removed / diff-unchanged all verified visually in trace screenshots
- [ ] Phase dot filtering verified against all 3 phases in order-approval

## Chapter Complete When

T8 and T10 both show ✅. Update CHAPTERS.md CH-T2 → ✅ Done.
