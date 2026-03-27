/**
 * layout.js — Pure coordinate math for the process-graph SVG layout.
 * No DOM access, no SVG drawing — only geometry calculations.
 *
 * Exports:
 *   NODE_DIMS            — default width/height per node type
 *   computeLayout        — convert graph JSON → absolute SVG coordinates
 *   getConnectionPoints  — exit/entry edge midpoints for a given direction
 *   detectDirection      — determine routing direction between two node bounds
 *   getPortPosition          — port offset {x,y} relative to node center
 *   getAbsolutePortPosition — absolute {x,y} for a specific port on a node
 *   assignGatewayPort       — next available outgoing port name for a gateway node
 */

import { PORT_DEFS } from './constants.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default pixel dimensions for each node type. w/h are full width and height. */
export const NODE_DIMS = {
  'start-event':        { w: 24,  h: 24  },
  'end-event':          { w: 28,  h: 28  },
  'task':               { w: 110, h: 40  },
  'subprocess':         { w: 110, h: 44  },
  'gateway':            { w: 70,  h: 50  },
  'annotation':         { w: 130, h: 38  },
  'intermediate-event': { w: 24,  h: 24  },
  'persona':            { w: 110, h: 44  },
  'agent':              { w: 110, h: 44  },
  'system':             { w: 110, h: 44  },
  'merge':              { w: 30,  h: 30  },
  'process-group':      { w: 300, h: 200, headerH: 36 },
};

const HEADER_H    = 48;
const METRICS_H   = 56;
const LABEL_COL_W = 52;
const DEFAULT_LANE_HEIGHT = 130;
const MIN_SVG_WIDTH       = 1200;
const SVG_RIGHT_PAD       = 120;

// ─── computeLayout ───────────────────────────────────────────────────────────

/**
 * Compute full SVG layout from a parsed graph object.
 *
 * @param {Object} graph     - Parsed JSON graph (lanes, nodes, connections …)
 * @param {number} [svgWidth] - Optional override for total SVG width
 * @returns {Object} layout  - All absolute coordinates consumed by renderer / routing
 */
