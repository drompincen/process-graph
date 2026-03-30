# Agents B1, B2, B3 — Rendering Engine
## Swimlane Layout · Node Shapes · Orthogonal Routing

**Depends on:** Agent A (foundation)
**B1, B2, B3 run in parallel after Agent A**
**Blocks:** All Phase 2 agents (C1–D3)

---

## Agent B1 — Swimlane Layout Engine
**File:** `js/layout.js`

### Responsibility
Converts the logical data model (lane-relative coordinates) into absolute SVG
coordinates used by all other rendering agents. No drawing — pure coordinate math.

### API (exported functions)

```js
/**
 * Compute layout geometry from parsed graph.
 * Returns a layout object consumed by renderer.js and routing.js.
 */
export function computeLayout(graph, svgWidth) {
  // Returns:
  return {
    svgWidth,
    svgHeight,      // header + sum(lane.height) + metricsBar
    headerH: 48,
    metricsH: 32,
    labelColW: 44,

    lanes: [         // One entry per lane, in order
      {
        id: 'requester',
        label: 'Requester',
        color: '#1e3a5f',
        y: 48,        // absolute SVG y of lane top
        height: 120,
        centerY: 108, // y + height/2
        gradientId: 'lg0',
      },
      ...
    ],

    nodes: {         // Keyed by node.id → absolute SVG bounds
      'start': {
        x: 75, y: 108,   // center
        left: 63, right: 87, top: 96, bottom: 120,
        width: 24, height: 24,    // for circle events
        lane: 'requester',
        laneIndex: 0,
      },
      'submit-form': {
        x: 150, y: 108,
        left: 100, right: 200, top: 88, bottom: 128,
        width: 100, height: 40,
        lane: 'requester',
        laneIndex: 0,
      },
      ...
    }
  };
}

/**
 * Default node dimensions by type.
 */
export const NODE_DIMS = {
  'start-event':          { w: 24, h: 24 },
  'end-event':            { w: 28, h: 28 },
  'task':                 { w: 110, h: 40 },
  'subprocess':           { w: 110, h: 44 },  // slightly taller for [+] marker
  'gateway':              { w: 70, h: 50 },   // diamond half-w=35, half-h=25
  'annotation':           { w: 130, h: 38 },
  'intermediate-event':   { w: 24, h: 24 },
};

/**
 * Given a connection, return the exit point on the source node
 * and entry point on the target node, based on routing direction.
 */
export function getConnectionPoints(conn, layout) {
  // Returns { sx, sy, tx, ty, direction: 'right'|'down'|'up'|'left' }
}
```

### Lane rendering (SVG, delegated to renderer.js but geometry here)

Each lane band is a `<rect>` spanning full SVG width. The label column is 44px
wide with a dashed separator line. Lane labels are `<text>` rotated -90°,
centered vertically in each lane band.

```
y=0            ┌──────────────────────────────────────┐ ← Header (48px, bg=#0d1120)
               │ ⬡ PROCESS GRAPH  [controls...]       │
y=48           ├──────────────────────────────────────┤ ← Lane border
               │ R │  ... Requester lane content ...  │ ← Lane 0 (height=120)
               │ E │                                  │
y=168          ├───┼──────────────────────────────────┤ ← Lane border
               │ M │  ... Manager lane content ...    │ ← Lane 1 (height=120)
               │ G │                                  │
y=288          ├───┼──────────────────────────────────┤
               │   │  ... Finance lane ...            │ ← Lane 2
y=408          ├───┼──────────────────────────────────┤
               │   │  ... System lane ...             │ ← Lane 3
y=528          ├──────────────────────────────────────┤ ← Metrics bar
               │ STEPS: 6  TIME: 48h  HANDOFFS: 4    │ (32px)
y=560          └──────────────────────────────────────┘
```

---

## Agent B2 — Node Shape Renderer
**File:** `js/renderer.js` + `css/diagram.css`

### Responsibility
Draws all 7 BPMN node types as SVG `<g>` elements into `#nodes-layer`.
Also renders lane bands, header, metrics bar, and injects `<defs>` (filters, gradients, patterns).

