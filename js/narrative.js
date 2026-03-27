/**
 * narrative.js — Story Mode slide presentation
 *
 * Reads from graph.story and renders a full-screen slide show:
 *   slide 0 : problem
 *   slide 1 : vision
 *   slides 2+: one per story.phases entry
 *
 * Exports: buildSlides, renderSlide, initNarrative
 */

import { state, dom } from './state.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Look up a KPI object by id from story.kpis */
function getKpi(kpis, kpiId) {
  return (kpis || []).find(k => k.id === kpiId) || null;
}

/** Format a numeric delta with sign */
function fmtDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Build an inline chip for a KPI impact */
function kpiImpactChip(kpi, impact) {
  const label = kpi ? kpi.label : impact.kpiId;
  const unit   = kpi ? (kpi.unit || '') : '';
  return `<span style="background:#002a12;border:1px solid #22c55e;border-radius:4px;` +
    `padding:2px 8px;color:#86efac;font-size:10px;display:inline-block;margin:2px 2px 2px 0">` +
    `${label} ${fmtDelta(impact.delta)}${unit} (${impact.confidence})` +
    `</span>`;
}

/** Build HTML for a single idea card */
function buildIdeaCardHtml(card, kpis) {
  const impactChips = (card.expectedKpiImpacts || []).map(imp => {
    const kpi = getKpi(kpis, imp.kpiId);
    return kpiImpactChip(kpi, imp);
  }).join('');

  return `<div style="background:#0a1527;border:1px solid #1e3a5f;border-radius:6px;padding:12px;margin-top:10px">` +
    `<div style="color:#60a5fa;font-size:11px;font-weight:600;margin-bottom:6px">${card.title}</div>` +
    `<div style="color:#d1d5db;font-size:11px;line-height:1.5">${card.hypothesis}</div>` +
    (impactChips ? `<div style="margin-top:8px">${impactChips}</div>` : '') +
    `</div>`;
}

// ─── Slide builders ─────────────────────────────────────────────────────────

/** Build the Problem slide HTML */
function buildProblemSlideHtml(problem, kpis) {
  const kpi = getKpi(kpis, (problem.impactMetric || {}).kpiId);
  const kpiLabel = kpi ? kpi.label : (problem.impactMetric ? problem.impactMetric.kpiId : '');

  const evidenceLinks = (problem.evidence || []).map(ev =>
    `<a href="${ev.url}" style="color:#60a5fa;text-decoration:none" target="_blank">${ev.label}</a>`
  ).join(' &nbsp;·&nbsp; ');

  const riskItems = (problem.risks || []).map(r => `<li>${r}</li>`).join('');

  const impactChip = problem.impactMetric
    ? `<div style="background:#2a0505;border:1px solid #7f1d1d;border-radius:6px;padding:8px 12px;` +
      `display:inline-flex;align-items:center;gap:8px;margin:8px 0">` +
      `<span style="color:#ef4444;font-size:20px;font-weight:700">` +
      `${problem.impactMetric.value}${problem.impactMetric.unit}</span>` +
      `<span style="color:#9ca3af;font-size:11px">${kpiLabel} (baseline)</span>` +
      `</div>`
    : '';

  return `<div class="slide-card slide-problem">` +
    `<div style="color:#ef4444;font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">THE PROBLEM</div>` +
    `<h2 style="color:#fca5a5;margin:0 0 16px">${problem.headline}</h2>` +
    `<p style="color:#d1d5db;line-height:1.6;margin:0 0 12px">${problem.description}</p>` +
    impactChip +
    (evidenceLinks
      ? `<div style="margin-top:12px;font-size:11px;color:#6b7280">Evidence: ${evidenceLinks}</div>`
      : '') +
    (riskItems
      ? `<ul style="color:#9ca3af;font-size:11px;margin-top:12px;padding-left:20px;line-height:1.7">${riskItems}</ul>`
      : '') +
    `</div>`;
}

