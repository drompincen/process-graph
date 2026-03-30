# CH-T5 — Sequence View & Narrative
**Agents:** F1 (sequence view), F2 (narrative) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T20 | Run 08-sequence-view.spec.js — full pass | F1 | ⬜ | J8: 5 stories |
| T21 | Fix any sequence SVG failures | F1 | ⬜ | Needs T20 |
| T22 | Run 09-narrative.spec.js — full pass | F2 | ⬜ | J9: 9 stories (order-approval only) |
| T23 | Fix any narrative/slide failures | F2 | ⬜ | Needs T22 |

---

## Agent F1 — Sequence View (T20 + T21)

### T20 — Run 08-sequence-view.spec.js

```bash
cd testing
npx playwright test tests/08-sequence-view.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J8-S1 | Enable Sequence View → `#sequence-container` visible | display not `none` |
| J8-S2 | `#sequence-svg` has `<line>` lifelines | `line` count > 0 |
| J8-S3 | `#sequence-svg` has participant text labels | `text` count > 0 |
| J8-S4 | Disable Sequence View → hides it, shows diagram | `#sequence-container` hidden; `#svg-container` visible |
| J8-S5 | `#sequence-svg` has path/polygon arrow elements | `path` or `polygon` count > 0 |

**Progress reporting:**
```
[T20 ▶ 0:00] Loading order-approval.json. Enabling sequence view…
[T20 ▶ 0:15] J8-S1 PASS (container visible). J8-S2 PASS (8 lifelines). J8-S3 PASS.
[T20 ▶ 0:25] J8-S4 PASS (reverts to diagram). J8-S5 PASS (arrows rendered).
[T20 ✓ 0:30] 5/5 passed. T20 → ✅
```

### T21 — Fix failures from T20

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J8-S1: container not visible | `initSequenceView` not called or checkbox ID mismatch | Verify `#chk-sequence-view` triggers `renderSequenceView` + shows `#sequence-container` |
| J8-S2: no `<line>` elements | `renderSequenceView` not drawing lifelines | Check `sequence-view.js` — it should draw vertical `<line>` for each participant |
| J8-S4: `#svg-container` hidden after disable | Container display logic inverted | Check toggle: enabling shows `#sequence-container` AND hides `#svg-container`; disabling reverses |
| J8-S5: no arrows | No `activeSequence` steps → no arrows drawn | Verify `state.activeSequence` populated for order-approval — check `resolveActiveSequence` call |

**Debug sequence rendering:**
```bash
npx playwright test tests/08-sequence-view.spec.js --headed --slow-mo=300 --project=chromium
```

**Progress reporting:**
```
[T21 ▶ 0:00] J8-S2 failing: 0 lines in sequence SVG. Checking renderSequenceView…
[T21 ▶ 0:15] state.activeSequence empty when renderSequenceView called. resolveActiveSequence needs graph.sequence. Checking order-approval.json…
[T21 ▶ 0:25] order-approval has sequence array. initSequenceView called before state.activeSequence set. Fixing call order…
[T21 ✓ 0:35] 5/5 passing. T21 → ✅
```

---

## Agent F2 — Narrative Mode (T22 + T23)

> **Important:** Narrative tests ONLY work with `order-approval.json` (has `story` field).
> `ticket-triage.json` and `onboarding.json` do NOT have a story object — narrative tests will skip on them.

### T22 — Run 09-narrative.spec.js

```bash
cd testing
npx playwright test tests/09-narrative.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J9-S1 | `#btn-story` visible for order-approval | display not `none` |
| J9-S2 | Click Story → `#narrative-view` visible | full-screen overlay opens |
| J9-S3 | First slide shows problem content | `#slide-container` has non-empty text |
| J9-S4 | ArrowRight navigates to next slide | slide content changes |
| J9-S5 | Nav dot click jumps to slide | dot receives active state |
| J9-S6 | Narrative sidebar has KPI HUD content | `#narrative-kpi-hud` non-empty |
| J9-S7 | A+ font button increases `--narrative-font-scale` | CSS var increases |
| J9-S8 | Escape closes narrative view | `#narrative-view` hidden |
| J9-S9 | `?story=true` URL param auto-opens narrative | view visible on load |

**Progress reporting:**
```
[T22 ▶ 0:00] Loading order-approval.json. Waiting for initNarrative…
[T22 ▶ 0:15] J9-S1 PASS (#btn-story visible). Clicking Story button…
[T22 ▶ 0:20] J9-S2 PASS (narrative-view visible). Reading slide content…
[T22 ▶ 0:30] J9-S3 PASS. J9-S4 PASS (slide changed). J9-S5 PASS.
[T22 ▶ 0:40] J9-S6 PASS (KPI content). J9-S7 PASS (font scale up).
[T22 ✓ 0:55] J9-S8 PASS. J9-S9 PASS (auto-open). 9/9. T22 → ✅
```

### T23 — Fix failures from T22

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J9-S1: `#btn-story` hidden | `initNarrative` not called or `graph.story` null | Verify main.js: `if (graph.story) initNarrative(graph)` — check order-approval.json has `story` key |
| J9-S2: narrative-view not opening | Click fires but display doesn't change | Check `initNarrative` wires `#btn-story` click → sets `narrativeView.style.display = ''` |
| J9-S3: empty slide container | `buildSlides` returns empty array | Check `narrative.js buildSlides` — reads `graph.story.problem`, `graph.story.vision`, `graph.story.phases` |
| J9-S4: slide content not changing | ArrowRight not handled in narrative view | Check `initNarrative` keyboard listener — `ArrowRight` should call `renderSlide(index+1)` |
| J9-S6: empty KPI HUD in sidebar | KPI accumulation not triggered | Check narrative's `renderSlide` calls `renderKpiHud` in the sidebar context |
| J9-S7: font scale not in CSS var | `state.fontScale` updated but not applied to DOM | Check font-larger button handler: `document.documentElement.style.setProperty('--narrative-font-scale', state.fontScale)` |
| J9-S9: auto-open not working | `storyParam === 'true'` check in main.js but 400ms delay | The 400ms `setTimeout` should work — if not, increase to 800ms in the test |

**Debug narrative:**
```bash
npx playwright test tests/09-narrative.spec.js --headed --slow-mo=500 \
  --grep "J9-S4" --project=chromium
```

**Progress reporting:**
```
[T23 ▶ 0:00] J9-S7 failing: CSS var not updated. Checking font-larger handler…
[T23 ▶ 0:15] Found: fontScale stored in state but not pushed to documentElement. Adding setProperty call…
[T23 ✓ 0:25] 9/9 passing. T23 → ✅
```

---

## Outputs

- [ ] `08-sequence-view.spec.js` — 5/5 passing on chromium
- [ ] `09-narrative.spec.js` — 9/9 passing on chromium
- [ ] Sequence SVG screenshot saved showing lifelines and arrows
- [ ] Narrative full-screen screenshot showing Problem slide
- [ ] KPI HUD sidebar screenshot showing accumulated values

## Chapter Complete When

T20 and T22 both show ✅. Update CHAPTERS.md CH-T5 → ✅ Done.