export function computeLayout(graph, svgWidth) {
  const lanes  = graph.lanes  || [];
  const nodes  = graph.nodes  || [];

  // ── 1. Determine SVG width ────────────────────────────────────────────────
  // Find the rightmost node x position and add padding.
  let rightmostX = 0;
  for (const node of nodes) {
    if (typeof node.x === 'number') {
      const dims = NODE_DIMS[node.type] || { w: 110, h: 40 };
      const nodeRight = node.x + dims.w / 2;
      if (nodeRight > rightmostX) rightmostX = nodeRight;
    }
  }
  // Note: final SVG width is recomputed after overlap resolution (step 4).

  // ── 2. Build lane geometry ────────────────────────────────────────────────
  // Lanes stack top-to-bottom starting at HEADER_H.
  const laneMap = {};   // id → lane layout entry
  const laneList = [];
  let   currentY = HEADER_H;

  lanes.forEach((lane, index) => {
    const height    = typeof lane.height === 'number' ? lane.height : DEFAULT_LANE_HEIGHT;
    const gradientId = `lg${index}`;

    const entry = {
      id:         lane.id,
      label:      lane.label    || lane.id,
      color:      lane.color    || '#1e3a5f',
      y:          currentY,
      height:     height,
      centerY:    currentY + height / 2,
      gradientId: gradientId,
      index:      index,
    };

    laneList.push(entry);
    laneMap[lane.id] = entry;
    currentY += height;
  });

  const svgHeight = currentY + METRICS_H;   // lanes end at currentY, then metrics bar

  // ── 3. Build node bounds ──────────────────────────────────────────────────
  const nodesMap = {};

  for (const node of nodes) {
    const dims = NODE_DIMS[node.type] || { w: 110, h: 40 };
    const lane = laneMap[node.lane];

    if (!lane) {
      // Node references an unknown lane — skip gracefully.
      continue;
    }

    // Center x comes directly from node.x in JSON.
    const cx = node.x;

    // Center y: lane.y + laneY offset, defaulting to lane center.
    const cy = typeof node.laneY === 'number'
      ? lane.y + node.laneY
      : lane.centerY;

    const halfW = dims.w / 2;
    const halfH = dims.h / 2;

    nodesMap[node.id] = {
      x:         cx,
      y:         cy,
      left:      cx - halfW,
      right:     cx + halfW,
      top:       cy - halfH,
      bottom:    cy + halfH,
      width:     dims.w,
      height:    dims.h,
      lane:      lane.id,
      laneIndex: lane.index,
      type:      node.type,
      phase:     node.phase || 'both',
      hasLaneY:  typeof node.laneY === 'number',
    };
  }

  // ── 4. Resolve same-lane overlaps ────────────────────────────────────────
  // Sort nodes within each lane by x and push overlapping ones rightward so
  // no two shapes share screen space. Snap displaced positions to 10px grid.
  const RESOLVE_GRID = 10;
  const MIN_NODE_GAP = 30; // minimum px gap between node edges (accounts for text overflow)

  const byLane = {};
  for (const entry of Object.values(nodesMap)) {
    if (!byLane[entry.lane]) byLane[entry.lane] = [];
    byLane[entry.lane].push(entry);
  }
  // Annotation nodes render a 12px callout triangle past the right edge.
  const ANNOTATION_CALLOUT = 12;

  for (const laneNodes of Object.values(byLane)) {
    laneNodes.sort((a, b) => a.x - b.x);

    // 4a. Vertically separate task/subprocess nodes that share the same x position.
    // Only applies to non-annotation, non-event nodes that would render on top of
    // each other. Excludes annotations (which float alongside) and small event nodes.
    const SAME_X_THRESHOLD = 5;
    const VERTICAL_GAP = 4; // min vertical gap between stacked nodes (keep tight)
    const STACKABLE_TYPES = new Set(['task', 'subprocess', 'persona', 'agent', 'system']);
    let gi = 0;
    while (gi < laneNodes.length) {
      let gj = gi + 1;
      while (gj < laneNodes.length && Math.abs(laneNodes[gj].x - laneNodes[gi].x) <= SAME_X_THRESHOLD) {
        gj++;
      }
      if (gj - gi > 1) {
        // Filter to only stackable node types that share the same phase.
        // Before/after pairs at the same x are handled by view-mode visibility,
        // not by vertical stacking.
        const candidates = laneNodes.slice(gi, gj).filter(n => STACKABLE_TYPES.has(n.type));
        const byPhase = {};
        for (const n of candidates) {
          const p = n.phase || 'both';
          if (!byPhase[p]) byPhase[p] = [];
          byPhase[p].push(n);
        }
        for (const group of Object.values(byPhase)) {
          if (group.length > 1) {
            const totalH = group.reduce((s, n) => s + n.height, 0) + (group.length - 1) * VERTICAL_GAP;
            const laneEntry = laneMap[group[0].lane];
            const centerY = laneEntry ? laneEntry.centerY : group[0].y;
            let curY = centerY - totalH / 2;
            for (const n of group) {
              n.y      = curY + n.height / 2;
              n.top    = n.y - n.height / 2;
              n.bottom = n.y + n.height / 2;
              n.hasLaneY = true; // Prevent re-centering from undoing vertical separation
              curY    += n.height + VERTICAL_GAP;
            }
          }
        }
      }
      gi = gj;
    }

    // 4b. Push overlapping nodes rightward
    for (let i = 1; i < laneNodes.length; i++) {
      const prev = laneNodes[i - 1];
      const curr = laneNodes[i];
      // Use effective width that accounts for callout triangles on annotations
      const prevEffW = prev.width + (prev.type === 'annotation' ? ANNOTATION_CALLOUT : 0);
      const currEffW = curr.width + (curr.type === 'annotation' ? ANNOTATION_CALLOUT : 0);
      const minDist = (prevEffW + currEffW) / 2 + MIN_NODE_GAP;
      if (curr.x - prev.x < minDist) {
        // Skip horizontal push if nodes are vertically separated (same x, stacked)
        const vertSep = curr.top - prev.bottom;
        if (vertSep >= 0) continue;
        const newX = Math.ceil((prev.x + minDist) / RESOLVE_GRID) * RESOLVE_GRID;
        curr.x     = newX;
        curr.left  = newX - curr.width / 2;
        curr.right = newX + curr.width / 2;
      }
    }
  }

  // ── 4b. Expand lanes & clamp nodes to lane bounds (8.1, 8.2) ───────────
  const LANE_V_PAD = 20;   // padding from lane top/bottom edges

  for (const [laneId, laneNodes] of Object.entries(byLane)) {
    const lane = laneMap[laneId];
    if (!lane || laneNodes.length === 0) continue;

    // Find the actual vertical extent of nodes in this lane
    let minTop = Infinity, maxBottom = -Infinity;
    for (const n of laneNodes) {
      if (n.top < minTop) minTop = n.top;
      if (n.bottom > maxBottom) maxBottom = n.bottom;
    }
    const needed = (maxBottom - minTop) + 2 * LANE_V_PAD;
    if (needed > lane.height) {
      lane.height = needed;
    }
  }

  // Re-stack lanes top-to-bottom since some may have grown.
  let recomputedY = HEADER_H;
  for (const lane of laneList) {
    lane.y       = recomputedY;
    lane.centerY = recomputedY + lane.height / 2;
    recomputedY += lane.height;
  }

  // Re-center nodes in their (possibly updated) lanes
  for (const n of Object.values(nodesMap)) {
    const lane = laneMap[n.lane];
    if (!lane) continue;
    if (!n.hasLaneY) {
      // No explicit laneY — center in lane
      n.y      = lane.centerY;
      n.top    = n.y - n.height / 2;
      n.bottom = n.y + n.height / 2;
    }
  }

  // Boundary clamp (8.2) — keep nodes inside lane bounds
  for (const n of Object.values(nodesMap)) {
    const lane = laneMap[n.lane];
    if (!lane) continue;
    if (n.top < lane.y + LANE_V_PAD) {
      n.y      = lane.y + LANE_V_PAD + n.height / 2;
      n.top    = n.y - n.height / 2;
      n.bottom = n.y + n.height / 2;
    }
    if (n.bottom > lane.y + lane.height - LANE_V_PAD) {
      n.y      = lane.y + lane.height - LANE_V_PAD - n.height / 2;
      n.top    = n.y - n.height / 2;
      n.bottom = n.y + n.height / 2;
    }
  }

  // Recompute width — overlap resolution may have pushed nodes further right
  let resolvedRight = 0;
  for (const n of Object.values(nodesMap)) {
    if (n.right > resolvedRight) resolvedRight = n.right;
  }
  const finalWidth = typeof svgWidth === 'number'
    ? svgWidth
    : Math.max(MIN_SVG_WIDTH, resolvedRight + SVG_RIGHT_PAD);

  // ── 5. Compute content-driven SVG height (8.3) ─────────────────────────
  // Use actual lane geometry instead of a fixed/oversized value.
  const lastLane = laneList[laneList.length - 1];
  const contentBottom = lastLane
    ? lastLane.y + lastLane.height
    : recomputedY;
  const finalHeight = contentBottom + 40;   // 40px bottom margin

  return {
    svgWidth:   finalWidth,
    svgHeight:  finalHeight,
    headerH:    HEADER_H,
    metricsH:   METRICS_H,
    labelColW:  LABEL_COL_W,
    lanes:      laneList,
    nodes:      nodesMap,
    metricsY:   contentBottom,
  };
}