/** Build the Vision slide HTML */
function buildVisionSlideHtml(vision, kpis) {
  const targetBadges = (vision.kpiTargets || []).map(t => {
    const kpi = getKpi(kpis, t.kpiId);
    const label = kpi ? kpi.label : t.kpiId;
    const unit  = kpi ? (kpi.unit || '') : '';
    const range = t.min === t.max
      ? `${t.min}${unit}`
      : `${t.min}–${t.max}${unit}`;
    return `<div style="background:#003316;border:1px solid #14532d;border-radius:6px;padding:8px 14px;` +
      `display:inline-flex;flex-direction:column;gap:2px;margin:4px 4px 4px 0;vertical-align:top">` +
      `<span style="color:#22c55e;font-size:16px;font-weight:700">${range}</span>` +
      `<span style="color:#6b7280;font-size:10px">${label} · ${t.confidence} · ${t.horizon}</span>` +
      `</div>`;
  }).join('');

  const acItems = (vision.acceptanceCriteria || []).map(c =>
    `<li style="margin-bottom:4px">${c}</li>`
  ).join('');

  return `<div class="slide-card slide-vision">` +
    `<div style="color:#22c55e;font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">THE VISION</div>` +
    `<h2 style="color:#bbf7d0;margin:0 0 16px">${vision.summary}</h2>` +
    `<p style="color:#d1d5db;line-height:1.6;margin:0 0 16px">${vision.description}</p>` +
    (targetBadges
      ? `<div style="margin-bottom:16px">${targetBadges}</div>`
      : '') +
    (acItems
      ? `<div>` +
        `<div style="color:#22c55e;font-size:10px;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px">Acceptance Criteria</div>` +
        `<ul style="color:#9ca3af;font-size:11px;padding-left:20px;line-height:1.7;margin:0">${acItems}</ul>` +
        `</div>`
      : '') +
    `</div>`;
}

/** Build a Phase slide HTML */
function buildPhaseSlideHtml(phase, phaseIndex, ideaCards, kpis) {
  const phaseNum = phaseIndex + 1;
  const cards = (ideaCards || []).filter(c =>
    (c.phases || []).includes(phase.phaseRef)
  );
  const cardHtml = cards.map(c => buildIdeaCardHtml(c, kpis)).join('');

  return `<div class="slide-card slide-phase">` +
    `<div style="color:#60a5fa;font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">PHASE ${phaseNum}</div>` +
    `<h2 style="color:#bfdbfe;margin:0 0 16px">${phase.label}</h2>` +
    `<p style="color:#d1d5db;line-height:1.6;margin:0 0 12px">${phase.description}</p>` +
    (phase.duration
      ? `<span style="background:#0a1527;border:1px solid #1e3a5f;border-radius:4px;` +
        `padding:3px 10px;color:#93c5fd;font-size:11px">Duration: ${phase.duration}</span>`
      : '') +
    (cardHtml ? `<div style="margin-top:16px">${cardHtml}</div>` : '') +
    `</div>`;
}

// ─── Public: buildSlides ─────────────────────────────────────────────────────

/**
 * Build array of slide objects from graph.story.
 * Each object: { type, html, phaseRef? }
 */
export function buildSlides(graph) {
  const story     = graph.story;
  const kpis      = story.kpis || [];
  const ideaCards = story.ideaCards || [];
  const slides    = [];

  // Problem slide
  if (story.problem) {
    slides.push({
      type: 'problem',
      html: buildProblemSlideHtml(story.problem, kpis),
      scope: story.problem.scope || [],
    });
  }

  // Vision slide
  if (story.vision) {
    slides.push({
      type: 'vision',
      html: buildVisionSlideHtml(story.vision, kpis),
      scope: [],
    });
  }

  // Phase slides
  (story.phases || []).forEach((phase, i) => {
    slides.push({
      type:     'phase',
      html:     buildPhaseSlideHtml(phase, i, ideaCards, kpis),
      phaseRef: phase.phaseRef,
      scope:    [],
    });
  });

  return slides;
}

// ─── Sidebar rendering ───────────────────────────────────────────────────────

/**
 * Compute accumulated KPI deltas up to (and including) the given slide index.
 * Deltas come from ideaCards whose phase slide has been reached.
 */
function computeAccumulatedDeltas(graph, upToIndex) {
  const story     = graph.story;
  const kpis      = story.kpis || [];
  const ideaCards = story.ideaCards || [];
  const slides    = state.slides;

  // Start from baseline
  const totals = {};
  kpis.forEach(k => { totals[k.id] = 0; });

  for (let i = 0; i <= upToIndex; i++) {
    const slide = slides[i];
    if (!slide || slide.type !== 'phase') continue;
    const cards = ideaCards.filter(c => (c.phases || []).includes(slide.phaseRef));
    cards.forEach(card => {
      (card.expectedKpiImpacts || []).forEach(imp => {
        if (totals[imp.kpiId] !== undefined) {
          totals[imp.kpiId] += imp.delta;
        } else {
          totals[imp.kpiId] = imp.delta;
        }
      });
    });
  }

  return totals;
}

