# CH-T3 — Process Simulation
**Agent:** D (single — simulation tests are sequential by nature)
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T12 | Run 05-simulation.spec.js — full pass | D | ⬜ | J5: 9 stories |
| T13 | Fix animation/token failures | D | ⬜ | Needs T12 |
| T14 | Run simulation with slow-mo to verify visually | D | ⬜ | Needs T13 |
| T15 | Re-run at final speed, confirm 9/9 | D | ⬜ | Needs T14 |

---

## Agent D — Simulation (T12 → T15)

### T12 — Run 05-simulation.spec.js

```bash
cd testing
npx playwright test tests/05-simulation.spec.js --reporter=list --project=chromium
```

> **Note:** These tests involve timing-sensitive animation. The spec sets delay-slider to 0.3s.
> If tests are flaky, increase the `waitForTimeout` values in the spec rather than modifying source code.

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J5-S1 | Click Simulate → token appears | `.anim-token` visible in `#token-layer` |
| J5-S2 | Token moves after first step | `cx` attribute changes after 700ms |
| J5-S3 | Log pane receives entries | `.log-entry` count ≥ 1 |
| J5-S4 | Step badge on visited node | `.step-badge` count ≥ 1 |
| J5-S5 | Pause freezes token | `cx` unchanged for 800ms after pause |
| J5-S6 | Next-step increments log by 1 | entry count increases by exactly 1 |
| J5-S7 | Fast-forward completes simulation | `.anim-token` detached within 8s |
| J5-S8 | Second Simulate restarts from beginning | entry count ≤ 3 at restart |
| J5-S9 | No crash when diagram has no sequence | no JS error thrown |

**Progress reporting:**
```
[T12 ▶ 0:00] Starting simulation tests. Loading order-approval.json…
[T12 ▶ 0:15] J5-S1 PASS (token visible). J5-S2 PASS (cx changed).
[T12 ▶ 0:30] J5-S3 PASS (3 log entries). J5-S4 PASS (step badge). Testing pause…
[T12 ▶ 0:45] J5-S5 PASS. J5-S6 PASS. Testing FF…
[T12 ▶ 1:00] J5-S7 PASS. J5-S8 PASS. J5-S9 PASS.
[T12 ✓ 1:05] 9/9 passed. T12 → ✅
```

### T13 — Fix animation/token failures

**Common failures and fixes:**

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J5-S1: `.anim-token` never appears | `state.layout` null at simulate time | Guard added in animation.js — verify `if (!state.layout \|\| !state.layout.nodes) return` is present |
| J5-S1: token uses wrong filter | `url(#glow-blue)` not defined | Fixed in animation.js to `url(#token-glow)` — verify the fix was saved |
| J5-S2: `cx` unchanged | All nodes at 0,0 in layout | Check `computeLayout` returns non-zero node positions for order-approval.json |
| J5-S5: pause test flaky | Timing window too tight | Increase `waitForTimeout(800)` to `waitForTimeout(1200)` in pause test |
| J5-S7: FF test timeout | Token never detaches | Check `stopPlayback()` removes token; verify `_token.remove()` called |
| J5-S6: next-step count wrong | `pauseEachStep` not set before starting | The test enables it via checkbox — verify checkbox ID `#chk-pause-step` matches HTML |

**Debug command for visual inspection:**
```bash
npx playwright test tests/05-simulation.spec.js --headed --slow-mo=500 --project=chromium
```

**Progress reporting:**
```
[T13 ▶ 0:00] J5-S2 failing: cx not changing. Checking node positions in layout…
[T13 ▶ 0:15] Layout has all nodes at laneY=50 but absolute y=0. computeLayout lane offset bug.
[T13 ▶ 0:30] Checked layout.js — lane offset correctly applied. Issue is token created before renderAll. Adding await…
[T13 ✓ 0:45] Fixed. 9/9 passing. T13 → ✅
```

### T14 — Visual verification with slow-mo

Run the full suite in headed mode with slow motion to visually confirm token behaviour:

```bash
npx playwright test tests/05-simulation.spec.js \
  --headed \
  --slow-mo=300 \
  --project=chromium \
  --reporter=list
```

**Visual checklist (observe during run):**
- [ ] Token appears as a blue circle on the first node
- [ ] Token smoothly interpolates to next node
- [ ] Step badges appear as numbered circles on visited nodes
- [ ] Log pane entries appear as token progresses
- [ ] Token disappears when simulation ends
- [ ] Pause stops movement mid-animation
- [ ] Fast-forward visibly speeds up animation

**Progress reporting:**
```
[T14 ▶ 0:00] Running headed slow-mo session…
[T14 ▶ 0:30] Token moves correctly. Badges visible. Log updating.
[T14 ✓ 1:00] Visual pass confirmed. T14 → ✅
```

### T15 — Final speed confirmation

```bash
npx playwright test tests/05-simulation.spec.js --reporter=list --project=chromium
```

**Done when:** 9/9 passed with no retries.

**Progress reporting:**
```
[T15 ✓ 0:30] 9/9 passed, 0 retries. T15 → ✅
```

---

## Outputs

- [ ] `05-simulation.spec.js` — 9/9 passing on chromium
- [ ] Visual slow-mo pass confirms token, badges, log, pause all work
- [ ] Any timing fixes documented in spec comments
- [ ] No JS errors during simulation (confirmed via J1-S5 approach)

## Chapter Complete When

T15 shows ✅. Update CHAPTERS.md CH-T3 → ✅ Done.
