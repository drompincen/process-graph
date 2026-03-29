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

    // 4b. Push overlapping nodes rightward
    for (let i = 1; i < laneNodes.length; i++) {
      const prev = laneNodes[i - 1];
      const curr = laneNodes[i];
      // Use effective width that accounts for callout triangles on annotations
      const prevEffW = prev.width + (prev.type === 'annotation' ? ANNOTATION_CALLOUT : 0);
      const currEffW = curr.width + (curr.type === 'annotation' ? ANNOTATION_CALLOUT : 0);
      const minDist = (prevEffW + currEffW) / 2 + MIN_NODE_GAP;
      if (curr.x - prev.x < minDist) {
        // Skip horizontal push if nodes are vertically separated (explicit laneY)
        if (curr.hasLaneY && prev.hasLaneY) {
          const vertSep = curr.top - prev.bottom;
          if (vertSep >= 0) continue;
        }
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
      // Exit right edge center of src, enter left edge center of tgt
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.left,
        ty: tgtBounds.y,
      };

    case 'elbow-right-up':
      // Exit right edge center of src, enter left edge center of tgt
      return {
        sx: srcBounds.right,
        sy: srcBounds.y,
        tx: tgtBounds.left,
        ty: tgtBounds.y,
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
  // When horizontal offset dominates (absDx > absDy * 1.5), use horizontal
  // routing so the arrow enters from LEFT/RIGHT — matching the visual expectation
  // that a primarily-horizontal connection enters from the side.
  // When vertical offset dominates or is comparable, use vertical routing
  // (V-H-V) so the arrow enters from TOP/BOTTOM.
  const absDx = Math.abs(xDiff);
  const absDy = Math.abs(tgtBounds.y - srcBounds.y);

  if (absDx > absDy * 1.5) {
    // Horizontal offset dominates — route horizontally even across lanes
    if (xDiff >= 0) return 'right';
    return 'left';
  }

  if (srcBounds.laneIndex < tgtBounds.laneIndex) {
    return 'down';
  }
  return 'up';
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