// ─── Lane lookup helper ─────────────────────────────────────────────────────

/**
 * Find which lane an absolute SVG-Y coordinate falls within.
 * Returns the lane ID, or null if outside all lanes.
 * When absY is between lanes or outside, clamps to the nearest lane.
 *
 * @param {number} absY    - Absolute SVG Y coordinate
 * @param {Object} laneMap - laneMap from computeLayout (id → { y, height, ... })
 * @param {Array}  laneList - ordered lane list from computeLayout
 * @returns {string|null} lane ID or null
 */
export function findLaneAtY(absY, laneMap, laneList) {
  if (!laneList || laneList.length === 0) return null;
  for (const lane of laneList) {
    if (absY >= lane.y && absY < lane.y + lane.height) {
      return lane.id;
    }
  }
  // Clamp to nearest lane
  if (absY < laneList[0].y) return laneList[0].id;
  return laneList[laneList.length - 1].id;
}

// ─── Auto-resize lanes ─────────────────────────────────────────────────────

const MIN_LANE_HEIGHT = 120;
const LANE_PADDING    = 80;  // 40px top + 40px bottom

/**
 * Auto-resize all lanes so each lane is tall enough to contain its nodes.
 * Modifies lane.height in-place on the graph.lanes array.
 *
 * @param {Object} graph - The graph object (graph.lanes, graph.nodes)
 */