### SVG `<defs>` to inject

```xml
<!-- Drop shadow -->
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
  <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.5"/>
</filter>

<!-- Diff glow filters -->
<filter id="glow-green" .../>   <!-- added nodes -->
<filter id="glow-red"   .../>   <!-- removed nodes -->
<filter id="glow-amber" .../>   <!-- changed nodes -->

<!-- Lane gradient (one per lane, generated from lane.color) -->
<linearGradient id="lg0" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%"   stop-color="{lane.color}" stop-opacity="0.55"/>
  <stop offset="100%" stop-color="#161b27"       stop-opacity="0.1"/>
</linearGradient>

<!-- Node fill gradients (reused across all nodes of same type) -->
<linearGradient id="nf-task"  .../>   <!-- dark blue-grey -->
<linearGradient id="nf-term"  .../>   <!-- darker blue-grey (start/end events) -->
<linearGradient id="nf-dec"   .../>   <!-- dark amber-brown (gateways) -->
<linearGradient id="nf-added" .../>   <!-- dark green (diff: added) -->
<linearGradient id="nf-removed".../>  <!-- dark red (diff: removed) -->

<!-- Grid dot pattern -->
<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
  <circle cx="12" cy="12" r="0.7" fill="rgba(255,255,255,0.04)"/>
</pattern>
```

### Node rendering functions

```js
/**
 * Render all visible nodes into #nodes-layer.
 * Clears existing content first.
 */
export function renderNodes(graph, layout, viewMode) {
  const layer = dom.nodesLayer;
  layer.innerHTML = '';
  const visibleNodes = graph.nodes.filter(n => isVisible(n, viewMode, state.selectedPhase));
  visibleNodes.forEach(n => {
    const g = createNodeGroup(n, layout.nodes[n.id]);
    layer.appendChild(g);
  });
}

function createNodeGroup(node, bounds) {
  const g = svgEl('g', { 'data-node-id': node.id, class: nodeClasses(node) });
  switch (node.type) {
    case 'start-event':       return renderStartEvent(g, node, bounds);
    case 'end-event':         return renderEndEvent(g, node, bounds);
    case 'task':              return renderTask(g, node, bounds);
    case 'subprocess':        return renderSubprocess(g, node, bounds);
    case 'gateway':           return renderGateway(g, node, bounds);
    case 'annotation':        return renderAnnotation(g, node, bounds);
    case 'intermediate-event':return renderIntermediateEvent(g, node, bounds);
  }
}
```

### Node shapes

**`start-event`** — thin-border circle
```xml
<g data-node-id="start" class="node node-start-event">
  <circle cx="75" cy="108" r="12"
          fill="url(#nf-term)" stroke="#334155" stroke-width="2"
          filter="url(#sh)"/>
  <circle cx="75" cy="108" r="4" fill="#64748b"/>
  <!-- No text label — label shown as annotation above/below -->
</g>
```

**`end-event`** — thick-border circle with filled center
```xml
<g data-node-id="end" class="node node-end-event">
  <circle cx="820" cy="108" r="14"
          fill="url(#nf-term)" stroke="#334155" stroke-width="3.5"
          filter="url(#sh)"/>
  <circle cx="820" cy="108" r="7" fill="#64748b"/>
</g>
```

**`task`** — rounded rect with text (supports multi-line via tspan)
```xml
<g data-node-id="submit-form" class="node node-task">
  <rect x="100" y="88" width="110" height="40" rx="6"
        fill="url(#nf-task)" stroke="#334155" stroke-width="1.5"
        filter="url(#sh)"/>
  <text x="155" y="104" text-anchor="middle" ...>Submit</text>
  <text x="155" y="118" text-anchor="middle" ...>Form</text>
</g>
```

**`subprocess`** — task + [+] marker
```xml
<g ...>
  <!-- same rect as task -->
  <!-- [+] marker: small rect + cross lines at bottom-center -->
  <rect x="141" y="120" width="18" height="12" rx="2"
        fill="#1a2030" stroke="#334155" stroke-width="1"/>
  <line x1="150" y1="122" x2="150" y2="130" stroke="#475569" stroke-width="1.2"/>
  <line x1="146" y1="126" x2="154" y2="126" stroke="#475569" stroke-width="1.2"/>
</g>
```

