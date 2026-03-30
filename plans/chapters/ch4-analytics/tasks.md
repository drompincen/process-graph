# Chapter 4 — Analytics Panels
**Agents:** E1 (metrics), E2 (benefits) — run in parallel after CH2 + CH3
**Blocks:** CH5

## Parallel Streams

```
E1: T21 (metrics bar + panel) ──► T22 (KPI HUD + panels.css) ─┐
E2: T23 (benefit cards + highlighting + panels.css) ───────────┘──► CH5
```

## Tasks

| ID | Task | Agent | Status | Blocked By |
|----|------|-------|--------|-----------|
| T21 | metrics.js — SVG metrics bar + floating panel | E1 | ⬜ | T11 (diff), T16 (badges complete) |
| T22 | metrics.js — KPI HUD + panels.css (metrics section) | E1 | ⬜ | T21 |
| T23 | benefits.js — benefit cards + node highlighting + panels.css | E2 | ⬜ | T18 (narrative KPI), T22 |

## Outputs

- [ ] `js/metrics.js` — `renderMetricsBar()`, `renderMetricsPanel()`, `renderKpiHud()`
- [ ] `js/benefits.js` — `renderBenefitsPanel()`, `visibleBenefits()`, node highlight click handler
- [ ] `css/panels.css` — metrics panel, KPI HUD, benefit cards, progress bars, diff chips

## Parallel Launch Instructions

After CH2 + CH3 both complete:
- **E1:** Read `plans/05-agents-E-analytics.md` (E1 section). Reference `archviz/docs/sample/js/narrative.js` (renderKpiHud). Metrics bar should match `preview.html` SVG style.
- **E2:** Read `plans/05-agents-E-analytics.md` (E2 section). Reference `archviz/docs/sample/js/benefits.js` directly.

## Chapter Complete When

- Metrics bar shows correct before/after values with delta badges
- Floating metrics panel opens with all KPI rows and diff summary chips
- KPI HUD updates as narrative slides are navigated
- Benefits cards render; clicking highlights correct SVG nodes