export function autoResizeLanes(graph) {
  if (!graph || !graph.lanes) return;
  const nodes = graph.nodes || [];

  for (const lane of graph.lanes) {
    const laneNodes = nodes.filter(n => n.lane === lane.id);
    if (laneNodes.length === 0) {
      lane.height = MIN_LANE_HEIGHT;
      continue;
    }
    // laneY is relative to lane top; node bottom = laneY + half height
    let maxBottom = 0;
    for (const n of laneNodes) {
      const dims = NODE_DIMS[n.type] || { w: 110, h: 40 };
      const nodeRelY = typeof n.laneY === 'number' ? n.laneY : (lane.height || MIN_LANE_HEIGHT) / 2;
      const nodeBottom = nodeRelY + dims.h / 2;
      if (nodeBottom > maxBottom) maxBottom = nodeBottom;
    }
    lane.height = Math.max(MIN_LANE_HEIGHT, maxBottom + LANE_PADDING);
  }
}

// ─── Port position geometry ──────────────────────────────────────────────────

/**
 * Return the {x, y} offset from node center for a given port position.
 * For gateway nodes, uses diamond geometry with support for up to 5 outgoing branches.
 * For other node types, uses rectangular edge midpoints.
 *
 * @param {string} nodeType - Node type (e.g. 'gateway', 'task', 'merge')
 * @param {string} portId   - Port identifier: 'in-top', 'in-left', 'in-right',
 *                             'out-right', 'out-left', 'out-bottom', 'out-bl', 'out-br'
 * @param {number} nodeWidth  - Full width of the node
 * @param {number} nodeHeight - Full height of the node
 * @returns {{ x: number, y: number }} Offset from node center
 */
export function getPortPosition(nodeType, portId, nodeWidth, nodeHeight) {
  const w = nodeWidth;
  const h = nodeHeight;

  if (nodeType === 'gateway') {
    // Diamond geometry: tips at top/bottom/left/right of the diamond
    const positions = {
      'in-top':     { x: 0,      y: -h / 2 },
      'out-left':   { x: -w / 2, y: 0 },
      'out-right':  { x: w / 2,  y: 0 },
      'out-bottom': { x: 0,      y: h / 2 },
      'out-bl':     { x: -w / 4, y: h / 4 },
      'out-br':     { x: w / 4,  y: h / 4 },
    };
    return positions[portId] || { x: 0, y: 0 };
  }

  // Rectangular node types — port positions at edge midpoints
  const halfW = w / 2;
  const halfH = h / 2;

  const positions = {
    'in-top':     { x: 0,      y: -halfH },
    'in-left':    { x: -halfW, y: 0 },
    'in-right':   { x: halfW,  y: 0 },
    'out-right':  { x: halfW,  y: 0 },
    'out-bottom': { x: 0,      y: halfH },
    'out-left':   { x: -halfW, y: 0 },
  };
  return positions[portId] || { x: 0, y: 0 };
}

// ─── getConnectionPoints ─────────────────────────────────────────────────────