**`gateway`** — diamond polygon
```xml
<g data-node-id="approved-gateway" class="node node-gateway">
  <!-- Diamond: cx, cy, half-w=35, half-h=25 -->
  <polygon points="565,233 600,258 565,283 530,258"
           fill="url(#nf-dec)" stroke="#d97706" stroke-width="1.8"
           filter="url(#sh)"/>
  <text x="565" y="254" text-anchor="middle" fill="#fcd34d" ...>Approved?</text>
</g>
```

**`annotation`** — dashed box with callout pointer
```xml
<g data-node-id="bottleneck-note" class="node node-annotation">
  <rect x="116" y="174" width="150" height="34" rx="4"
        fill="#1c1706" stroke="#854d0e" stroke-width="1"
        stroke-dasharray="4,3"/>
  <polygon points="266,184 278,191 266,198" fill="#1c1706" stroke="#854d0e" stroke-width="1"/>
  <text x="191" y="189" ...>⚠ Bottleneck: 2–3 day</text>
  <text x="191" y="202" ...>delay at each handoff</text>
</g>
```

**`intermediate-event`** — double-ring circle
```xml
<g ...>
  <circle cx="..." cy="..." r="14" fill="url(#nf-term)" stroke="#334155" stroke-width="2"/>
  <circle cx="..." cy="..." r="10" fill="none"           stroke="#334155" stroke-width="1.5"/>
  <!-- inner icon path for message/timer/error variants -->
</g>
```

### Diff overlay chips (rendered in `#overlays-layer`)

For nodes with `diff: 'added'` or `diff: 'removed'`:
```xml
<!-- NEW chip — top-right of node bounds -->
<rect x="{bounds.right - 38}" y="{bounds.top - 8}" width="36" height="15" rx="7" fill="#14532d"/>
<text ...>NEW</text>

<!-- REMOVED chip -->
<rect ... fill="#7f1d1d"/>
<text ...>REMOVED</text>

<!-- Strikethrough text on removed nodes -->
<text text-decoration="line-through" opacity="0.8" ...>label</text>
```

### State badge overlay (`state: 'bottleneck'`)

Small badge, top-left corner of node:
```xml
<rect x="{bounds.left}" y="{bounds.top - 9}" width="18" height="14" rx="6" fill="#78350f"/>
<text x="..." y="..." fill="#fbbf24">⚠</text>
```

### Lane rendering (`renderLanes`)

```js
export function renderLanes(graph, layout) {
  const layer = dom.lanesLayer;
  layer.innerHTML = '';

  // Grid background on full SVG
  svgAppend(layer, 'rect', { width: layout.svgWidth, height: layout.svgHeight, fill: '#161b27' });
  svgAppend(layer, 'rect', { width: layout.svgWidth, height: layout.svgHeight, fill: 'url(#grid)' });

  // Lane bands
  layout.lanes.forEach((lane, i) => {
    svgAppend(layer, 'rect', { x: 0, y: lane.y, width: layout.svgWidth, height: lane.height, fill: `url(#lg${i})` });
    // Top border
    svgAppend(layer, 'line', { x1: 0, y1: lane.y, x2: layout.svgWidth, y2: lane.y, stroke: '#1e2535', 'stroke-width': 1 });
    // Bottom border (last lane only, to close)
    if (i === layout.lanes.length - 1) {
      svgAppend(layer, 'line', { x1: 0, y1: lane.y + lane.height, x2: layout.svgWidth, y2: lane.y + lane.height, stroke: '#1e2535', 'stroke-width': 1 });
    }
    // Label column separator
    svgAppend(layer, 'line', { x1: layout.labelColW, y1: lane.y, x2: layout.labelColW, y2: lane.y + lane.height, stroke: '#1e2535', 'stroke-width': 1, 'stroke-dasharray': '2,4', opacity: 0.5 });
    // Rotated lane label
    const lx = 22, ly = lane.y + lane.height / 2;
    const text = svgEl('text', { transform: `rotate(-90 ${lx} ${ly})`, 'text-anchor': 'middle', fill: '#94a3b8', 'font-size': 9, 'letter-spacing': '0.12em', 'font-weight': 600, opacity: 0.7 });
    text.textContent = lane.label.toUpperCase();
    layer.appendChild(text);
  });
}
```

### `css/diagram.css` rules

- `.node` cursor (default / grab in edit mode)
- `.node-task rect` hover: `stroke: #475569` → brighter on hover
- `.node.diff-added rect, .node.diff-added polygon` → `stroke: var(--accent-green)`
- `.node.diff-removed rect` → `stroke: var(--accent-red); opacity: 0.85`
- `.node.diff-changed rect` → `stroke: var(--accent-amber)`
- `.node.state-bottleneck rect` → `stroke: var(--accent-amber)`
- `.node.state-automated rect` → `stroke: var(--accent)`
- Metrics bar: `#metrics-bar text` styles

