# Process-Graph — Delivery Dashboard
> Master tracker. Update chapter status as tasks complete.
> Live task IDs are tracked in the session task system (TaskList).

---

## Overall Progress

| Chapter | Title | Agent Team | Tasks | Status |
|---------|-------|------------|-------|--------|
| [CH0](chapters/ch0-foundation/tasks.md) | Foundation | A (sequential) | 4 tasks | ✅ Done |
| [CH1](chapters/ch1-rendering/tasks.md) | Rendering Engine | B1+B2+B3 (parallel) | 6 tasks | ✅ Done |
| [CH2](chapters/ch2-views/tasks.md) | View Modes | C1+C2+C3 (parallel) | 4 tasks | ✅ Done |
| [CH3](chapters/ch3-interactivity/tasks.md) | Interactivity | D1+D2+D3 (parallel) | 6 tasks | ✅ Done |
| [CH4](chapters/ch4-analytics/tasks.md) | Analytics Panels | E1+E2 (parallel) | 3 tasks | ✅ Done |
| [CH5](chapters/ch5-export/tasks.md) | Export + Polish | F (sequential) | 3 tasks | ✅ Done |
| [CH6](chapters/ch6-backend/tasks.md) | Spring Boot + JBang Backend | G1+G2 (parallel) | 3 tasks | ⬜ Not Started |
| [CH7](chapters/ch7-integration/tasks.md) | Integration: PG inside archviz | H1–H5 (4 windows) | 8 tasks | ⬜ Blocked by CH6 |

**Total: 37 tasks across 8 chapters**

---

## Dependency Flow

```
CH0 (T1→T2→T3→T4) ──────────────────────────────────────────────────────────┐
                                                                               ▼
                    CH1-B1: T5 (layout.js) ─────────────────────────────────► T10 (renderAll)
                    CH1-B2: T6 (defs+lanes) → T7 (node shapes) ─────────────► T10
                    CH1-B3: T8 (straight paths) → T9 (elbow+loop) ──────────► T10
                                                                               │
           ┌───────────────────────────────────────────────────────────────────┤
           ▼                         ▼                      ▼                  ▼
    CH2-C1: T11 (diff+views)  CH2-C2: T12 (seq)  CH2-C3: T13→T14  CH3-D1: T15→T16
    CH3-D2: T17→T18           CH3-D3: T19→T20                                 │
                                                                               │
           ┌───────────────────────────────────────────────────────────────────┤
           ▼                                       ▼
    CH4-E1: T21→T22                       CH4-E2: T23
                                                   │
                                                   ▼
                                    CH5-F: T24 → T25 → T26 ✓
                                                   │
                                                   ▼
                                    CH6-G1: T27 → T28+T29
                                    CH6-G2: T30 (parallel with T28)
                                                   │
                              ┌────────────────────┴────────────────────┐
                              ▼                                         ▼
                     Window 1: T30 (ArchViz.java)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                   T31       T32       T33   (Window 2 — 3 parallel)
                    └─────────┴─────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              T34+T35+T36            (Window 3)
                    │
                    ▼
                   T37               (Window 4 — polish)
```

---

## Parallel Execution Windows

### Window 1 — Sequential (CH0)
Run one agent at a time: T1 → T2 → T3 → T4

### Window 2 — 3 parallel agents (CH1)
After T4 completes, launch simultaneously:
- **Agent B1:** T5 (layout.js)
- **Agent B2:** T6, then T7 (can start T6 immediately; T7 waits on T5+T6)
- **Agent B3:** T8, then T9 (can start T8 immediately; T9 waits on T8)
- T10 waits for all three streams to converge

### Window 3 — 6 parallel agents (CH2 + CH3)
After T10 completes, launch simultaneously:
- **Agent C1:** T11
- **Agent C2:** T12 (wait T11 for activeSequence)
- **Agent C3:** T13 → T14
- **Agent D1:** T15 → T16
- **Agent D2:** T17 → T18
- **Agent D3:** T19 → T20

### Window 4 — 2 parallel agents (CH4)
After CH2+CH3 converge:
- **Agent E1:** T21 → T22
- **Agent E2:** T23

### Window 5 — Sequential (CH5)
After CH4: T24 → T25 → T26

### Window 6 — 2 parallel agents (CH6)
After T26:
- **Agent G1:** T27 (scaffold) → T28+T29 (API + CORS, same file)
- **Agent G2:** T30 (run scripts + README, after T27)

### Window 7 — 1 agent (CH7, Window 1)
After CH6:
- **Agent H1:** T30 — extend ArchViz.java (static serving + /api/process-diagrams)

### Window 8 — 3 parallel agents (CH7, Window 2)
After T30:
- **Agent H2:** T31 — archviz HTML mode switcher + CSS
- **Agent H3:** T32 — process-graph embedded/headless mode
- **Agent H4:** T33 — CSS bridge (archviz-bridge.css)

### Window 9 — 1 agent (CH7, Window 3)
After T31+T32+T33:
- **Agent H2:** T34+T35+T36 — JS bridge + diagram selector + URL routing (all in data-loading.js)

### Window 10 — 1 agent (CH7, Window 4)
After T34+T35+T36:
- **Agent H1:** T37 — integration polish + smoke tests + README

---

## How to Use This Tracker

1. **Starting a task:** Set task status to `in_progress` in task system
2. **Completing a task:** Set status to `completed`; update the chapter tasks.md checkbox
3. **Blocked tasks:** Investigate root cause; create a new task for the blocker
4. **Spawning an agent:** Copy the prompt from `plans/agent-prompts.md`; the agent should mark its task in_progress on start and completed when done
5. **Chapter complete:** Update the Overall Progress table above when all tasks in a chapter are ✅

---

## Key Reference Files

| What | Where |
|------|-------|
| Full feature spec per agent | `plans/01-06-agent-*.md` |
| Agent launch prompts | `plans/agent-prompts.md` |
| JSON data model | `plans/data-model.md` |
| Architecture overview | `plans/00-overview.md` |
| Archviz reference | `/mnt/c/Users/drom/IdeaProjects/archviz/docs/sample/` |
| Style reference | `preview.html`, `uml_example.html` |
