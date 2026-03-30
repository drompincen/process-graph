# Agents D1, D2, D3 — Interactivity
## Process Simulation · Edit Mode · JSON Editor & File Ops

**Depends on:** Agents A + B (foundation + rendering complete)
**D1, D2, D3 run in parallel**
**All three block:** Agent F (Export + Polish)

---

## Agent D1 — Process Simulation (Animation Engine)
**Files:** `js/animation.js` + `css/animation.css`

### Overview

Adapted from archviz `animation.js`. Animates a "token" (process instance)
travelling through the sequence steps. Key differences from archviz:
- Token travels along orthogonal paths (matches routing engine paths)
- Token is an SVG circle in `#token-layer`, not a div
- Step badges appear on SVG nodes (in `#overlays-layer`), not div nodes
- Log pane is below the SVG canvas (same as archviz)

### Controls

| Button | Action |
|---|---|
| ▶ Simulate | Start or resume animation |
| ‹ Pause | Pause mid-step |
| › Next | Advance one step (pause mode) |
| » FF | Skip to end, show all badges |
| Replay | Reset to beginning |

Header state transitions:
```
Initial:  [▶ Simulate] [›] [»]  — › and » disabled
Playing:  [‖ Pause]    [›] [»]  — › disabled
Paused:   [▶ Resume]   [›] [»]  — all enabled
Done:     [↺ Replay]   [›] [»]  — › disabled
```

### Token animation

The token is an SVG `<circle r="7">` with a pulsing glow filter.
It moves along the orthogonal path of the current step's connection.

```js
async function animateToken(conn, layout, onDone) {
  const path = computeOrthogonalPath(conn, layout);
  // Parse waypoints from pathD (M x,y L x,y L x,y ...)
  const waypoints = parsePathWaypoints(path.pathD);

  // Move token through each waypoint in sequence
  for (let i = 0; i < waypoints.length; i++) {
    const [wx, wy] = waypoints[i];
    dom.tokenCircle.setAttribute('cx', wx);
    dom.tokenCircle.setAttribute('cy', wy);
    await sleep(state.stepDelay / waypoints.length);
  }
  onDone();
}
```

Token SVG (injected into `#token-layer`):
```xml
<defs>
  <filter id="token-glow">
    <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#60a5fa" flood-opacity="0.8"/>
  </filter>
</defs>
<circle id="token-circle" r="7" fill="#60a5fa" filter="url(#token-glow)"
        cx="-100" cy="-100" style="display:none"/>
```

### Step badges (on SVG nodes)

When a step completes, append a numbered badge overlay:
```xml
<!-- Badge group appended to #overlays-layer, positioned at node top-right -->
<g class="step-badge" data-node-id="{nodeId}" data-step="{stepNum}">
  <circle cx="{bounds.right - 8}" cy="{bounds.top - 8}" r="10"
          fill="#004e8a" stroke="#0066cc" stroke-width="1.5"
          class="badge-circle"/>
  <text ...>{stepNum}</text>
</g>
```

Badge colors match archviz: `ready` → dark blue, `wip` → yellow `#f1c40f`.

### `css/animation.css`

```css
/* Token animation */
#token-circle {
  transition: cx 0.25s ease-in-out, cy 0.25s ease-in-out;
}

/* Step badge pop-in */
@keyframes popIn {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
.badge-circle {
  transform-origin: center;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-box: fill-box;
}

/* Log pane */
.log-entry { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.log-ready  { color: var(--accent-green); }
.log-wip    { color: var(--accent-amber); }

/* Popup toasts */
.popup-toast {
  position: absolute;
  animation: popIn 0.2s ease;
  z-index: 50;
}
```

### Popup toasts (SVG overlay)

Same 3 types as archviz (alert/issue/amplify). Rendered as SVG `<foreignObject>`
or as a positioned HTML div layered over the SVG container.

```js
function showPopup(step, nodeId, layout) {
  const bounds = layout.nodes[nodeId];
  const popup = document.createElement('div');
  popup.className = `popup-toast popup-${step.popup.type}`;
  popup.style.left = `${bounds.x - 60}px`;
  popup.style.top  = `${bounds.top - 56}px`;
  popup.innerHTML  = `${POPUP_ICONS[step.popup.type]} ${step.popup.msg}`;
  dom.svgContainer.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}
```

### Log pane

