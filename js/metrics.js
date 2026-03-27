/**
 * metrics.js — KPI HUD and metrics comparison panel
 * Implements T21+T22: floating KPI tracker (#kpi-hud) and
 * before/after metrics panel (#metrics-panel).
 */

import { state, dom } from './state.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Derive the display color for a KPI value given its direction and baseline.
 * lower_is_better: current < baseline → green, current > baseline → red
 * higher_is_better (or any other): inverted logic
 * Equal → amber
 */
function kpiColor(kpi) {
  const current  = Number(kpi.current);
  const baseline = Number(kpi.baseline);
  const lower    = kpi.direction === 'lower_is_better';

  if (current === baseline) return '#f59e0b';
  if (lower) {
    return current < baseline ? '#22c55e' : '#ef4444';
  }
  // higher_is_better
  return current > baseline ? '#22c55e' : '#ef4444';
}

// ── renderKpiHud ─────────────────────────────────────────────────────────────

/**
 * Populate #kpi-hud with live KPI values from graph.story.kpis.
 * Hides the element if there are no KPIs.
 */
export function renderKpiHud(graph) {
  const el = dom.kpiHud;
  if (!el) return;

  const kpis = graph?.story?.kpis;

  if (!kpis || kpis.length === 0) {
    el.style.display = 'none';
    return;
  }

  let html = '<div style="font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">KPI TRACKER</div>';

  for (const kpi of kpis) {
    const color = kpiColor(kpi);
    const value = kpi.current != null ? kpi.current : '—';
    const unit  = kpi.unit  || '';

    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #1e2535">` +
            `<span style="color:#64748b;font-size:10px">${kpi.label}</span>` +
            `<span style="color:${color};font-weight:700;font-size:12px">${value}${unit}</span>` +
            `</div>`;
  }

  el.innerHTML = html;
}

// ── renderMetricsPanel ───────────────────────────────────────────────────────

const METRIC_FIELDS = [
  { key: 'stepCount',       label: 'Steps'             },
  { key: 'cycleTimeHours',  label: 'Cycle Time (hrs)'  },
  { key: 'handoffCount',    label: 'Handoffs'           },
  { key: 'errorRate',       label: 'Error Rate'         },
  { key: 'automationPct',   label: 'Automation %'       },
  { key: 'costPerCase',     label: 'Cost / Case'        },
];

/**
 * Populate #metrics-panel with before/after comparison from graph.metrics.
 * Hides the element if there are no metrics.
 */
export function renderMetricsPanel(graph) {
  const el = dom.metricsPanel;
  if (!el) return;

  const metrics = graph?.metrics;

  if (!metrics) {
    el.style.display = 'none';
    return;
  }

  const before = metrics.before || {};
  const after  = metrics.after  || {};

  // Filter to fields where at least one side has a defined value
  const visibleFields = METRIC_FIELDS.filter(
    f => before[f.key] != null || after[f.key] != null
  );

  if (visibleFields.length === 0) {
    el.style.display = 'none';
    return;
  }

  let rows = '';
  for (const f of visibleFields) {
    const bVal = before[f.key] != null ? before[f.key] : '—';
    const aVal = after[f.key]  != null ? after[f.key]  : '—';

    rows += `<div class="metric-row" style="display:grid;grid-template-columns:1fr 80px 80px;gap:4px;padding:3px 0;border-bottom:1px solid #1e2535">` +
            `<span style="color:#94a3b8;font-size:10px">${f.label}</span>` +
            `<span style="color:#fca5a5;font-size:10px;text-align:right">${bVal}</span>` +
            `<span style="color:#86efac;font-size:10px;text-align:right">${aVal}</span>` +
            `</div>`;
  }

  el.innerHTML =
    `<div style="padding:12px">` +
      `<div style="font-size:9px;color:#475569;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">PROCESS METRICS</div>` +
      `<div style="display:grid;grid-template-columns:1fr 80px 80px;gap:4px;margin-bottom:6px">` +
        `<span style="color:#475569;font-size:9px">METRIC</span>` +
        `<span style="color:#ef4444;font-size:9px;text-align:right">BEFORE</span>` +
        `<span style="color:#22c55e;font-size:9px;text-align:right">AFTER</span>` +
      `</div>` +
      rows +
    `</div>`;
}

// ── initMetrics ──────────────────────────────────────────────────────────────

/**
 * Render both panels and wire up the toggle checkboxes.
 * @param {object} graph — the parsed JSON graph object
 */
export function initMetrics(graph) {
  renderKpiHud(graph);
  renderMetricsPanel(graph);

  // ── #chk-show-kpis → #kpi-hud ──────────────────────────────────────────
  const chkKpis = dom.chkShowKpis;
  const kpiHud  = dom.kpiHud;

  if (chkKpis && kpiHud) {
    // Honour initial checkbox state (only applies when KPIs exist)
    if (!chkKpis.checked) {
      kpiHud.style.display = 'none';
    }

    chkKpis.addEventListener('change', () => {
      kpiHud.style.display = chkKpis.checked ? '' : 'none';
    });
  }

  // ── #chk-show-metrics → #metrics-panel ─────────────────────────────────
  const chkMetrics     = dom.chkShowMetrics;
  const metricsPanel   = dom.metricsPanel;

  if (chkMetrics && metricsPanel) {
    // Show panel on init only when metrics data exists; sync checkbox state
    const hasMetrics = Boolean(graph?.metrics);
    if (hasMetrics) {
      metricsPanel.style.display = chkMetrics.checked ? '' : 'none';
    } else {
      metricsPanel.style.display = 'none';
      chkMetrics.checked = false;
    }

    chkMetrics.addEventListener('change', () => {
      if (!graph?.metrics) return;
      metricsPanel.style.display = chkMetrics.checked ? '' : 'none';
    });
  }
}
