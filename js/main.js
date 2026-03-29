/**
 * main.js — Entry point. Imports all modules, wires init sequence.
 * Stubs are used for modules not yet implemented (CH1+).
 */

import { state, dom, initDom } from './state.js';
import { parseGraph, resolveActiveSequence } from './data.js';
import { normalizePhases, isVisibleAtPhase, getDiffStatus } from './phase.js';
import { DEFAULT_JSON } from './constants.js';

// ── Lazy imports (stubbed until implemented) ───────────────────
let renderAll        = () => {};
let initInteractions = () => {};
let initFileOps      = () => {};
let initAnimation    = () => {};
let initNarrative    = () => {};
let initDiff         = () => {};
let initSequenceView = () => {};
let initMetrics      = () => {};
let initBenefits     = () => {};
let initExport       = () => {};
let renderMinimap    = () => {};
let initMinimap      = () => {};
let onPostRender     = () => {};
let initComments     = () => {};

// Attempt to load real modules if they exist
async function loadModules() {
  try {
    const r = await import('./renderer.js');
    renderAll = r.renderAll;
    onPostRender = r.onPostRender || (() => {});
  } catch { /* not yet implemented */ }

  try {
    const d = await import('./diff.js');
    initDiff = d.initDiff;
  } catch { /* not yet implemented */ }

  try {
    const s = await import('./sequence-view.js');
    initSequenceView = s.initSequenceView;
  } catch { /* not yet implemented */ }

  try {
    const i = await import('./interactions.js');
    initInteractions = i.initInteractions;
  } catch { /* not yet implemented */ }

  try {
    const f = await import('./file-ops.js');
    initFileOps = f.initFileOps;
  } catch { /* not yet implemented */ }

  try {
    const a = await import('./animation.js');
    initAnimation = a.initAnimation;
  } catch { /* not yet implemented */ }

  try {
    const n = await import('./narrative.js');
    initNarrative = n.initNarrative;
  } catch { /* not yet implemented */ }

  try {
    const m = await import('./metrics.js');
    initMetrics = m.initMetrics;
  } catch { /* not yet implemented */ }

  try {
    const b = await import('./benefits.js');
    initBenefits = b.initBenefits;
  } catch { /* not yet implemented */ }

  try {
    const e = await import('./export.js');
    initExport = e.initExport;
  } catch { /* not yet implemented */ }

  try {
    const mm = await import('./minimap.js');
    renderMinimap = mm.renderMinimap;
    initMinimap   = mm.initMinimap;
  } catch { /* not yet implemented */ }

  try {
    const cm = await import('./comments.js');
    initComments = cm.initComments;
  } catch { /* not yet implemented */ }

}

// ── Diagram discovery ──────────────────────────────────────────
async function discoverDiagrams() {
  const fallback = [
    { file: 'car-loan.json', label: 'Auto Loan Application' },
  ];

  let diagrams = fallback;

  // Try backend API first
  try {
    const res = await fetch('/api/diagrams');
    if (res.ok) diagrams = await res.json();
  } catch { /* no backend — use fallback list */ }

  // Populate dropdown
  const sel = dom.jsonSelector;
  if (!sel) return;

  diagrams.forEach(({ file, label }) => {
    const opt = document.createElement('option');
    opt.value = file;
    opt.textContent = label || file;
    sel.appendChild(opt);
  });

  // Wire change handler
  sel.addEventListener('change', () => loadDiagramFile(sel.value));

  // Auto-load first diagram on startup
  if (diagrams.length > 0) {
    sel.value = diagrams[0].file;
    await loadDiagramFile(diagrams[0].file);
  }
}

// ── Load diagram ───────────────────────────────────────────────
export async function loadDiagramFile(filename) {
  try {
    const res = await fetch(`sample/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const graph = parseGraph(text);
    state.graph = graph;
    state.activeSequence = resolveActiveSequence(graph, null, null);

    // ── Initialize multi-phase state ───────────────────────────────────────
    const phases = normalizePhases(graph);
    if (phases.length > 2) {
      // Multi-phase graph: reset phase index to baseline (0)
      state.currentPhaseIndex = 0;
    } else {
      // Legacy two-phase graph: keep currentPhaseIndex at 0 (maps to "before")
      state.currentPhaseIndex = 0;
    }

    if (dom.jsonEditor) dom.jsonEditor.value = JSON.stringify(graph, null, 2);
    renderAll(graph);
    initDiff(graph);
    initSequenceView(graph);
    if (graph.story) {
      initNarrative(graph);
    } else {
      // Hide story button when the loaded diagram has no story
      if (dom.btnStory) dom.btnStory.style.display = 'none';
    }
  } catch (err) {
    console.error('[main] Failed to load diagram:', err);
    // Fall back to DEFAULT_JSON
    try {
      const graph = parseGraph(DEFAULT_JSON);
      state.graph = graph;
      renderAll(graph);
    } catch (e2) {
      console.error('[main] Default JSON also failed:', e2);
    }
  }
}

// ── URL params ─────────────────────────────────────────────────
function applyUrlParams() {
  const params = new URLSearchParams(location.search);

  const processFile = params.get('process');
  const viewMode    = params.get('view');
  const storyParam  = params.get('story');

  if (viewMode && ['before','split','after','overlay'].includes(viewMode)) {
    state.viewMode = viewMode;
  }

  return { processFile, storyParam };
}

// ── Init ───────────────────────────────────────────────────────
async function init() {
  initDom();
  await loadModules();

  const { processFile, storyParam } = applyUrlParams();

  await discoverDiagrams();

  // If a URL param specifies a process, load it (overrides auto-load from discoverDiagrams)
  if (processFile) {
    if (dom.jsonSelector) dom.jsonSelector.value = processFile;
    await loadDiagramFile(processFile);
  }

  // Post-load hooks
  initInteractions();
  initFileOps();
  initAnimation();
  initSequenceView(state.graph);
  initMetrics(state.graph);
  initBenefits(state.graph);
  initExport();
  initMinimap();
  initComments();

  // Wire minimap rendering into the post-render cycle
  onPostRender(() => renderMinimap());

  if (storyParam === 'true' && state.graph?.story) {
    setTimeout(() => initNarrative(state.graph, true), 400);
  }

  // Set active view-mode button
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.viewMode);
  });

  // Wire zoom preset buttons
  document.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.zoomPreset = btn.dataset.zoom;
      // Reset zoom/pan when switching presets
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.graph) renderAll(state.graph);
      // Clear CSS transform (preset mode uses viewBox sizing, not transform)
      const svg = dom.diagramSvg;
      if (svg) {
        svg.style.transform = '';
        svg.style.transformOrigin = '';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