```js
function appendLog(step, stepNum) {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${step.status || 'default'}`;
  entry.innerHTML = `
    <span class="log-step">${stepNum}</span>
    <span class="log-status">[${(step.status || 'STEP').toUpperCase()}]</span>
    <span class="log-text">${step.text}</span>
  `;
  dom.logEntries.appendChild(entry);
  dom.logEntries.scrollTop = dom.logEntries.scrollHeight;
}
```

### Pane resizer

Drag `#pane-resizer` div to resize `#log-pane` height:
```js
function initPaneResizer() {
  let dragging = false, startY = 0, startH = 0;
  dom.paneResizer.addEventListener('mousedown', e => {
    dragging = true; startY = e.clientY;
    startH = dom.logPane.offsetHeight;
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    dom.logPane.style.height = `${Math.max(40, Math.min(startH + delta, window.innerHeight * 0.6))}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}
```

---

## Agent D2 — Edit Mode (Drag, Snap, Inline Edit)
**Files:** `js/interactions.js`

### Overview

Adapted from archviz `ui-interactions.js`. Key differences:
- Drag targets are SVG `<g data-node-id>` elements (not divs)
- Snap grid: 20px (process diagrams need coarser snap than archviz's 10px)
- Positions written back to JSON editor textarea in real time
- Lane constraint: dragged node cannot be moved to a different lane by default (optional: Ctrl+drag = lane change)
- Single-level undo via `state.undoStack`

### SVG drag implementation

```js
let dragNode = null, dragOffsetX = 0, dragOffsetY = 0;

dom.nodesLayer.addEventListener('mousedown', e => {
  if (!state.isEditing) return;
  const g = e.target.closest('[data-node-id]');
  if (!g) return;

  const nodeId = g.dataset.nodeId;
  const bounds = state.layout.nodes[nodeId];
  dragNode = nodeId;
  dragOffsetX = e.clientX - bounds.x;
  dragOffsetY = e.clientY - bounds.y;

  // Save undo snapshot
  state.undoStack = [JSON.stringify(state.graph)];
});

document.addEventListener('mousemove', e => {
  if (!dragNode) return;
  const snapped = (v, grid) => Math.round(v / grid) * grid;
  const svgRect = dom.diagramSvg.getBoundingClientRect();

  const newX = snapped(e.clientX - svgRect.left - dragOffsetX, 20);
  const newY = snapped(e.clientY - svgRect.top  - dragOffsetY, 20);

  // Update node position in graph JSON
  const node = state.graph.nodes.find(n => n.id === dragNode);
  node.x = newX;
  // node.laneY = newY - layout.lanes[laneIndex].y;  // lane-relative y

  // Re-render (lightweight: only move the <g> transform, then full render on mouseup)
  g.setAttribute('transform', `translate(${newX - bounds.x}, ${newY - bounds.y})`);
  renderConnections(state.graph, state.layout, state.viewMode);

  // Sync JSON editor
  syncEditorFromGraph();
});

document.addEventListener('mouseup', () => {
  if (!dragNode) return;
  dragNode = null;
  renderAll(state.graph);  // Full re-render to clean up transform
});
```

### Inline label edit (double-click)

Double-click a task or gateway label → show `<foreignObject>` with `<textarea>`:

```js
dom.nodesLayer.addEventListener('dblclick', e => {
  if (!state.isEditing) return;
  const g = e.target.closest('[data-node-id]');
  if (!g) return;

  const nodeId = g.dataset.nodeId;
  const bounds = state.layout.nodes[nodeId];
  const node   = state.graph.nodes.find(n => n.id === nodeId);

  // Create foreignObject overlay
  const fo = svgEl('foreignObject', {
    x: bounds.left, y: bounds.top,
    width: bounds.width, height: bounds.height,
  });
  const ta = document.createElement('textarea');
  ta.value = node.label.replace(/\\n/g, '\n');
  ta.style.cssText = 'width:100%;height:100%;background:#1e2535;color:#e2e8f0;border:1px solid #60a5fa;border-radius:4px;padding:4px;font:inherit;resize:none;';
  fo.appendChild(ta);
  dom.overlaysLayer.appendChild(fo);
  ta.focus(); ta.select();

  const commit = () => {
    node.label = ta.value.trim().replace(/\n/g, '\\n');
    fo.remove();
    syncEditorFromGraph();
    renderAll(state.graph);
  };
  ta.addEventListener('blur', commit);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) commit(); });
});
```

### Undo (Ctrl+Z)

```js
document.addEventListener('keydown', e => {
  if (!state.isEditing) return;
  if (e.ctrlKey && e.key === 'z') {
    if (state.undoStack.length) {
      state.graph = JSON.parse(state.undoStack.pop());
      syncEditorFromGraph();
      renderAll(state.graph);
    }
  }
});
```

### View mode toggle buttons

```js
['before', 'split', 'after', 'overlay'].forEach(mode => {
  document.getElementById(`btn-${mode}`).addEventListener('click', () => {
    state.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');
    renderAll(state.graph);
  });
});
```

---

## Agent D3 — JSON Editor + File Operations
**Files:** `js/file-ops.js` + `css/widgets.css`

### Overview

Adapted from archviz `file-operations.js` + left sidebar JSON editor.
Key differences:
- JSON editor is a `<textarea>` (same as archviz; Monaco not required)
- Positions written back on drag (from D2's `syncEditorFromGraph()`)
- Supports JS-style comments in JSON (stripped on parse)

### JSON Editor sidebar

```js
export function initJsonEditor() {
  // Populate textarea with current graph JSON on show
  dom.chkShowEditor.addEventListener('change', e => {
    dom.editorPane.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) syncEditorFromGraph();
  });

  // "Update Diagram" button
  dom.btnUpdate.addEventListener('click', () => {
    try {
      const graph = parseGraph(dom.jsonEditor.value);
      state.graph = graph;
      dom.editorError.textContent = '';
      dom.jsonEditor.style.borderLeft = '';
      renderAll(graph);
    } catch (err) {
      dom.editorError.textContent = err.message;
      dom.jsonEditor.style.borderLeft = '3px solid var(--accent-red)';
    }
  });
}