/**
 * Return the exit point on the source node edge and the entry point on the
 * target node edge for a given routing direction.
 *
 * @param {Object} srcBounds - Node bounds object from layout.nodes (x,y,left,right,top,bottom)
 * @param {Object} tgtBounds - Node bounds object from layout.nodes
 * @param {string} direction - 'right'|'left'|'down'|'up'|'elbow-right-down'|'elbow-right-up'
 * @returns {{ sx: number, sy: number, tx: number, ty: number }}
 */
export function getConnectionPoints(srcBounds, tgtBounds, direction) {
  switch (direction) {
    case 'right':
      // Exit: right edge center of src → Enter: left edge center of tgt
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.left,
        ty: tgtBounds.y,
      };

    case 'left':
      // Exit: left edge center of src → Enter: right edge center of tgt
      return {
        sx: srcBounds.left,
        sy: srcBounds.y,
        tx: tgtBounds.right,
        ty: tgtBounds.y,
      };

    case 'down':
      // Exit: bottom center of src → Enter: top center of tgt
      return {
        sx: srcBounds.x,
        sy: srcBounds.bottom,
        tx: tgtBounds.x,
        ty: tgtBounds.top,
      };

    case 'up':
      // Exit: top center of src → Enter: bottom center of tgt
      return {
        sx: srcBounds.x,
        sy: srcBounds.top,
        tx: tgtBounds.x,
        ty: tgtBounds.bottom,
      };

    case 'elbow-right-down':
      // Exit right, travel right then down into target from top
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.x,
        ty: tgtBounds.top,
      };

    case 'elbow-right-up':
      // Exit right, travel right then up into target from bottom
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.x,
        ty: tgtBounds.bottom,
      };

    default:
      // Fallback: treat as 'right'
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.left,
        ty: tgtBounds.y,
      };
  }
}

// ─── detectDirection ─────────────────────────────────────────────────────────

/**
 * Determine the routing direction between two node bounds.
 *
 * Rules (in priority order):
 *  1. routeHint overrides everything if provided and non-empty.
 *  2. Same lane, src.x < tgt.x  → 'right'
 *  3. Same lane, src.x > tgt.x  → 'left'
 *  4. Same lane, src.x === tgt.x → 'right' (self-loop edge case)
 *  5. src.laneIndex < tgt.laneIndex (going down):
 *       if x positions are close (≤ 20px apart) → 'down'
 *       otherwise                                → 'elbow-right-down'
 *  6. src.laneIndex > tgt.laneIndex (going up):
 *       if x positions are close (≤ 20px apart) → 'up'
 *       otherwise                                → 'elbow-right-up'
 *
 * @param {Object} srcBounds  - Source node bounds (must have x, laneIndex)
 * @param {Object} tgtBounds  - Target node bounds (must have x, laneIndex)
 * @param {string} [routeHint] - Optional explicit direction override from conn.route
 * @returns {string} direction
 */
export function detectDirection(srcBounds, tgtBounds, routeHint) {
  // 1. Honour explicit route hint from the connection definition.
  if (routeHint && routeHint !== 'auto') {
    return routeHint;
  }

  const sameLane = srcBounds.laneIndex === tgtBounds.laneIndex;
  const xDiff    = tgtBounds.x - srcBounds.x;
  const SAME_X_THRESHOLD = 20;   // px — considered "same column"

  if (sameLane) {
    // 2 & 3: Same swimlane — horizontal routing.
    if (xDiff >= 0) return 'right';
    return 'left';
  }

  // Cross-lane routing.
  if (srcBounds.laneIndex < tgtBounds.laneIndex) {
    // Going downward to a lower lane.
    if (Math.abs(xDiff) <= SAME_X_THRESHOLD) return 'down';
    return 'elbow-right-down';
  }

  // Going upward to a higher lane.
  if (Math.abs(xDiff) <= SAME_X_THRESHOLD) return 'up';
  return 'elbow-right-up';
}

// ─── Absolute port position helper ──────────────────────────────────────────

