# Agent A — Foundation
## Skeleton · State · CSS Architecture · Data Model · Demo JSON

**Depends on:** Nothing (first agent)
**Blocks:** All other agents
**Estimated output:** ~800 lines across 8 files

---

## Deliverables

| File | Lines est. | Purpose |
|---|---|---|
| `index.html` | 120 | App shell, CDN scripts, module imports, DOM layout |
| `js/state.js` | 60 | Global state singleton + DOM refs |
| `js/constants.js` | 80 | BPMN SVG icons, color maps, default JSON template |
| `js/data.js` | 100 | JSON parse, strip comments, validate, normalize |
| `js/main.js` | 60 | Entry point, init sequence, event wiring stubs |
| `css/core.css` | 150 | Layout, header, theme vars, dark/light mode |
| `css/diagram.css` | 50 | SVG canvas background, grid pattern, lane stubs |
| `sample/order-approval.json` | 120 | Canonical demo with all node types, both phases |

---

## `index.html` Structure

```html
<!DOCTYPE html>
<html>
<head>
  <!-- CDN: html2canvas 1.4.1, jsPDF 2.5.1 -->
  <!-- Local CSS: core, diagram, diff, animation, panels, narrative, widgets -->
</head>
<body class="dark-theme">

  <!-- HEADER ─────────────────────────────────────────────────── -->
  <header id="header">
    <!-- Left group -->
    <div class="controls-left">
      <span class="brand">⬡ PROCESS GRAPH</span>
      <div class="divider"/>
      <select id="json-selector">...</select>
      <div class="divider"/>
      <!-- View mode buttons: Before | Split | After | Overlay -->
      <div id="view-mode-group">
        <button id="btn-before" class="view-btn active">Before</button>
        <button id="btn-split"  class="view-btn">Split</button>
        <button id="btn-after"  class="view-btn">After</button>
        <button id="btn-overlay" class="view-btn">Overlay</button>
      </div>
      <div class="divider"/>
      <!-- Phase dots (rendered by renderer.js) -->
      <div id="phase-dots"></div>
      <!-- Flow dropdown -->
      <select id="flow-selector" style="display:none"></select>
    </div>

    <!-- Right group -->
    <div class="controls-right">
      <!-- Simulate controls -->
      <button id="btn-play">▶ Simulate</button>
      <button id="btn-next" disabled>›</button>
      <button id="btn-ff"  disabled>»</button>
      <div class="divider"/>
      <!-- Story mode -->
      <button id="btn-story" style="display:none">📖 Story</button>
      <div class="divider"/>
      <!-- Options dropdown -->
      <div class="dropdown" id="options-dropdown">
        <button id="btn-options">⚙ Options ▾</button>
        <div class="dropdown-menu" id="options-menu">
          <label><input type="checkbox" id="chk-edit-mode"> Edit Mode</label>
          <label><input type="checkbox" id="chk-show-editor"> JSON Editor</label>
          <label><input type="checkbox" id="chk-show-notes"> Notes</label>
          <label><input type="checkbox" id="chk-show-metrics"> Metrics Panel</label>
          <label><input type="checkbox" id="chk-show-kpis"> KPI HUD</label>
          <label><input type="checkbox" id="chk-show-benefits"> Benefits</label>
          <hr>
          <label><input type="checkbox" id="chk-sequence-view"> Sequence View</label>
          <hr>
          <button id="btn-upload-json">📀 Upload JSON</button>
          <button id="btn-download-json">📥 Download JSON</button>
          <button id="btn-export-pdf">📄 Export PDF</button>
          <button id="btn-export-svg">🖼 Export SVG</button>
          <hr>
          <label><input type="checkbox" id="chk-pause-step"> Pause / Step</label>
          <label>Delay: <input type="range" id="delay-slider" min="0.3" max="3" step="0.1" value="1"></label>
          <hr>
          <label><input type="checkbox" id="chk-light-mode"> ☀ Light Theme</label>
        </div>
      </div>
    </div>
  </header>

  <!-- MAIN LAYOUT ─────────────────────────────────────────────── -->
  <div id="app-body">

    <!-- LEFT: JSON Editor (hidden by default) -->
    <aside id="editor-pane" style="display:none">
      <div id="editor-toolbar">
        <button id="btn-update">Update Diagram</button>
        <span id="editor-error"></span>
      </div>
      <textarea id="json-editor" spellcheck="false"></textarea>
    </aside>

    <!-- CENTER: Diagram + Sequence (stacked, only one visible) -->
    <main id="stage">
      <!-- SVG canvas (spatial diagram) -->
      <div id="svg-container">
        <svg id="diagram-svg" xmlns="http://www.w3.org/2000/svg">
          <defs id="svg-defs"><!-- filters, gradients, patterns injected here --></defs>
          <g id="background-layer"></g>
          <g id="lanes-layer"></g>
          <g id="connections-layer"></g>
          <g id="nodes-layer"></g>
          <g id="annotations-layer"></g>
          <g id="overlays-layer"></g>  <!-- diff labels, NEW/REMOVED chips -->
          <g id="token-layer"></g>     <!-- animation token -->
        </svg>
      </div>

      <!-- Sequence view (hidden by default) -->
      <div id="sequence-container" style="display:none">
        <svg id="sequence-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>

      <!-- KPI HUD (top-right corner, story mode) -->
      <div id="kpi-hud" style="display:none"></div>

      <!-- Benefits panel (floating right) -->
      <div id="benefits-panel" style="display:none"></div>

      <!-- Notebook widget (floating top-right) -->
      <div id="notebook" style="display:none">
        <div class="notebook-header">Notes</div>
        <pre id="notebook-text"></pre>
      </div>
    </main>

    <!-- RIGHT: Narrative (story mode overlay, hidden) -->
    <div id="narrative-view" style="display:none">...</div>

  </div>

  <!-- LOG PANE ────────────────────────────────────────────────── -->
  <div id="pane-resizer"></div>
  <div id="log-pane">
    <div id="log-entries"><div class="log-ready">Ready...</div></div>
  </div>

  <!-- MODALS ─────────────────────────────────────────────────── -->
  <div id="modal-export-pdf" class="modal" style="display:none">...</div>

  <!-- Hidden file input -->
  <input type="file" id="file-input" accept=".json" style="display:none">

  <!-- JS modules -->
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

---

## `state.js` — Global State

```js
export const state = {
  // Data
  graph: null,           // Parsed JSON object
  viewMode: 'split',     // 'before' | 'after' | 'split' | 'overlay'
  selectedPhase: null,   // Phase ID string or null
  selectedFlowId: null,  // Flow ID string or null
  activeSequence: [],    // Resolved animation steps array

  // Edit
  isEditing: false,
  undoStack: [],         // [{graph snapshot}] — single-level undo

  // Animation
  isPlaying: false,
  isPaused: false,
  stepIndex: 0,
  animTimer: null,
  stepDelay: 1000,       // ms between steps

  // Story
  storyMode: false,
  slideIndex: 0,
  slides: [],

  // UI
  logHeight: 160,        // Log pane height px
  fontScale: 1.0,        // Narrative font scale multiplier
};