/** Render the KPI tracker sidebar section */
function renderSidebar(graph, slideIndex) {
  if (!dom.narrativeSidebar) return;

  const story   = graph.story;
  const kpis    = story.kpis || [];
  const deltas  = computeAccumulatedDeltas(graph, slideIndex);
  const slide   = state.slides[slideIndex];

  // KPI tracker
  let kpiHtml = `<div style="color:#9ca3af;font-size:10px;letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">KPI Tracker</div>`;

  kpis.forEach(kpi => {
    const accumulated = deltas[kpi.id] || 0;
    const current     = kpi.baseline + accumulated;
    const direction   = kpi.direction === 'lower_is_better' ? -1 : 1;
    const improved    = accumulated !== 0 && (accumulated * direction < 0);
    const color       = improved ? '#22c55e' : accumulated !== 0 ? '#ef4444' : '#9ca3af';
    const unit        = kpi.unit || '';

    // Progress bar: show improvement ratio vs baseline (lower_is_better → bar shrinks)
    const ratio = kpi.baseline !== 0 ? Math.max(0, Math.min(1, current / kpi.baseline)) : 1;
    const barPct = kpi.direction === 'lower_is_better'
      ? Math.round(ratio * 100)
      : Math.round((1 - ratio) * 100);

    kpiHtml += `<div style="margin-bottom:12px">` +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">` +
      `<span style="color:#d1d5db;font-size:11px">${kpi.label}</span>` +
      `<span style="color:${color};font-size:13px;font-weight:700">${current}${unit}</span>` +
      `</div>` +
      `<div style="background:#1f2937;border-radius:3px;height:4px;overflow:hidden">` +
      `<div style="background:${color};height:100%;width:${barPct}%;transition:width 0.4s ease"></div>` +
      `</div>` +
      `<div style="display:flex;justify-content:space-between;margin-top:2px">` +
      `<span style="color:#4b5563;font-size:9px">baseline ${kpi.baseline}${unit}</span>` +
      (accumulated !== 0
        ? `<span style="color:${color};font-size:9px">${fmtDelta(accumulated)}${unit}</span>`
        : '') +
      `</div>` +
      `</div>`;
  });

  // Idea card hypotheses for phase slides
  let ideaHtml = '';
  if (slide && slide.type === 'phase' && slide.phaseRef) {
    const ideaCards = (story.ideaCards || []).filter(c =>
      (c.phases || []).includes(slide.phaseRef)
    );
    if (ideaCards.length > 0) {
      ideaHtml = `<div style="border-top:1px solid #1f2937;padding-top:12px">` +
        `<div style="color:#9ca3af;font-size:10px;letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">Ideas This Phase</div>`;
      ideaCards.forEach(card => {
        ideaHtml += `<div style="margin-bottom:10px">` +
          `<div style="color:#60a5fa;font-size:11px;font-weight:600;margin-bottom:4px">${card.title}</div>` +
          `<div style="color:#9ca3af;font-size:10px;line-height:1.5">${card.hypothesis}</div>` +
          `</div>`;
      });
      ideaHtml += `</div>`;
    }
  }

  // Write KPI content into #narrative-kpi-hud if present, otherwise fall back to sidebar
  if (dom.narrativeKpiHud) {
    dom.narrativeKpiHud.innerHTML = `<div style="padding:4px 0">${kpiHtml}</div>`;
    if (dom.narrativeBenefits) {
      dom.narrativeBenefits.innerHTML = ideaHtml;
    }
  } else {
    dom.narrativeSidebar.innerHTML =
      `<div style="padding:4px 0">${kpiHtml}</div>` + ideaHtml;
  }
}

// ─── SVG scope highlighting ──────────────────────────────────────────────────

/** Remove story-scope class from all SVG node groups */
function clearScopeHighlights() {
  if (!dom.nodesLayer) return;
  dom.nodesLayer.querySelectorAll('.story-scope').forEach(el => {
    el.classList.remove('story-scope');
  });
}

/** Add story-scope class to node groups whose data-id matches scope list */
function highlightScope(scopeIds) {
  clearScopeHighlights();
  if (!dom.nodesLayer || !scopeIds || scopeIds.length === 0) return;
  scopeIds.forEach(nodeId => {
    const el = dom.nodesLayer.querySelector(`[data-id="${nodeId}"]`);
    if (el) el.classList.add('story-scope');
  });
}

// ─── Public: renderSlide ─────────────────────────────────────────────────────

/**
 * Render slide at the given index.
 * Updates state.slideIndex, slide container HTML, dot highlights, sidebar, and SVG scope.
 */
