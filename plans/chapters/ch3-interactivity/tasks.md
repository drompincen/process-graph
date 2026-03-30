# Chapter 3 — Interactivity
**Agents:** D1 (animation), D2 (edit mode), D3 (file ops) — run in parallel after CH1
**Blocks:** CH4

## Parallel Streams

```
D1: T15 (token + playback) ──► T16 (badges + log + toasts + pane resizer) ────┐
D2: T17 (drag + snap + undo) ──► T18 (inline edit + delay + theme toggle) ────┤──► CH4
D3: T19 (JSON editor + selector) ──► T20 (upload/download + widgets.css) ──────┘
```

## Tasks

| ID | Task | Agent | Status | Blocked By |
|----|------|-------|--------|-----------|
| T15 | animation.js — SVG token + playback controls | D1 | ⬜ | T10 |
| T16 | animation.js — badges, log, toasts, pane resizer | D1 | ⬜ | T15 |
| T17 | interactions.js — drag + snap + undo + view toggles | D2 | ⬜ | T10 |
| T18 | interactions.js — inline label edit + delay slider | D2 | ⬜ | T17 |
| T19 | file-ops.js — JSON editor sidebar + diagram selector | D3 | ⬜ | T10 |
| T20 | file-ops.js — upload/download + widgets.css | D3 | ⬜ | T19 |

## Outputs

- [ ] `js/animation.js` — token animation, all 5 playback controls, step badges, log, toasts, pane resizer
- [ ] `css/animation.css` — popIn, fadeIn, tokenPulse keyframes; log entry styles
- [ ] `js/interactions.js` — SVG drag 20px snap, undo, inline edit, all Options checkboxes wired
- [ ] `js/file-ops.js` — JSON editor, diagram selector, file upload/download, notebook
- [ ] `css/widgets.css` — editor pane, log pane, pane resizer, notebook, popup toasts

## Parallel Launch Instructions

After T10 (renderAll complete), launch simultaneously:
- **D1:** Read `plans/04-agents-D-interactivity.md` (D1 section). Reference `archviz/docs/sample/js/animation.js` and `archviz/docs/sample/js/logging.js`. Token is SVG not a div.
- **D2:** Read `plans/04-agents-D-interactivity.md` (D2 section). Reference `archviz/docs/sample/js/ui-interactions.js`. Drag targets are SVG `<g>` elements.
- **D3:** Read `plans/04-agents-D-interactivity.md` (D3 section). Reference `archviz/docs/sample/js/file-operations.js` and `archviz/docs/sample/js/data-loading.js`.

## Chapter Complete When

- ▶ Simulate plays token along paths with badges and log entries
- Edit mode drag repositions nodes with 20px snap; Ctrl+Z undoes
- JSON editor shows current state; upload/download work