export const dom = {};   // Populated by initDom()

export function initDom() {
  const ids = [
    'header', 'editor-pane', 'json-editor', 'editor-error',
    'btn-update', 'btn-play', 'btn-next', 'btn-ff', 'btn-story',
    'btn-options', 'options-menu', 'btn-before', 'btn-split',
    'btn-after', 'btn-overlay', 'view-mode-group',
    'phase-dots', 'flow-selector', 'json-selector',
    'svg-container', 'diagram-svg', 'svg-defs',
    'background-layer', 'lanes-layer', 'connections-layer',
    'nodes-layer', 'annotations-layer', 'overlays-layer', 'token-layer',
    'sequence-container', 'sequence-svg',
    'kpi-hud', 'benefits-panel', 'notebook', 'notebook-text',
    'narrative-view', 'log-pane', 'log-entries', 'pane-resizer',
    'modal-export-pdf', 'file-input',
    'chk-edit-mode', 'chk-show-editor', 'chk-show-notes',
    'chk-show-metrics', 'chk-show-kpis', 'chk-show-benefits',
    'chk-sequence-view', 'chk-pause-step', 'chk-light-mode',
    'delay-slider', 'btn-upload-json', 'btn-download-json',
    'btn-export-pdf', 'btn-export-svg',
  ];
  ids.forEach(id => { dom[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id); });
}
```

---

## `constants.js` — BPMN Icons & Color Maps

```js
// BPMN node type SVG path data (simple, suitable for 28×28 viewport)
export const BPMN_ICONS = {
  'task': '',                  // No icon — tasks use text label only
  'subprocess': `<path ...>`, // [+] symbol
  'gateway': '',               // Diamond — no icon, shape IS the meaning
  'start-event': '',           // Circle — no icon
  'end-event': '',             // Circle — no icon
  'annotation': `<path ...>`, // Note curl symbol
  'intermediate-event': '',    // Double-ring circle
};

