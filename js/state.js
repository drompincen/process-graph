/**
 * state.js — Global singleton state + DOM ref cache
 * All modules import { state, dom } from './state.js'
 */

export const state = {
  // ── Data ────────────────────────────────────────────────────
  graph: null,            // Parsed JSON object (current diagram)
  layout: null,           // Computed layout object from layout.js

  // ── View ────────────────────────────────────────────────────
  viewMode: 'split',      // 'before' | 'after' | 'split' | 'overlay'
  selectedPhase: null,    // Phase ID string or null (all phases) — DEPRECATED: use currentPhaseIndex for N-phase model
  currentPhaseIndex: 0,   // Active phase slider position (0-based index into graph.phases[])
  diffMode: false,        // Whether diff highlighting is enabled (shows added/removed between adjacent phases)
  selectedFlowId: null,   // Flow ID string or null (default sequence)
  activeSequence: [],     // Resolved animation steps array

  // ── Edit ────────────────────────────────────────────────────
  isEditing: false,
  undoStack: [],          // Array of JSON snapshot strings (single-level)
  redoStack: [],          // Array of JSON snapshot strings for redo
  selectedNodes: new Set(), // Set of selected node IDs (multi-select)
  selectedConnection: null, // ID of the currently selected connection (string or null)

  // ── Animation ───────────────────────────────────────────────
  isPlaying: false,
  isPaused: false,
  stepIndex: 0,
  animTimer: null,
  stepDelay: 1000,        // ms between steps
  pauseEachStep: false,

  // ── Story / Narrative ───────────────────────────────────────
  storyMode: false,
  slideIndex: 0,
  slides: [],
  accumulatedDeltas: {},  // { kpiId: number } running total per slide

  // ── Process Groups ─────────────────────────────────────────
  expandedGroups: new Set(),  // Set of group node IDs that are expanded

  // ── Arrow & Connection options ───────────────────────────────
  arrowStyle: 'orthogonal',  // 'orthogonal' | 'curved'
  flowAnimation: false,      // When true, animated dashed flow on connections

  // ── Config ────────────────────────────────────────────────────
  config: {
    allowDecisionToDecision: false,  // When true, gateway→gateway connections are allowed
  },

  // ── Comments & KPI ────────────────────────────────────────
  showComments: true,     // Show comment badges on nodes
  showKPIOverlay: false,  // Show KPI overlay pills below nodes

  // ── UI ──────────────────────────────────────────────────────
  logHeight: 160,         // Log pane height px
  fontScale: 1.0,         // Narrative font scale multiplier (0.7–1.6)
  zoomPreset: 'fit',      // 'fit' | '1080p' | '4k'

  // ── Zoom & Pan ────────────────────────────────────────────
  zoom: 1,                // Current zoom level (0.2 – 3.0)
  panX: 0,                // Horizontal pan offset (px, screen-space)
  panY: 0,                // Vertical pan offset (px, screen-space)
};

/** Cached DOM element references — populated by initDom() */
export const dom = {};

/** Populate dom{} from the live document. Call once after DOMContentLoaded. */
export function initDom() {
  const ids = [
    // Header controls
    'header',
    'json-selector',
    'view-mode-group',
    'btn-before', 'btn-split', 'btn-after', 'btn-overlay',
    'phase-dots',
    'phase-nav', 'phase-slider', 'phase-slider-container',
    'phase-dots-track', 'phase-current-label', 'btn-diff',
    'flow-selector',
    'btn-play', 'btn-play-flow', 'btn-next', 'btn-ff', 'btn-ff-flow', 'btn-rewind',
    'btn-story',
    'btn-options', 'options-menu',

    // Options checkboxes + inputs
    'chk-edit-mode', 'chk-show-editor', 'chk-show-notes',
    'chk-show-metrics', 'chk-show-kpis', 'chk-show-benefits',
    'chk-sequence-view', 'chk-pause-step', 'chk-light-mode',
    'delay-slider', 'delay-label',
    'btn-font-down', 'btn-font-up',

    // File operations
    'btn-upload-json', 'btn-download-json',
    'btn-export-svg', 'btn-export-png', 'btn-export-pdf',
    'file-input',

    // Editor pane
    'editor-pane', 'editor-toolbar', 'btn-update', 'editor-error', 'json-editor',

    // Stage + SVG layers
    'stage', 'svg-container', 'diagram-svg', 'svg-defs',
    'background-layer', 'lanes-layer', 'connections-layer',
    'nodes-layer', 'annotations-layer', 'overlays-layer', 'token-layer',

    // Sequence view
    'sequence-container', 'sequence-svg',

    // Floating widgets
    'kpi-hud', 'metrics-panel', 'benefits-panel',
    'notebook', 'notebook-text',

    // Narrative
    'narrative-view', 'narrative-main', 'slide-container',
    'slide-nav-dots', 'narrative-sidebar',
    'narrative-benefits', 'narrative-kpi-hud',
    'btn-back-to-story',
    'btn-narrative-font-smaller', 'btn-narrative-font-larger',

    // Zoom presets
    'zoom-group', 'btn-zoom-fit', 'btn-zoom-hd', 'btn-zoom-4k',

    // Log pane
    'log-pane', 'log-entries', 'pane-resizer',

    // Modal
    'modal-export-pdf', 'btn-pdf-cancel', 'btn-pdf-confirm',

    // Node palette
    'node-palette', 'btn-toggle-palette',

    // Property panel
    'property-panel', 'prop-panel-close', 'prop-fields',

    // Context menu
    'context-menu',

    // Auto-layout
    'btn-auto-layout',

    // KPI overlay
    'btn-kpi-overlay',

    // Minimap
    'minimap', 'minimap-canvas', 'zoom-pct-label',

    // Version panel
    'btn-versions', 'version-panel', 'btn-save-version',
    'version-name-input', 'version-list',

    // Time / Agent simulation
    'btn-time-sim', 'btn-agent-sim',
    'sim-clock', 'sim-speed-group',
    'sim-overlay',

    // Arrow style & flow animation
    'radio-arrow-orthogonal', 'radio-arrow-curved',
    'chk-flow-animation',
  ];

  ids.forEach(id => {
    // Convert kebab-case to camelCase for property key
    const key = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const el = document.getElementById(id);
    if (!el) console.warn(`[state] DOM element not found: #${id}`);
    dom[key] = el;
  });
}