/**
 * Compute the absolute {x, y} pixel position for a specific port on a node,
 * using the node's layout bounds. Delegates to getPortPosition() for offset
 * calculation and adds the node center coordinates.
 *
 * @param {Object} nodeBounds - Node bounds from layout.nodes[nodeId] (x, y, width, height, type)
 * @param {string} portId     - Port identifier (e.g. 'out-right', 'in-top')
 * @returns {{ x: number, y: number }|null} Absolute pixel position, or null if port unknown.
 */
export function getAbsolutePortPosition(nodeBounds, portId) {
  if (!nodeBounds || !portId) return null;

  const offset = getPortPosition(nodeBounds.type, portId, nodeBounds.width, nodeBounds.height);
  if (!offset) return null;

  return {
    x: nodeBounds.x + offset.x,
    y: nodeBounds.y + offset.y,
  };
}

// ─── Gateway port assignment ────────────────────────────────────────────────

/**
 * Return the next available outgoing port name for a gateway node.
 *
 * Checks which outgoing ports are already used by existing connections and
 * returns the first unused port from the priority-ordered list:
 *   'out-right', 'out-left', 'out-bottom', 'out-br', 'out-bl'
 *
 * @param {string} gatewayNodeId       - The gateway node's id.
 * @param {Array}  existingConnections - Array of connection objects (from, sourcePort).
 * @returns {string|null} Next available port name, or null if all 5 are occupied.
 */
export function assignGatewayPort(gatewayNodeId, existingConnections) {
  const GATEWAY_OUT_PORTS = ['out-right', 'out-left', 'out-bottom', 'out-br', 'out-bl'];

  const usedPorts = (existingConnections || [])
    .filter(c => c.from === gatewayNodeId && c.sourcePort)
    .map(c => c.sourcePort);

  const available = GATEWAY_OUT_PORTS.filter(p => !usedPorts.includes(p));
  return available[0] || null;
}

// ─── Auto-Layout (Sugiyama-style simplified) ────────────────────────────────

const LAYER_GAP = 200;   // horizontal distance between layers
const NODE_GAP  = 60;    // minimum vertical distance between nodes in same layer

/**
 * Phase 1 — Layer Assignment via BFS.
 * Each node's layer = longest path from start-event.
 * Merge nodes get max(incoming layers) + 1.
 */
function assignLayers(graph) {
  const layers = {};
  const start = graph.nodes.find(n => n.type === 'start-event');
  if (!start) return layers;

  // Build adjacency: outgoing edges per node
  const outgoing = {};
  const incoming = {};
  for (const conn of graph.connections) {
    if (!outgoing[conn.from]) outgoing[conn.from] = [];
    outgoing[conn.from].push(conn.to);
    if (!incoming[conn.to]) incoming[conn.to] = [];
    incoming[conn.to].push(conn.from);
  }

  // BFS allowing revisits to compute longest path
  const queue = [{ id: start.id, layer: 0 }];

  while (queue.length) {
    const { id, layer } = queue.shift();

    // Keep the longest path to each node
    if (layers[id] !== undefined && layer <= layers[id]) {
      continue;
    }
    layers[id] = layer;

    const outs = outgoing[id] || [];
    for (const toId of outs) {
      queue.push({ id: toId, layer: layer + 1 });
    }
  }

  // Second pass: merge nodes — ensure layer >= max(incoming layers) + 1
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;
    for (const node of graph.nodes) {
      const inc = incoming[node.id];
      if (!inc || inc.length <= 1) continue;
      const maxIncoming = Math.max(...inc.map(id => layers[id] ?? 0));
      const desired = maxIncoming + 1;
      if ((layers[node.id] ?? 0) < desired) {
        layers[node.id] = desired;
        changed = true;
        // Propagate to downstream nodes
        const outs = outgoing[node.id] || [];
        for (const toId of outs) {
          const downDesired = desired + 1;
          if ((layers[toId] ?? 0) < downDesired) {
            layers[toId] = downDesired;
          }
        }
      }
    }
  }

  return layers;
}

/**
 * Phase 2 — Node Ordering within layers.
 * Sort by swimlane first, then by barycenter heuristic.
 */