---

## Agent B3 — Orthogonal Routing Engine
**File:** `js/routing.js`

### Responsibility
Compute SVG path `d` strings for all connections using orthogonal (right-angle)
routing. No bezier curves. Also renders arrowheads as explicit `<polygon>`
elements (same technique as `preview.html` and `uml_example.html`).

### Core algorithm

```js
/**
 * Compute an orthogonal path between two node connection points.
 * Returns: { pathD: string, arrowPoints: string, arrowFill: string }
 */
export function computeOrthogonalPath(conn, layout) {
  const src = layout.nodes[conn.from];
  const tgt = layout.nodes[conn.to];

  const dir = detectDirection(src, tgt, conn.route);
  const { sx, sy, tx, ty } = getConnectionPoints(src, tgt, dir);

  switch (dir) {
    case 'right': return straightHoriz(sx, sy, tx, ty, conn);
    case 'left':  return loopBack(sx, sy, tx, ty, conn, layout);
    case 'down':  return crossLaneDown(sx, sy, tx, ty, conn);
    case 'up':    return crossLaneUp(sx, sy, tx, ty, conn);
    case 'elbow-right-down': return elbowRightDown(sx, sy, tx, ty, conn);
    case 'elbow-right-up':   return elbowRightUp(sx, sy, tx, ty, conn);
  }
}
```

### Direction detection rules

```
Same lane, src.x < tgt.x          → 'right'       (straight horiz)
Same lane, src.x > tgt.x          → 'left'        (loop-back below)
src.laneIndex < tgt.laneIndex      → 'down'        (cross-lane down)
src.laneIndex > tgt.laneIndex      → 'up'          (cross-lane up)
Cross-lane, src.right < tgt.left   → 'elbow-right-down' or 'elbow-right-up'
Cross-lane, src.right > tgt.right  → 'elbow-left-down' (rare, same as loop-back)
```

### Path constructors

```js
// Straight horizontal: path is a line, arrowhead points right
function straightHoriz(sx, sy, tx, ty, conn) {
  const tailX = tx - 9;
  return {
    pathD: `M ${sx},${sy} L ${tailX},${sy}`,
    arrowPoints: `${tx},${ty} ${tailX},${ty-4} ${tailX},${ty+4}`,
    arrowFill: connColor(conn),
    label: conn.label,
    labelX: (sx + tx) / 2,
    labelY: sy - 8,
  };
}

// Loop-back (same lane, right→left): U-path routing below lane center
// Offset below nodes by conn.offset (default 24px below lane bottom)
function loopBack(sx, sy, tx, ty, conn, layout) {
  const lane = layout.lanes.find(l => l.id === /* src lane */);
  const loopY = lane.y + lane.height + (conn.offset || 24);
  const tailY = ty + 9;
  return {
    pathD: `M ${sx},${sy} L ${sx},${loopY} L ${tx},${loopY} L ${tx},${tailY}`,
    arrowPoints: `${tx},${ty} ${tx-4},${tailY} ${tx+4},${tailY}`,
    arrowFill: connColor(conn),
  };
}

// Cross-lane down: vertical line from node bottom to node top
function crossLaneDown(sx, sy, tx, ty, conn) {
  // sx === tx (same x): straight vertical
  // sx !== tx: elbow — go down to midpoint y, horizontal, then down
  if (Math.abs(sx - tx) < 8) {
    const tailY = ty - 9;
    return {
      pathD: `M ${sx},${sy} L ${sx},${tailY}`,
      arrowPoints: `${tx},${ty} ${tx-4},${tailY} ${tx+4},${tailY}`,
      arrowFill: connColor(conn),
    };
  }
  // Elbow
  const midY = (sy + ty) / 2;
  const tailY = ty - 9;
  return {
    pathD: `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${tailY}`,
    arrowPoints: `${tx},${ty} ${tx-4},${tailY} ${tx+4},${tailY}`,
    arrowFill: connColor(conn),
  };
}

// Cross-lane up: elbow going upward
function crossLaneUp(sx, sy, tx, ty, conn) {
  const midY = (sy + ty) / 2;
  const tailY = ty + 9;
  return {
    pathD: `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${tailY}`,
    arrowPoints: `${tx},${ty} ${tx-4},${tailY} ${tx+4},${tailY}`,
    arrowFill: connColor(conn),
  };
}
```

