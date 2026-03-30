# Agents E1, E2 — Analytics Panels
## Process Metrics Panel · Benefits & Improvement Cards

**Depends on:** Agents A + B + C1 (foundation + rendering + diff engine)
**E1 and E2 run in parallel**
**Both block:** Agent F (Export + Polish)

---

## Agent E1 — Metrics Panel + KPI HUD
**Files:** `js/metrics.js` + `css/panels.css`

### Overview

Two distinct UI components:
1. **Metrics bar** — embedded at the bottom of the SVG, always visible
2. **Metrics panel** — floating card, toggled via Options → "Metrics Panel"
3. **KPI HUD** — compact live dashboard, top-right corner, visible in story mode

---

### 1. SVG Metrics Bar

Already partially defined in Agent B2. Rendered directly into SVG at y=`layout.metricsY`.
Shows before/after comparison with delta badges.

```xml
<!-- Metrics bar SVG (appended to diagram-svg, outside lane bands) -->
<rect x="0" y="{metricsY}" width="{svgWidth}" height="32" fill="#0d1120"/>
<line x1="{svgWidth/2}" y1="{metricsY}" x2="{svgWidth/2}" y2="{metricsY+32}" stroke="#1e2535"/>

<!-- Before side -->
<text x="120" y="{metricsY+20}" ...>STEPS: <tspan fill="#94a3b8" font-weight="600">6</tspan></text>
<text x="240" y="{metricsY+20}" ...>TIME: <tspan fill="#94a3b8" font-weight="600">48 hrs</tspan></text>
<text x="370" y="{metricsY+20}" ...>HANDOFFS: <tspan fill="#f87171" font-weight="600">4</tspan></text>
<text x="490" y="{metricsY+20}" ...>ERROR: <tspan fill="#f87171" font-weight="600">~15%</tspan></text>

<!-- After side -->
<text x="600" y="{metricsY+20}" ...>STEPS: <tspan fill="#22c55e" font-weight="600">3 ↓50%</tspan></text>
<text x="730" y="{metricsY+20}" ...>TIME: <tspan fill="#22c55e" font-weight="600">2 hrs ↓96%</tspan></text>
<text x="870" y="{metricsY+20}" ...>HANDOFFS: <tspan fill="#22c55e" font-weight="600">1 ↓75%</tspan></text>
<text x="1010" y="{metricsY+20}" ...>ERROR: <tspan fill="#22c55e" font-weight="600">~2% ↓</tspan></text>
```

Delta badge logic:
```js
function deltaLabel(before, after, lowerIsBetter = true) {
  if (typeof before !== 'number' || typeof after !== 'number') return '';
  const pct = Math.round(((after - before) / before) * 100);
  const improving = lowerIsBetter ? pct < 0 : pct > 0;
  return `${improving ? '↓' : '↑'}${Math.abs(pct)}%`;
}
```

---

### 2. Floating Metrics Panel

Activated via Options → "Metrics Panel". Positioned floating bottom-right of
the SVG container (same pattern as archviz benefits panel).

```
┌─────────────────────────────────────────────────┐
│  Process Metrics                          ╳      │
│ ─────────────────────────────────────────────── │
│  Metric          BEFORE      AFTER    DELTA     │
│  ──────────────  ─────────  ─────────  ──────── │
│  Step Count       6          3         ▼ 50%    │
│  Cycle Time       48 hrs     2 hrs     ▼ 96%    │
│  Handoff Count    4          1         ▼ 75%    │
│  Error Rate       ~15%       ~2%       ▼        │
│  Automation       0%         80%       ▲ 80pp   │
│  Cost / Case      $240       $35       ▼ 85%    │
│ ─────────────────────────────────────────────── │
│  Diff Summary:                                   │
│  [+2 added]  [-3 removed]  [~1 changed]         │
└─────────────────────────────────────────────────┘
```