function orderNodesInLayers(layerGroups, graph) {
  const incoming = {};
  for (const conn of graph.connections) {
    if (!incoming[conn.to]) incoming[conn.to] = [];
    incoming[conn.to].push(conn.from);
  }

  const nodeMap = {};
  for (const node of graph.nodes) nodeMap[node.id] = node;

  const laneIdx = {};
  (graph.lanes || []).forEach((l, i) => { laneIdx[l.id] = i; });

  // Position map: nodeId -> position within its layer
  const posMap = {};
  for (const nodeIds of layerGroups) {
    nodeIds.forEach((id, pos) => { posMap[id] = pos; });
  }

  // Iterate 3 times for convergence
  for (let iter = 0; iter < 3; iter++) {
    for (let li = 1; li < layerGroups.length; li++) {
      const nodeIds = layerGroups[li];

      const barycenters = {};
      for (const id of nodeIds) {
        const inc = incoming[id] || [];
        if (inc.length === 0) {
          barycenters[id] = 0;
        } else {
          const sum = inc.reduce((s, fromId) => s + (posMap[fromId] ?? 0), 0);
          barycenters[id] = sum / inc.length;
        }
      }

      nodeIds.sort((a, b) => {
        const la = laneIdx[nodeMap[a]?.lane] ?? 0;
        const lb = laneIdx[nodeMap[b]?.lane] ?? 0;
        if (la !== lb) return la - lb;
        return (barycenters[a] ?? 0) - (barycenters[b] ?? 0);
      });

      nodeIds.forEach((id, pos) => { posMap[id] = pos; });
    }
  }
}

/**
 * Phase 4 — Simple crossing reduction.
 * Swap adjacent same-lane nodes within layers to reduce edge crossings.
 */
function reduceCrossings(layerGroups, graph) {
  const outgoing = {};
  for (const conn of graph.connections) {
    if (!outgoing[conn.from]) outgoing[conn.from] = [];
    outgoing[conn.from].push(conn.to);
  }

  const nodeMap = {};
  for (const node of graph.nodes) nodeMap[node.id] = node;

  const laneIdx = {};
  (graph.lanes || []).forEach((l, i) => { laneIdx[l.id] = i; });

  function countCrossings(layer1, layer2) {
    let crossings = 0;
    const posInL2 = {};
    layer2.forEach((id, i) => { posInL2[id] = i; });

    const edges = [];
    for (let i = 0; i < layer1.length; i++) {
      const outs = outgoing[layer1[i]] || [];
      for (const toId of outs) {
        if (posInL2[toId] !== undefined) {
          edges.push([i, posInL2[toId]]);
        }
      }
    }

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) {
          crossings++;
        }
      }
    }
    return crossings;
  }

  for (let iter = 0; iter < 3; iter++) {
    for (let li = 1; li < layerGroups.length; li++) {
      const layer = layerGroups[li];
      const prevLayer = layerGroups[li - 1];
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < layer.length - 1; i++) {
          const laneA = laneIdx[nodeMap[layer[i]]?.lane] ?? 0;
          const laneB = laneIdx[nodeMap[layer[i + 1]]?.lane] ?? 0;
          if (laneA !== laneB) continue;

          const before = countCrossings(prevLayer, layer);
          [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
          const after = countCrossings(prevLayer, layer);
          if (after < before) {
            improved = true;
          } else {
            [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
          }
        }
      }
    }
  }
}

/**
 * Auto-layout: arrange nodes left-to-right in layers (Sugiyama-style simplified).
 * Preserves lane assignments — only changes x and laneY positions.
 * Mutates node.x and node.laneY in-place on graph.nodes.
 *
 * @param {Object} graph — the graph object (graph.nodes, graph.connections, graph.lanes)
 */
