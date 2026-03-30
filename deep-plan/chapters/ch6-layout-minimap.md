# Chapter 6 — Layout, Zoom & Mini-Map

> **Depends on:** Chapter 3 (editor), Chapter 4 (swimlanes)
> **Parallel Agents:** 2
> **Files:** `js/layout.js`, `js/interactions.js`, `js/renderer.js`, `index.html`, `css/widgets.css`

---

## Goal
Implement auto-layout engine, mini-map navigation widget, grid snap
refinement, and overlap prevention per rules.txt.txt.

---

## Agent 6-A: Auto-Layout Algorithm

### Tasks

#### 6.1 Auto-Layout Engine
Implement a left-to-right layered layout algorithm (Sugiyama-style simplified):

**Phase 1 — Layer Assignment:**
```js
function assignLayers(graph) {
  // BFS from start node
  // Each node gets layer = longest path from start
  // Decision branches go to next layer
  // Merge nodes go to max(incoming layers) + 1
  const layers = {};
  const start = graph.nodes.find(n => n.type === 'start-event');
  if (!start) return layers;

  const queue = [{ id: start.id, layer: 0 }];
  const visited = new Set();

  while (queue.length) {
    const { id, layer } = queue.shift();
    if (visited.has(id)) {
      layers[id] = Math.max(layers[id] || 0, layer);
      continue;
    }
    visited.add(id);
    layers[id] = layer;

    const outgoing = graph.connections.filter(c => c.from === id);
    for (const conn of outgoing) {
      queue.push({ id: conn.to, layer: layer + 1 });
    }
  }
  return layers;
}
```

**Phase 2 — Node Ordering Within Layers:**
- Within each layer, order nodes to minimize edge crossings
- Use barycenter heuristic: position each node at the average position
  of its connected nodes in the previous layer
- Respect swimlane constraints: nodes stay in their assigned lane

**Phase 3 — Coordinate Assignment:**
```js
function assignCoordinates(layers, graph, laneMap) {
  const LAYER_GAP = 200;  // horizontal distance between layers
  const NODE_GAP = 60;    // vertical distance between nodes in same layer

  for (const [nodeId, layer] of Object.entries(layers)) {
    const node = graph.nodes.find(n => n.id === nodeId);
    node.x = layer * LAYER_GAP + 100; // left margin
    // y computed based on lane + position within lane
  }
}
```

**Phase 4 — Edge Crossing Minimization:**
- Count crossings between adjacent layers
- Swap node positions within layers to reduce crossings
- Iterate 3-5 times for convergence

#### 6.2 "Clean Layout" Button
Add button to toolbar:
```html
<button id="btn-auto-layout" title="Auto-arrange nodes">⊞ Layout</button>
```

On click:
1. Save current positions to undo stack
2. Run auto-layout algorithm
3. Update all node x/y positions
4. Auto-resize lanes
5. Re-render with smooth transition (300ms CSS transition on transform)

#### 6.3 Change Grid Snap from 20px to 10px
In `interactions.js`:
```js
// Change GRID constant
const GRID = 10; // was 20, rules.txt says 10px
```
Also update the SVG background grid pattern to show 10px dots.

#### 6.4 Node Overlap Prevention During Drag
When dragging a node, prevent it from overlapping with other nodes:

```js
function resolveOverlaps(draggedNode, allNodes) {
  const dragRect = getNodeRect(draggedNode);
  for (const other of allNodes) {
    if (other.id === draggedNode.id) continue;
    const otherRect = getNodeRect(other);
    if (rectsOverlap(dragRect, otherRect)) {
      // Push dragged node to nearest non-overlapping position
      // Snap to grid after push
      const push = computePushVector(dragRect, otherRect);
      draggedNode.x += snapToGrid(push.x);
      draggedNode.y += snapToGrid(push.y);
    }
  }
}
```

---

## Agent 6-B: Mini-Map Widget

### Tasks

#### 6.5 Mini-Map Widget
Add a miniature overview of the entire diagram in the bottom-right corner:

**HTML:**
```html
<div id="minimap" class="minimap-container">
  <canvas id="minimap-canvas" width="200" height="150"></canvas>
  <div id="minimap-viewport" class="minimap-viewport"></div>
</div>
```

