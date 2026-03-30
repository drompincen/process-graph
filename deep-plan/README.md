# Deep Plan — Process Designer Editor

> Transforming process-graph from a **viewer** (~55% complete) into a full
> **Process Designer Editor** per `rules.txt.txt` specification.

## Structure

```
deep-plan/
  README.md            ← you are here
  PROGRESS.md          ← progress tracker with checkboxes (update as you go)
  AGENT-PROMPTS.md     ← copy-paste agent prompts for multi-agent execution
  chapters/
    ch0-data-model.md    ← Data model, port system, connection matrix
    ch1-rendering.md     ← Merge/ProcessGroup shapes, port visuals
    ch2-connections.md   ← Connection rules, snapping, labels, handoffs
    ch3-editor.md        ← Node palette, drag-to-connect, delete, properties
    ch4-swimlanes.md     ← Lane CRUD, cross-lane drag, auto-resize
    ch5-validation.md    ← Full validation engine + UI panel
    ch6-layout-minimap.md← Auto-layout, mini-map, zoom, grid
    ch7-advanced.md      ← Versioning, comments, KPI, simulation
    ch8-visual-fixes.md  ← Bug fixes from issues2/3/4.png screenshots
    ch9-visual-polish.md ← UI polish inspired by n8n/Railway (inspiration.png)
```

## Execution Order

```
PHASE 1 (Foundation):     Ch0
PHASE 2 (Parallel):       Ch1 + Ch2  (both depend on Ch0)
PHASE 3 (Parallel):       Ch3 + Ch5  (Ch3 needs Ch1+Ch2, Ch5 needs Ch0+Ch2)
PHASE 4 (Parallel):       Ch4 + Ch6  (both need Ch3)
PHASE 5 (Final):          Ch7        (needs Ch3-Ch6)
```

## How to Use

1. Open `PROGRESS.md` — see all tasks with checkboxes
2. Pick a chapter to work on (respect dependency order)
3. Read the chapter file for full specs, code patterns, and agent prompts
4. Use `AGENT-PROMPTS.md` to launch parallel agents per chapter
5. After each chapter, run the Verification Agent Prompt at the bottom
6. Update `PROGRESS.md` checkboxes as tasks complete

## Gap Summary

| Area | Current | Target | Gap |
|------|---------|--------|-----|
| Node Types | 8/10 | 10/10 | Merge, Process Group |
| Editing | 30% | 100% | Create, delete, connect, properties |
| Validation | 15% | 100% | 12 rules to implement |
| Connections | 40% | 100% | Matrix, ports, snapping, labels |
| Swimlanes | 50% | 100% | CRUD, cross-lane drag, types |
| Layout | 30% | 100% | Auto-layout, mini-map, 10px grid |
| Export | 95% | 100% | JSON Schema only |
| Advanced | 30% | 100% | Versioning, comments, KPI, simulation |

## Chapters 8-9 (added from issue screenshots + inspiration)

```
PHASE 6 (Bug Fixes):      Ch8  (depends on Ch0-7, fixes visual bugs from issues2/3/4.png)
PHASE 7 (Polish):         Ch9  (depends on Ch8, visual upgrades from inspiration.png/inspiration2.png)
```

## Total: 83 tasks across 10 chapters, 25 parallel agents