// State badge icons (overlaid on node)
export const STATE_ICONS = {
  'bottleneck': `<text>⚠</text>`,
  'automated':  `<text>⚡</text>`,
  'new':        null,  // Uses NEW chip overlay
};

// Diff state colors
export const DIFF_COLORS = {
  added:     { fill: 'rgba(34,197,94,0.12)',  stroke: '#22c55e' },
  removed:   { fill: 'rgba(239,68,68,0.12)',  stroke: '#ef4444' },
  changed:   { fill: 'rgba(245,158,11,0.12)', stroke: '#f59e0b' },
  unchanged: { fill: null, stroke: null },  // use lane default
};

// Lane gradient stop colors (default palette — overridden by lane.color)
export const LANE_COLORS = [
  '#1e3a5f', '#1a3a2a', '#3a1a3a', '#2a2a1a',
  '#1a2a3a', '#3a2a1a', '#1a3a3a', '#3a1a1a',
];

export const DEFAULT_JSON = `{ ... demo JSON ... }`;
```

---

## `data.js` — Parse & Validate

```js
export function parseGraph(jsonString) {
  const cleaned = stripComments(jsonString);
  const normalized = normalizeMultilineStrings(cleaned);
  const graph = JSON.parse(normalized);
  validateGraph(graph);
  return graph;
}

function validateGraph(graph) {
  if (!graph.lanes?.length)  throw new Error('lanes array required');
  if (!graph.nodes?.length)  throw new Error('nodes array required');
  const laneIds = new Set(graph.lanes.map(l => l.id));
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  graph.nodes.forEach(n => {
    if (!laneIds.has(n.lane)) throw new Error(`Node "${n.id}" references unknown lane "${n.lane}"`);
  });
  graph.connections?.forEach(c => {
    if (!nodeIds.has(c.from)) throw new Error(`Connection "${c.id}" from unknown node "${c.from}"`);
    if (!nodeIds.has(c.to))   throw new Error(`Connection "${c.id}" to unknown node "${c.to}"`);
  });
}

// Phase visibility (same logic as archviz core-data.js)
export function isVisible(item, viewMode, selectedPhase) { ... }

// Strip JS-style comments from JSON strings
function stripComments(str) { ... }
function normalizeMultilineStrings(str) { ... }
```

---

## `css/core.css` — Theme Variables

```css
:root {
  /* Background */
  --bg-main:      #0f1117;
  --bg-surface:   #161b27;
  --bg-panel:     #0d1120;
  --bg-elevated:  #1e2535;

  /* Borders */
  --border-dim:   #1e2535;
  --border-mid:   #2a3550;
  --border-hi:    #334155;

  /* Text */
  --text-main:    #e2e8f0;
  --text-mid:     #94a3b8;
  --text-dim:     #64748b;

  /* Accent */
  --accent:       #3b82f6;
  --accent-green: #22c55e;
  --accent-red:   #ef4444;
  --accent-amber: #f59e0b;

  /* Header */
  --header-h:     48px;

  /* Lane label column */
  --label-col-w:  44px;

  /* Log pane */
  --log-h:        160px;

  /* Font */
  --font-ui:      'Segoe UI', system-ui, sans-serif;
  --font-mono:    'Consolas', 'Fira Code', monospace;
}

body.light-theme {
  --bg-main:    #f0f4f8;
  --bg-surface: #ffffff;
  --bg-panel:   #e8edf4;
  --text-main:  #1e293b;
  --text-mid:   #475569;
  --text-dim:   #94a3b8;
  --border-dim: #cbd5e1;
  --border-mid: #94a3b8;
}
```

---

## `sample/order-approval.json` — Canonical Demo

Must include:
- 4 lanes (Requester, Manager, Finance, System)
- All 7 node types demonstrated
- Both `before` and `after` nodes to enable diff view
- 2 flows (happy path + exception)
- 3 phases
- Cross-lane message flow connections (dashed)
- At least one loop-back connection
- `metrics` block with before/after KPIs
- `story` block (Problem → Vision → 3 phases)
- `notes` field

See `plans/data-model.md` for the full annotated schema.

---

## Acceptance Criteria

- [ ] `index.html` opens in browser without JS errors
- [ ] All DOM elements referenced in `state.js initDom()` exist in HTML
- [ ] `data.js parseGraph()` correctly parses the demo JSON and throws on invalid input
- [ ] CSS variables apply and header renders correctly in dark theme
- [ ] `chk-light-mode` toggle switches body class and CSS variables apply
- [ ] SVG canvas renders (empty) with grid dot pattern background
- [ ] Lane bands render with correct gradient fills from `lanes` array