export function autoLayout(graph) {
  if (!graph || !graph.nodes || !graph.nodes.length) return;

  // Phase 1: assign layers
  const layers = assignLayers(graph);

  // Organize into layer groups: array of arrays of node IDs
  const maxLayer = Math.max(0, ...Object.values(layers));
  const layerGroups = Array.from({ length: maxLayer + 1 }, () => []);
  for (const [nodeId, layer] of Object.entries(layers)) {
    layerGroups[layer].push(nodeId);
  }

  // Include any unassigned nodes (disconnected) in layer 0
  for (const node of graph.nodes) {
    if (layers[node.id] === undefined) {
      layerGroups[0].push(node.id);
      layers[node.id] = 0;
    }
  }

  // Phase 2: order nodes within layers
  orderNodesInLayers(layerGroups, graph);

  // Phase 4: crossing reduction (before coordinate assignment)
  reduceCrossings(layerGroups, graph);

  // Phase 3: coordinate assignment
  const laneHeights = {};
  for (const lane of (graph.lanes || [])) {
    laneHeights[lane.id] = typeof lane.height === 'number' ? lane.height : DEFAULT_LANE_HEIGHT;
  }

  const nodeMap = {};
  for (const node of graph.nodes) nodeMap[node.id] = node;

  for (let li = 0; li < layerGroups.length; li++) {
    const nodeIds = layerGroups[li];

    // Group by lane
    const byLane = {};
    for (const id of nodeIds) {
      const node = nodeMap[id];
      if (!node) continue;
      const lane = node.lane || '';
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(node);
    }

    // Assign coordinates per lane
    for (const [laneId, laneNodes] of Object.entries(byLane)) {
      const laneH = laneHeights[laneId] || DEFAULT_LANE_HEIGHT;

      // Compute total block height for centering
      const totalNodesH = laneNodes.reduce((sum, n) => {
        const dims = NODE_DIMS[n.type] || { w: 110, h: 40 };
        return sum + dims.h;
      }, 0);
      const totalGap = Math.max(0, (laneNodes.length - 1) * NODE_GAP);
      const blockH = totalNodesH + totalGap;
      let startY = (laneH - blockH) / 2;

      for (const node of laneNodes) {
        const dims = NODE_DIMS[node.type] || { w: 110, h: 40 };
        node.x = li * LAYER_GAP + 100;
        node.laneY = startY + dims.h / 2;
        startY += dims.h + NODE_GAP;
      }
    }
  }

  // Auto-resize lanes to fit content
  for (const lane of (graph.lanes || [])) {
    const laneNodes = graph.nodes.filter(n => n.lane === lane.id);
    if (!laneNodes.length) continue;

    let maxBottom = 0;
    for (const node of laneNodes) {
      const dims = NODE_DIMS[node.type] || { w: 110, h: 40 };
      const bottom = (node.laneY || 0) + dims.h / 2 + 20;
      if (bottom > maxBottom) maxBottom = bottom;
    }

    const minHeight = Math.max(DEFAULT_LANE_HEIGHT, maxBottom);
    if (lane.height === undefined || lane.height < minHeight) {
      lane.height = minHeight;
    }
  }

  // ── Re-center nodes after lane resize (8.4) ───────────────────────────
  // After lanes have been resized, re-center the node group within each lane.
  for (const lane of (graph.lanes || [])) {
    const laneNodes = graph.nodes.filter(n => n.lane === lane.id);
    if (!laneNodes.length) continue;

    const laneH = lane.height || DEFAULT_LANE_HEIGHT;

    // Compute current bounding box of nodes (using laneY, which is relative to lane top)
    let minY = Infinity, maxY = -Infinity;
    for (const node of laneNodes) {
      const dims = NODE_DIMS[node.type] || { w: 110, h: 40 };
      const top    = (node.laneY || 0) - dims.h / 2;
      const bottom = (node.laneY || 0) + dims.h / 2;
      if (top < minY)    minY = top;
      if (bottom > maxY)  maxY = bottom;
    }

    const blockH   = maxY - minY;
    const idealTop = (laneH - blockH) / 2;
    const shift    = idealTop - minY;

    if (Math.abs(shift) > 1) {
      for (const node of laneNodes) {
        node.laneY = (node.laneY || 0) + shift;
      }
    }
  }
}