```js
export function renderMetricsPanel(graph) {
  const panel = dom.metricsPanel;
  if (!panel) return;

  const { before = {}, after = {} } = graph.metrics || {};
  const diff = computeDiffMetrics(graph);

  const rows = [
    ['Step Count',    before.stepCount,       after.stepCount,       true,  ''],
    ['Cycle Time',    before.cycleTimeHours,   after.cycleTimeHours,  true,  ' hrs'],
    ['Handoff Count', before.handoffCount,     after.handoffCount,    true,  ''],
    ['Error Rate',    before.errorRate,        after.errorRate,       true,  ''],
    ['Automation',    before.automationPct,    after.automationPct,   false, '%'],
    ['Cost / Case',   before.costPerCase,      after.costPerCase,     true,  ''],
  ].filter(([, b, a]) => b !== undefined || a !== undefined);

  panel.innerHTML = `
    <div class="metrics-panel-header">
      <span>Process Metrics</span>
      <button onclick="this.closest('#metrics-panel').style.display='none'">╳</button>
    </div>
    <table class="metrics-table">
      <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
      <tbody>
        ${rows.map(([label, b, a, lib, unit]) => `
          <tr>
            <td>${label}</td>
            <td>${b !== undefined ? b + unit : '—'}</td>
            <td>${a !== undefined ? a + unit : '—'}</td>
            <td class="delta ${deltaClass(b, a, lib)}">${deltaLabel(b, a, lib)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="diff-summary">
      <span class="diff-chip added">+${diff.added} added</span>
      <span class="diff-chip removed">-${diff.removed} removed</span>
      <span class="diff-chip changed">~${diff.changed} changed</span>
    </div>
  `;
}
```

---

### 3. KPI HUD (Story Mode)

Shown in top-right corner during narrative mode, toggled by "KPI HUD" checkbox.
Accumulates KPI deltas as user navigates phase slides.

Adapted directly from archviz `narrative.js renderKpiHud()`.

```js
export function renderKpiHud(graph, accumulatedDeltas) {
  const hud = dom.kpiHud;
  if (!hud || !graph.story?.kpis) return;

  hud.innerHTML = graph.story.kpis.map(kpi => {
    const current = kpi.baseline + (accumulatedDeltas[kpi.id] || 0);
    const direction = kpi.direction === 'lower_is_better'
      ? current < kpi.baseline ? 'improving' : current > kpi.baseline ? 'declining' : 'neutral'
      : current > kpi.baseline ? 'improving' : current < kpi.baseline ? 'declining' : 'neutral';

    return `
      <div class="kpi-row kpi-${direction}">
        <span class="kpi-label">${kpi.label}</span>
        <span class="kpi-value">${formatKpi(current, kpi.format)}${kpi.unit ? ' ' + kpi.unit : ''}</span>
        <span class="kpi-arrow">${direction === 'improving' ? '▼' : direction === 'declining' ? '▲' : '—'}</span>
      </div>
    `;
  }).join('');
}
```

---

### `css/panels.css` — Metrics + KPI HUD

```css
/* Floating metrics panel */
#metrics-panel {
  position: absolute;
  bottom: 48px; right: 16px;
  width: 340px;
  background: var(--bg-panel);
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  z-index: 50;
  font-size: 11px;
}
.metrics-panel-header {
  display: flex; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-dim);
  font-weight: 600; color: var(--text-mid);
  letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px;
}
.metrics-table { width: 100%; border-collapse: collapse; }
.metrics-table th, .metrics-table td {
  padding: 5px 14px;
  border-bottom: 1px solid var(--border-dim);
  color: var(--text-mid);
}
.metrics-table th { color: var(--text-dim); font-weight: 600; font-size: 9.5px; }
.delta.improving { color: var(--accent-green); font-weight: 700; }
.delta.declining { color: var(--accent-red);   font-weight: 700; }