export function renderSlide(index) {
  if (!state.slides.length) return;

  const clampedIndex = Math.max(0, Math.min(index, state.slides.length - 1));
  state.slideIndex   = clampedIndex;
  const slide        = state.slides[clampedIndex];

  // Render slide HTML
  if (dom.slideContainer) {
    dom.slideContainer.innerHTML = slide.html;
    // Allow innerHTML on description fields (already embedded in slide.html)
  }

  // Update dot highlights
  if (dom.slideNavDots) {
    dom.slideNavDots.querySelectorAll('.slide-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === clampedIndex);
    });
  }

  // Sidebar
  if (state.graph && state.graph.story) {
    renderSidebar(state.graph, clampedIndex);
  }

  // SVG scope highlight
  highlightScope(slide.scope || []);
}

// ─── Keyboard handler ────────────────────────────────────────────────────────

function handleNarrativeKey(e) {
  // Only handle when narrative view is visible
  if (!dom.narrativeView || dom.narrativeView.style.display === 'none') return;

  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault();
    renderSlide(state.slideIndex + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    renderSlide(state.slideIndex - 1);
  } else if (e.key === 'Escape') {
    hideNarrative();
  }
}

// ─── Show / hide helpers ─────────────────────────────────────────────────────

function showNarrative() {
  if (dom.narrativeView) dom.narrativeView.style.display = '';
  if (dom.btnBackToStory) dom.btnBackToStory.style.display = '';
  state.storyMode = true;
}

function hideNarrative() {
  if (dom.narrativeView) dom.narrativeView.style.display = 'none';
  if (dom.btnBackToStory) dom.btnBackToStory.style.display = 'none';
  state.storyMode = false;
  clearScopeHighlights();
}

// ─── Font scale ──────────────────────────────────────────────────────────────

function applyFontScale() {
  document.documentElement.style.setProperty('--narrative-font-scale', state.fontScale);
  if (dom.narrativeMain) {
    dom.narrativeMain.style.fontSize = `${state.fontScale}em`;
  }
}

// ─── Public: initNarrative ───────────────────────────────────────────────────

/**
 * Initialise narrative / story mode for the given graph.
 *
 * @param {object}  graph      - Parsed diagram JSON
 * @param {boolean} autoOpen   - If true, immediately show slide 0
 */
export function initNarrative(graph, autoOpen = false) {
  if (!graph || !graph.story) return;

  // Build slides
  state.slides    = buildSlides(graph);
  state.slideIndex = 0;

  // Show the story button
  if (dom.btnStory) dom.btnStory.style.display = '';

  // Build dot navigation
  if (dom.slideNavDots) {
    dom.slideNavDots.innerHTML = '';
    state.slides.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'slide-dot';
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => renderSlide(i));
      dom.slideNavDots.appendChild(dot);
    });
  }

  // Wire #btn-story
  if (dom.btnStory) {
    // Clone to remove any prior listeners
    const fresh = dom.btnStory.cloneNode(true);
    dom.btnStory.replaceWith(fresh);
    dom.btnStory = fresh; // update cached ref
    fresh.addEventListener('click', () => {
      showNarrative();
      renderSlide(state.slideIndex);
    });
  }

  // Wire #btn-back-to-story
  if (dom.btnBackToStory) {
    const fresh = dom.btnBackToStory.cloneNode(true);
    dom.btnBackToStory.replaceWith(fresh);
    dom.btnBackToStory = fresh;
    fresh.addEventListener('click', () => hideNarrative());
  }

  // Keyboard navigation — attach once (guard with a flag on the document)
  if (!document._narrativeKeyBound) {
    document.addEventListener('keydown', handleNarrativeKey);
    document._narrativeKeyBound = true;
  }

  // Font-size controls (narrative-specific buttons inside #narrative-main)
  if (dom.btnNarrativeFontSmaller) {
    const fresh = dom.btnNarrativeFontSmaller.cloneNode(true);
    dom.btnNarrativeFontSmaller.replaceWith(fresh);
    dom.btnNarrativeFontSmaller = fresh;
    fresh.addEventListener('click', () => {
      state.fontScale = Math.max(0.7, parseFloat((state.fontScale - 0.1).toFixed(1)));
      applyFontScale();
    });
  }

  if (dom.btnNarrativeFontLarger) {
    const fresh = dom.btnNarrativeFontLarger.cloneNode(true);
    dom.btnNarrativeFontLarger.replaceWith(fresh);
    dom.btnNarrativeFontLarger = fresh;
    fresh.addEventListener('click', () => {
      state.fontScale = Math.min(1.6, parseFloat((state.fontScale + 0.1).toFixed(1)));
      applyFontScale();
    });
  }

  // Apply current font scale
  applyFontScale();

  // Auto-open if requested
  if (autoOpen) {
    showNarrative();
    renderSlide(0);
  }
}