### Connection colors

```js
function connColor(conn) {
  switch (conn.type) {
    case 'message':     return '#60a5fa';   // blue dashed
    case 'conditional': return '#f59e0b';   // amber dashed
    case 'default':     return '#475569';   // grey solid with // tick
    default:            return '#475569';   // grey solid
  }
}
```

### Stroke styles per connection type

```js
function connStroke(conn) {
  switch (conn.type) {
    case 'message':     return { 'stroke-dasharray': '5,4', 'stroke-width': 1.6 };
    case 'conditional': return { 'stroke-dasharray': '4,3', 'stroke-width': 1.6 };
    default:            return { 'stroke-width': 1.8 };
  }
}
```

### Render all connections

```js
export function renderConnections(graph, layout, viewMode) {
  const layer = dom.connectionsLayer;
  layer.innerHTML = '';
  const arrowLayer = dom.annotationsLayer;  // arrowheads go on top of nodes
  arrowLayer.innerHTML = '';

  graph.connections
    .filter(c => isVisible(c, viewMode, state.selectedPhase))
    .forEach(conn => {
      const result = computeOrthogonalPath(conn, layout);

      // Path element
      const path = svgEl(conn.type === 'sequence' ? 'line' : 'path', {
        d: result.pathD,
        stroke: connColor(conn),
        fill: 'none',
        ...connStroke(conn),
        opacity: 0.9,
        'data-conn-id': conn.id,
      });
      layer.appendChild(path);

      // Arrowhead polygon
      const arrow = svgEl('polygon', {
        points: result.arrowPoints,
        fill: result.arrowFill,
      });
      arrowLayer.appendChild(arrow);

      // Label (decision YES/NO or conn.label)
      if (conn.decision || conn.label) {
        renderConnectionLabel(arrowLayer, conn, result);
      }
    });
}
```

### Decision gateway labels (YES / NO chips)

```xml
<!-- YES chip — small pill near arrowhead -->
<rect x="{lx}" y="{ly}" width="28" height="16" rx="4" fill="#14532d" opacity="0.95"/>
<text fill="#86efac" ...>Yes</text>

<!-- NO chip -->
<rect ... fill="#450a0a"/>
<text fill="#fca5a5" ...>No</text>
```

### Acceptance Criteria (B1 + B2 + B3)

- [ ] All 7 node types render correctly with proper SVG shapes
- [ ] Lane bands render with rotated labels, correct heights
- [ ] Grid dot pattern visible in background
- [ ] Diff overlays (NEW/REMOVED chips, glow filters) render on tagged nodes
- [ ] All connection types render (solid, dashed-blue, dashed-amber)
- [ ] Orthogonal routing covers: straight horiz, straight vert, elbow, loop-back
- [ ] Arrowheads point in correct direction for all routing cases
- [ ] Decision YES/NO labels appear correctly
- [ ] Header bar and metrics bar render correctly
- [ ] Split view (before left, after right) with divider line works
