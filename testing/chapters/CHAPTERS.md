# Process Graph — Testing Chapter Tracker
> Master tracker for the E2E test suite execution.
> Update chapter status as tasks complete.

---

## Overall Progress

| Chapter | Title | Agents | Tasks | Status |
|---------|-------|--------|-------|--------|
| [CH-T0](ch0-infrastructure/tasks.md) | Infrastructure & Backend | A (sequential) | 3 tasks | ⬜ Not Started |
| [CH-T1](ch1-smoke-loading/tasks.md) | Smoke & Diagram Loading | B1+B2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T2](ch2-views-diff/tasks.md) | View Modes & Diff Engine | C1+C2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T3](ch3-simulation/tasks.md) | Process Simulation | D (single) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T4](ch4-edit-json/tasks.md) | Edit Mode & JSON Editor | E1+E2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T5](ch5-sequence-narrative/tasks.md) | Sequence View & Narrative | F1+F2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T6](ch6-panels-export/tasks.md) | Metrics, Benefits & Export | G1+G2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T7](ch7-options-zoom/tasks.md) | Options, Theme & Zoom | H1+H2 (parallel) | 4 tasks | ⬜ Blocked by CH-T0 |
| [CH-T8](ch8-full-validation/tasks.md) | Full Validation & Report | I (sequential) | 3 tasks | ⬜ Blocked by CH-T1–T7 |

**Total: 30 tasks across 9 chapters**

---

## Dependency Flow

```
CH-T0 (T1→T2→T3) ─────────────────────────────────────────────┐
                                                                ▼
              ┌─────────┬─────────┬─────────┬─────────┬────────┤
              ▼         ▼         ▼         ▼         ▼        ▼
           CH-T1     CH-T2     CH-T3     CH-T4     CH-T5   CH-T6  CH-T7
         B1+B2      C1+C2       D        E1+E2     F1+F2   G1+G2  H1+H2
              └─────────┴─────────┴─────────┴─────────┴────────┴──────┘
                                                                │
                                                                ▼
                                                             CH-T8
                                                          I (sequential)
```

CH-T1 through CH-T7 all run in parallel once CH-T0 completes.
Each runs their own Playwright worker against the shared backend.

---

## Parallel Execution Windows

### Window 1 — Sequential (CH-T0)
One agent: T1 → T2 → T3

### Window 2 — 7 parallel agent streams (CH-T1 through CH-T7)
After T3 (backend confirmed healthy), launch simultaneously:
- **Agent B1:** CH-T1 smoke tests
- **Agent B2:** CH-T1 diagram loading tests
- **Agent C1:** CH-T2 view mode tests
- **Agent C2:** CH-T2 diff engine tests
- **Agent D:**  CH-T3 simulation tests
- **Agent E1:** CH-T4 edit mode tests
- **Agent E2:** CH-T4 JSON editor tests
- **Agent F1:** CH-T5 sequence view tests
- **Agent F2:** CH-T5 narrative tests
- **Agent G1:** CH-T6 metrics & benefits tests
- **Agent G2:** CH-T6 export tests
- **Agent H1:** CH-T7 options & theme tests
- **Agent H2:** CH-T7 zoom preset tests

### Window 3 — Sequential (CH-T8)
After all Window 2 streams pass: T28 → T29 → T30

---

## Status Key
| Symbol | Meaning |
|--------|---------|
| ⬜ | Not Started |
| 🔵 | In Progress |
| ✅ | Complete — all done-when criteria met |
| ❌ | Blocked — failing tests need investigation |

---

## Agent Status Reporting Format

Agents must print a status line every ~15 seconds while running:

```
[T5 ▶ 0:15] Running J1-S1…J1-S3 — 3/5 passed
[T5 ▶ 0:30] Running J1-S4…J1-S5 — 5/5 passed, no failures
[T5 ✓ 0:45] CH-T1 smoke complete. 5 passed. Starting diagram-loading.
```

Format: `[T{id} {▶|✓|✗} {elapsed}] {what you just finished or are doing next}`

---

## Key Files

| What | Where |
|------|-------|
| User stories + journeys | `testing/journeys.md` |
| Playwright config | `testing/playwright.config.js` |
| Backend launcher | `testing/global-setup.js` |
| Shared helpers | `testing/tests/helpers.js` |
| All spec files | `testing/tests/*.spec.js` |
| HTML report (after run) | `testing/playwright-report/index.html` |