**Rendering:**
- Draw simplified version of diagram on canvas:
  - Lanes as colored horizontal bands
  - Nodes as small rectangles/diamonds/circles (by type, 3-5px)
  - Connections as thin lines
  - No labels or detail
- Scale to fit entire diagram in 200x150px canvas
- Update on every render cycle

```js
function renderMinimap(graph, laneMap, viewportRect) {
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');

  // Calculate scale to fit entire diagram
  const diagramBounds = computeDiagramBounds(graph, laneMap);
  const scale = Math.min(
    canvas.width / diagramBounds.width,
    canvas.height / diagramBounds.height
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-diagramBounds.x, -diagramBounds.y);

  // Draw lanes
  for (const lane of graph.lanes) {
    ctx.fillStyle = lane.color + '40'; // 25% opacity
    const info = laneMap[lane.id];
    ctx.fillRect(0, info.top, diagramBounds.width, info.height);
  }

  // Draw nodes
  for (const node of graph.nodes) {
    ctx.fillStyle = getNodeMinimapColor(node.type);
    const abs = getAbsoluteNodePosition(node, laneMap);
    ctx.fillRect(abs.x, abs.y, 6, 4); // simplified
  }

  // Draw connections
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 0.5;
  for (const conn of graph.connections) { /* simplified lines */ }

  // Draw viewport indicator
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(viewportRect.x, viewportRect.y, viewportRect.w, viewportRect.h);

  ctx.restore();
}
```

**CSS:**
```css
.minimap-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 200px;
  height: 150px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.minimap-viewport {
  position: absolute;
  border: 2px solid #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  pointer-events: none;
}
```

#### 6.6 Mini-Map Click-to-Navigate
- Click anywhere on mini-map → pan main canvas to that position
- Click-and-drag on mini-map → continuous pan
- The viewport rectangle moves with the interaction

```js
minimapCanvas.addEventListener('mousedown', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / scale + diagramBounds.x;
  const y = (e.clientY - rect.top) / scale + diagramBounds.y;
  panToPosition(x, y); // center viewport on clicked position
});
```

#### 6.7 Smooth Zoom Refinement
Improve existing zoom behavior:
- Mousewheel zoom: smooth steps, zoom toward cursor position
- Pinch-to-zoom on trackpad/touch
- Zoom range: 20% to 300% (enforce limits)
- Show zoom percentage indicator near mini-map
- Double-click empty canvas to zoom-to-fit

```js
svgContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = clamp(state.zoom * delta, 0.2, 3.0);

  // Zoom toward cursor position
  const svgPoint = screenToSVG(e.clientX, e.clientY);
  state.zoom = newZoom;
  // Adjust pan offset to keep cursor position stable
  adjustPanForZoom(svgPoint, e.clientX, e.clientY);

  renderAll();
  updateMinimap();
});
```

---

## Acceptance Criteria
- [ ] Auto-layout arranges nodes left-to-right in layers
- [ ] Auto-layout minimizes edge crossings
- [ ] Auto-layout respects swimlane assignments
- [ ] "Clean Layout" button triggers auto-layout with undo support
- [ ] Grid snap is 10px (changed from 20px)
- [ ] Nodes cannot overlap during drag
- [ ] Mini-map shows simplified diagram overview
- [ ] Mini-map shows viewport indicator rectangle
- [ ] Clicking mini-map navigates main canvas
- [ ] Mini-map updates on every change
- [ ] Zoom is smooth, toward cursor, range 20-300%
- [ ] Zoom percentage shown
- [ ] Double-click canvas zooms to fit

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 6 is complete:

1. Load a complex diagram — click "Layout" button — verify nodes rearrange L-to-R
2. Verify auto-layout keeps nodes in their original swimlanes
3. Ctrl+Z after auto-layout — verify positions restored
4. Drag a node near another — verify no overlap allowed
5. Verify grid snap is 10px (drag and check coordinates)
6. Check mini-map renders in bottom-right corner
7. Verify mini-map shows simplified nodes and lanes
8. Verify viewport rectangle in mini-map matches visible area
9. Click on mini-map — verify main canvas pans to that location
10. Scroll to zoom — verify smooth, toward cursor
11. Verify zoom limits (can't go below 20% or above 300%)
12. Double-click empty canvas — verify zoom-to-fit
```