.diff-summary { display: flex; gap: 6px; padding: 10px 14px; }
.diff-chip { border-radius: 10px; padding: 2px 8px; font-size: 9px; font-weight: 700; }
.diff-chip.added   { background: #14532d; color: #86efac; }
.diff-chip.removed { background: #7f1d1d; color: #fca5a5; }
.diff-chip.changed { background: #78350f; color: #fcd34d; }

/* KPI HUD */
#kpi-hud {
  position: absolute;
  top: 12px; right: 12px;
  width: 200px;
  background: var(--bg-panel);
  border: 1px solid var(--border-mid);
  border-radius: 6px;
  padding: 10px;
  z-index: 12;
  font-size: 11px;
}
.kpi-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid var(--border-dim);
}
.kpi-row:last-child { border-bottom: none; }
.kpi-label { color: var(--text-dim); font-size: 10px; }
.kpi-value { font-weight: 600; }
.kpi-improving .kpi-value, .kpi-improving .kpi-arrow { color: var(--accent-green); }
.kpi-declining .kpi-value, .kpi-declining .kpi-arrow { color: var(--accent-red); }
.kpi-neutral .kpi-value { color: var(--text-mid); }
```

---

## Agent E2 — Benefits Panel + Improvement Cards
**Files:** `js/benefits.js` + (appended to `css/panels.css`)

### Overview

Directly adapted from archviz `benefits.js`. Shows per-improvement-phase
benefit cards with progress bars, baseline→target comparisons, and node
highlight on click. Used both in the spatial view and inside narrative slides.

### Benefit Card Layout

```
┌─────────────────────────────────────────────────┐
│ ⏳ Faster Approvals               Phase 2       │ ← realized=false → ⏳
├─────────────────────────────────────────────────┤
│ Cycle Time                                      │
│ Baseline:  48 hrs    Target: 1–2 hrs            │
│ ████████████░░░░░░░░░░░░  -96%                 │ ← progress bar
│                                                 │
│ Linked steps: [Submit Portal] [Auto Check]      │ ← click → highlight nodes
└─────────────────────────────────────────────────┘
```

Realized benefits (`realized: true`) → green gradient, ✅ icon, show actual value.
Pending benefits → orange gradient, ⏳ icon.

### Auto-positioning

```js
export function renderBenefitsPanel(graph, layout) {
  const panel = dom.benefitsPanel;
  const svgRect = dom.svgContainer.getBoundingClientRect();
  const rightmostNode = Math.max(...Object.values(layout.nodes).map(n => n.right));
  const spaceRight = svgRect.width - rightmostNode;

  if (spaceRight >= 200) {
    panel.style.right = '16px';
    panel.style.top   = '60px';
  } else {
    panel.style.right  = '16px';
    panel.style.bottom = '48px';  // Above metrics bar
  }
}
```

### Node highlighting on click

```js
card.addEventListener('click', () => {
  benefit.boundNodes.forEach(nodeId => {
    const g = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (g) {
      g.classList.add('benefit-highlight');
      setTimeout(() => g.classList.remove('benefit-highlight'), 3000);
    }
  });
});
```

```css
.node.benefit-highlight rect,
.node.benefit-highlight polygon {
  filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.7));
  stroke: #22c55e !important;
  transition: all 0.2s;
}
```

### Phase accumulation

Benefits visible up to and including `state.selectedPhase`:
```js
function visibleBenefits(graph) {
  if (!state.selectedPhase) return graph.story?.benefits || [];
  const phaseIdx = graph.phases?.findIndex(p => p.id === state.selectedPhase) ?? Infinity;
  return (graph.story?.benefits || []).filter(b => {
    if (!b.phaseId) return true;
    const bIdx = graph.phases?.findIndex(p => p.id === b.phaseId) ?? 0;
    return bIdx <= phaseIdx;
  });
}
```

### `css/panels.css` additions (benefits)

```css
#benefits-panel {
  position: absolute;
  right: 16px; top: 60px;
  width: 220px;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 50;
}

.benefit-card {
  border-radius: 8px;
  padding: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: transform 0.15s;
}
.benefit-card:hover { transform: translateX(-3px); }
.benefit-card.realized {
  background: linear-gradient(135deg, #0d2b18, #142b20);
  border: 1px solid #166534;
}
.benefit-card.pending {
  background: linear-gradient(135deg, #2b1d09, #2b2009);
  border: 1px solid #92400e;
}

.benefit-title { font-weight: 600; margin-bottom: 6px; }
.benefit-card.realized .benefit-title { color: #86efac; }
.benefit-card.pending  .benefit-title { color: #fcd34d; }

.benefit-kpi { color: var(--text-dim); font-size: 10px; margin-bottom: 4px; }
.benefit-range { font-weight: 600; color: var(--text-mid); }

.progress-bar-bg {
  height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  margin: 6px 0;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent-green), #16a34a);
}

.bound-nodes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.bound-chip {
  background: var(--bg-elevated);
  border: 1px solid var(--border-mid);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 9px;
  color: var(--text-dim);
  cursor: pointer;
}
.bound-chip:hover { border-color: var(--accent); color: var(--text-main); }
```
