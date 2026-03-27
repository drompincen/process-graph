/**
 * benefits.js — Renders floating benefit cards and wires node highlighting
 * Reads graph.story.benefits, populates #benefits-panel, highlights bound
 * SVG nodes on card hover.
 */

import { state, dom } from './state.js';

// ── KPI lookup helpers ────────────────────────────────────────────────────────

/**
 * Build a map of kpiId → KPI object from graph.story.kpis (or []).
 * @param {object} graph
 * @returns {Map<string, object>}
 */
function buildKpiMap(graph) {
  const kpis = graph?.story?.kpis ?? [];
  const map = new Map();
  for (const kpi of kpis) {
    map.set(kpi.id, kpi);
  }
  return map;
}

// ── Card rendering ────────────────────────────────────────────────────────────

/**
 * Create a single benefit card DOM element.
 * @param {object} benefit  — one entry from graph.story.benefits
 * @param {Map}    kpiMap   — kpiId → { label, unit, … }
 * @returns {HTMLElement}
 */
function createBenefitCard(benefit, kpiMap) {
  const {
    id,
    title,
    phaseId,
    kpiId,
    baseline,
    targetRange = {},
    boundNodes = [],
    realized = false,
  } = benefit;

  const kpi = kpiMap.get(kpiId) ?? {};
  const kpiLabel = kpi.label ?? kpiId ?? '';
  const unit = kpi.unit ?? '';

  const card = document.createElement('div');
  card.className = 'benefit-card';
  card.dataset.benefitId = id;
  card.dataset.boundNodes = boundNodes.join(',');

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="color:#e2e8f0;font-size:11px;font-weight:600">${title}</span>
      <span class="benefit-badge ${realized ? 'benefit-realized' : 'benefit-pending'}">
        ${realized ? '✓ DONE' : 'PENDING'}
      </span>
    </div>
    <div style="color:#64748b;font-size:10px;margin-bottom:4px">
      ${kpiLabel}: <span style="color:#fca5a5">${baseline}${unit}</span> →
      <span style="color:#86efac">${targetRange.min ?? '?'}–${targetRange.max ?? '?'}${unit}</span>
    </div>
    <div style="color:#60a5fa;font-size:9px">${phaseId ?? ''}</div>
  `;

  return card;
}

// ── Node highlighting ─────────────────────────────────────────────────────────

/**
 * Add .benefit-highlight to every SVG group whose data-node-id is in nodeIds.
 * @param {string[]} nodeIds
 */
function highlightNodes(nodeIds) {
  if (!dom.nodesLayer || !nodeIds.length) return;
  for (const nodeId of nodeIds) {
    const group = dom.nodesLayer.querySelector(`[data-node-id="${nodeId}"]`);
    if (group) group.classList.add('benefit-highlight');
  }
}

/**
 * Remove .benefit-highlight from all SVG node groups.
 */
function clearNodeHighlights() {
  if (!dom.nodesLayer) return;
  const highlighted = dom.nodesLayer.querySelectorAll('.benefit-highlight');
  for (const el of highlighted) {
    el.classList.remove('benefit-highlight');
  }
}

// ── Hover wiring ──────────────────────────────────────────────────────────────

/**
 * Attach mouseenter/mouseleave listeners to all .benefit-card elements inside
 * #benefits-panel.
 */
function wireCardHover() {
  if (!dom.benefitsPanel) return;
  const cards = dom.benefitsPanel.querySelectorAll('.benefit-card');
  for (const card of cards) {
    card.addEventListener('mouseenter', () => {
      const raw = card.dataset.boundNodes ?? '';
      const nodeIds = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
      highlightNodes(nodeIds);
    });
    card.addEventListener('mouseleave', () => {
      clearNodeHighlights();
    });
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * Clear #benefits-panel and render one card per benefit entry.
 * @param {object} graph
 */
export function renderBenefitCards(graph) {
  if (!dom.benefitsPanel) return;

  dom.benefitsPanel.innerHTML = '';

  const benefits = graph?.story?.benefits ?? [];
  const kpiMap = buildKpiMap(graph);

  for (const benefit of benefits) {
    const card = createBenefitCard(benefit, kpiMap);
    dom.benefitsPanel.appendChild(card);
  }

  wireCardHover();
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise the benefits panel for a given graph.
 * - Hides panel and returns early when there are no benefits.
 * - Renders cards and wires the #chk-show-benefits checkbox toggle.
 * @param {object} graph
 */
export function initBenefits(graph) {
  const benefits = graph?.story?.benefits ?? [];

  if (!benefits.length) {
    if (dom.benefitsPanel) dom.benefitsPanel.style.display = 'none';
    return;
  }

  // Render cards into the panel.
  renderBenefitCards(graph);

  // Show panel initially (benefits exist).
  if (dom.benefitsPanel) dom.benefitsPanel.style.display = 'flex';

  // Wire checkbox toggle.
  if (dom.chkShowBenefits) {
    // Reflect current visibility in checkbox state.
    dom.chkShowBenefits.checked = true;

    dom.chkShowBenefits.addEventListener('change', () => {
      if (!dom.benefitsPanel) return;
      dom.benefitsPanel.style.display = dom.chkShowBenefits.checked ? 'flex' : 'none';
    });
  }
}