export function syncEditorFromGraph() {
  if (!dom.chkShowEditor.checked) return;
  dom.jsonEditor.value = JSON.stringify(state.graph, null, 2);
}
```

### File upload

```js
dom.btnUploadJson.addEventListener('click', () => dom.fileInput.click());

dom.fileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const graph = parseGraph(text);
    if (!graph.nodes) throw new Error('JSON must have a nodes array');
    state.graph = graph;
    dom.jsonEditor.value = JSON.stringify(graph, null, 2);
    renderAll(graph);
  } catch (err) {
    alert(`Invalid JSON: ${err.message}`);
  }
  dom.fileInput.value = '';
});
```

### File download

```js
dom.btnDownloadJson.addEventListener('click', () => {
  const json   = JSON.stringify(state.graph, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${state.graph.title || 'process'}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
```

### Diagram selector dropdown (multi-diagram support)

Auto-discover JSON files from `sample/` directory OR a backend API:
```js
async function discoverDiagrams() {
  // Try: GET /api/diagrams → [{id, title, filename}]
  // Fallback: hardcoded list of known sample files
  const files = ['order-approval.json', 'ticket-triage.json', 'onboarding.json'];
  files.forEach(f => addOption(dom.jsonSelector, f, f.replace('.json', '').replace(/-/g, ' ')));
}
```

### Notebook widget

```js
export function renderNotebook(graph) {
  dom.notebookText.textContent = graph.notes || '';
}
```

Styled like archviz notebook:
```css
#notebook {
  position: absolute;
  top: 12px; right: 12px;
  width: 220px;
  background: #f5f0e0;  /* cream notepad */
  border-left: 4px solid #ef4444;  /* red margin line */
  border-radius: 4px;
  z-index: 100;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #333;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
body.light-theme #notebook { background: #fffff0; color: #1e293b; }
```

### `css/widgets.css` — JSON Editor + Log Pane + Notebook

```css
/* JSON Editor pane */
#editor-pane {
  width: 320px;
  min-width: 200px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-dim);
  display: flex;
  flex-direction: column;
}
#json-editor {
  flex: 1;
  background: #0d1120;
  color: #d4d4d4;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  padding: 12px;
  border: none;
  resize: none;
  outline: none;
  tab-size: 2;
}
#editor-error { color: var(--accent-red); font-size: 10px; margin-left: 8px; }

/* Log pane */
#log-pane {
  height: var(--log-h);
  background: var(--bg-panel);
  border-top: 1px solid var(--border-dim);
  overflow-y: auto;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
}
#pane-resizer {
  height: 4px;
  background: var(--border-dim);
  cursor: ns-resize;
}
#pane-resizer:hover { background: var(--accent); }

.log-entry { display: flex; gap: 8px; padding: 2px 0; }
.log-step   { color: var(--text-dim); min-width: 24px; }
.log-status { font-weight: 700; min-width: 52px; }
.log-entry.log-ready .log-status  { color: var(--accent-green); }
.log-entry.log-wip .log-status    { color: var(--accent-amber); }
```
