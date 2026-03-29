/**
 * routing.js — Orthogonal path routing for process-graph connections
 *
 * Computes SVG path `d` strings and arrowhead polygon point strings
 * for straight, vertical, cross-lane, elbow, and loop-back connections.
 *
 * Each path constructor returns:
 *   { pathD, arrowPoints, arrowFill, labelX, labelY, direction }
 */

import { detectDirection, getConnectionPoints, getPortPosition } from './layout.js';
import { state, dom } from './state.js';
import { isVisible } from './data.js';
import { normalizePhases, isVisibleAtPhase } from './phase.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum distance (px) arrow waypoints must maintain from non-connected node edges. */
const ARROW_PADDING = 12;

// Cached reference to layout.nodes for midX computation during path construction
let _currentNodesMap = null;
let _currentFromId = null;
let _currentToId = null;

/**
 * Find a midX for Z-bend routing that avoids all non-connected nodes.
 * Checks if the default midX would land inside any node's padded bounds
 * in the vertical range [minY, maxY], and shifts it if needed.
 */
function safeMidX(defaultMidX, minY, maxY, fromId, toId) {
  if (!_currentNodesMap) return defaultMidX;
  let midX = defaultMidX;
  for (let iter = 0; iter < 5; iter++) {
    let blocked = false;
    for (const [id, bounds] of Object.entries(_currentNodesMap)) {
      if (id === fromId || id === toId) continue;
      const padL = bounds.left - ARROW_PADDING;
      const padR = bounds.right + ARROW_PADDING;
      const padT = bounds.top - ARROW_PADDING;
      const padB = bounds.bottom + ARROW_PADDING;
      if (padB < minY || padT > maxY) continue;
      if (midX > padL && midX < padR) {
        // midX is inside this node — push to nearest edge
        midX = Math.abs(midX - padL) <= Math.abs(midX - padR) ? padL : padR;
        blocked = true;
      }
    }
    if (!blocked) break;
  }
  return midX;
}

/**
 * Find a midY for V-H-V routing that avoids all non-connected nodes.
 * Checks if the default midY would land inside any node's padded bounds
 * in the horizontal range [minX, maxX], and shifts it if needed.
 */
function safeMidY(defaultMidY, minX, maxX, fromId, toId) {
  if (!_currentNodesMap) return defaultMidY;
  let midY = defaultMidY;
  for (let iter = 0; iter < 5; iter++) {
    let blocked = false;
    for (const [id, bounds] of Object.entries(_currentNodesMap)) {
      if (id === fromId || id === toId) continue;
      const padL = bounds.left - ARROW_PADDING;
      const padR = bounds.right + ARROW_PADDING;
      const padT = bounds.top - ARROW_PADDING;
      const padB = bounds.bottom + ARROW_PADDING;
      if (padR < minX || padL > maxX) continue; // outside x range
      if (midY > padT && midY < padB) {
        // midY is inside this node — push to nearest edge
        midY = Math.abs(midY - padT) <= Math.abs(midY - padB) ? padT : padB;
        blocked = true;
      }
    }
    if (!blocked) break;
  }
  return midY;
}

// Local svgEl — avoids circular dependency with renderer.js
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ─── Geometric path helpers ───────────────────────────────────────────────────

/**
 * Compute the Euclidean distance between two 2D points.
 */
function segDist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Walk along the polyline defined by `waypoints` and return the (x, y) point
 * at the given fraction (0..1) of total path length.
 *
 * @param {Array<[number,number]>} waypoints - Ordered [x,y] pairs.
 * @param {number} fraction - 0 = start, 1 = end, 0.5 = geometric midpoint.
 * @returns {{ x: number, y: number }}
 */
function computePointOnPath(waypoints, fraction) {
  if (!waypoints || waypoints.length === 0) return { x: 0, y: 0 };
  if (waypoints.length === 1) return { x: waypoints[0][0], y: waypoints[0][1] };

  const segLengths = [];
  let totalLength = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = segDist(waypoints[i - 1][0], waypoints[i - 1][1], waypoints[i][0], waypoints[i][1]);
    segLengths.push(d);
    totalLength += d;
  }

  if (totalLength === 0) return { x: waypoints[0][0], y: waypoints[0][1] };

  const target = totalLength * Math.max(0, Math.min(1, fraction));
  let accumulated = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= target) {
      const t = segLen > 0 ? (target - accumulated) / segLen : 0;
      const [ax, ay] = waypoints[i];
      const [bx, by] = waypoints[i + 1];
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    accumulated += segLen;
  }

  const last = waypoints[waypoints.length - 1];
  return { x: last[0], y: last[1] };
}

/**
 * Compute label position using the geometric midpoint of the entire arrow path.
 * For decision branches (yes/no), the label is placed on the first segment,
 * close to the gateway but offset enough to not overlap the diamond shape.
 * For normal labels, it is placed at the geometric midpoint (50%).
 * The label is offset perpendicular to the segment direction for readability.
 *
 * @param {string} pathD - SVG path d string.
 * @param {object} conn  - Connection object (decision?, label?).
 * @returns {{ labelX: number, labelY: number }|null} Null if path has < 2 waypoints.
 */
function computeLabelPosition(pathD, conn) {
  const waypoints = parsePathWaypoints(pathD);
  if (waypoints.length < 2) return null;

  const isDecision = (conn.decision === 'yes' || conn.decision === 'no');

  if (isDecision) {
    // Place label on the first horizontal segment of the path, close to the
    // gateway but far enough to clear the diamond shape.
    // For Z-bends (4+ waypoints), find the first horizontal segment.
    let segIdx = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = Math.abs(waypoints[i][0] - waypoints[i-1][0]);
      const dy = Math.abs(waypoints[i][1] - waypoints[i-1][1]);
      if (dx > dy && dx > 5) { segIdx = i - 1; break; }
    }
    // For multi-segment paths, skip the first horizontal segment (too close to
    // gateway) and use the next horizontal segment if available.
    if (waypoints.length >= 4 && segIdx === 0) {
      for (let i = 2; i < waypoints.length; i++) {
        const dx = Math.abs(waypoints[i][0] - waypoints[i-1][0]);
        const dy = Math.abs(waypoints[i][1] - waypoints[i-1][1]);
        if (dx > dy && dx > 5) { segIdx = i - 1; break; }
      }
    }
    const [ax, ay] = waypoints[segIdx];
    const [bx, by] = waypoints[segIdx + 1] || waypoints[segIdx];
    const segLen = segDist(ax, ay, bx, by);
    // Place 25px along the segment (or at 30% if segment is short)
    const t = segLen > 0 ? Math.min(0.3, 25 / segLen) : 0;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;

    const isHorizontal = Math.abs(by - ay) < Math.abs(bx - ax);
    const OFFSET = 22;
    const sign = conn.decision === 'no' ? 1 : -1;
    return {
      labelX: px + (isHorizontal ? 0 : sign * OFFSET),
      labelY: py + (isHorizontal ? sign * OFFSET : 0),
    };
  }

  // Normal labels: geometric midpoint at 50%
  const fraction = 0.5;
  const pt = computePointOnPath(waypoints, fraction);

  // Determine which segment the point falls on for perpendicular offset direction
  let totalLength = 0;
  const segLengths = [];
  for (let i = 1; i < waypoints.length; i++) {
    segLengths.push(segDist(waypoints[i - 1][0], waypoints[i - 1][1], waypoints[i][0], waypoints[i][1]));
    totalLength += segLengths[segLengths.length - 1];
  }
  const targetLen = totalLength * fraction;
  let acc = 0;
  let segIdx = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (acc + segLengths[i] >= targetLen) { segIdx = i; break; }
    acc += segLengths[i];
  }

  const [ax, ay] = waypoints[segIdx];
  const [bx, by] = waypoints[segIdx + 1];
  const isHorizontal = Math.abs(by - ay) < Math.abs(bx - ax);

  // Offset perpendicular: above for horizontal segments, to the right for vertical
  const OFFSET = 10;
  return {
    labelX: pt.x + (isHorizontal ? 0 : OFFSET),
    labelY: pt.y + (isHorizontal ? -OFFSET : 0),
  };
}

// ─── Arrow padding enforcement ────────────────────────────────────────────────

/**
 * Push intermediate waypoints away from non-connected node bounding boxes.
 * Ensures all intermediate waypoints maintain at least ARROW_PADDING distance
 * from any node edge that is NOT the source or target of the connection.
 *
 * @param {Array<[number,number]>} waypoints - Path waypoints (mutated in place).
 * @param {object} nodesMap  - layout.nodes map (id -> bounds).
 * @param {string} fromId    - Source node id (excluded from padding check).
 * @param {string} toId      - Target node id (excluded from padding check).
 * @returns {Array<[number,number]>} The adjusted waypoints array.
 */
/**
 * Test if an axis-aligned line segment intersects a rectangle.
 * @returns {boolean}
 */
function segmentIntersectsRect(x1, y1, x2, y2, r) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  // No overlap if ranges don't intersect
  if (maxX <= r.left || minX >= r.right || maxY <= r.top || minY >= r.bottom) return false;
  return true;
}

function addPaddingToWaypoints(waypoints, nodesMap, fromId, toId) {
  if (!nodesMap || waypoints.length < 2) return waypoints;

  // Collect padded bounding boxes of non-connected nodes
  const rects = [];
  for (const [id, bounds] of Object.entries(nodesMap)) {
    if (id === fromId || id === toId) continue;
    rects.push({
      id,
      left:   bounds.left   - ARROW_PADDING,
      right:  bounds.right  + ARROW_PADDING,
      top:    bounds.top    - ARROW_PADDING,
      bottom: bounds.bottom + ARROW_PADDING,
    });
  }

  if (rects.length === 0) return waypoints;

  // Phase 1: Push corner waypoints that are inside nodes.
  // At H->V corners push x; at V->H corners push y. This preserves orthogonality.
  for (let i = 1; i < waypoints.length - 1; i++) {
    let [wx, wy] = waypoints[i];
    for (const r of rects) {
      if (wx > r.left && wx < r.right && wy > r.top && wy < r.bottom) {
        const [prevX, prevY] = waypoints[i - 1];
        const [nextX, nextY] = waypoints[i + 1];
        const inH = Math.abs(prevY - wy) < 1;
        const outV = Math.abs(nextX - wx) < 1;
        const inV = Math.abs(prevX - wx) < 1;
        const outH = Math.abs(nextY - wy) < 1;
        if (inH && outV) {
          // H->V corner: push x
          wx = Math.abs(wx - r.left) <= Math.abs(wx - r.right) ? r.left : r.right;
        } else if (inV && outH) {
          // V->H corner: push y
          wy = Math.abs(wy - r.top) <= Math.abs(wy - r.bottom) ? r.top : r.bottom;
        }
        waypoints[i] = [wx, wy];
      }
    }
  }

  // Phase 2: Segment-level node avoidance (up to 6 passes).
  // For each segment that hits nodes, find a detour that avoids ALL nodes
  // in the corridor (both for the detour segment AND vertical/horizontal legs).
  for (let pass = 0; pass < 4; pass++) {
  let anyChanged = false;
  for (let i = waypoints.length - 1; i >= 1; i--) {
    const [x1, y1] = waypoints[i - 1];
    const [x2, y2] = waypoints[i];
    if (Math.abs(x2 - x1) < 2 && Math.abs(y2 - y1) < 2) continue;
    const isHoriz = Math.abs(y2 - y1) < 1;
    const isVert  = Math.abs(x2 - x1) < 1;
    if (!isHoriz && !isVert) continue;
    const hits = rects.filter(r => segmentIntersectsRect(x1, y1, x2, y2, r));
    if (hits.length === 0) continue;
    if (isHoriz) {
      const segMinX = Math.min(x1, x2);
      const segMaxX = Math.max(x1, x2);
      // Find clear y above and below all nodes in the segment's x-range
      let clearAbove = y1 - 1;
      let clearBelow = y1 + 1;
      for (let iter = 0; iter < 10; iter++) {
        let blocked = false;
        for (const r of rects) {
          if (r.right <= segMinX || r.left >= segMaxX) continue;
          if (clearAbove > r.top && clearAbove < r.bottom) { clearAbove = r.top; blocked = true; }
          if (clearBelow > r.top && clearBelow < r.bottom) { clearBelow = r.bottom; blocked = true; }
        }
        if (!blocked) break;
      }
      const detourY = Math.abs(y1 - clearAbove) <= Math.abs(y1 - clearBelow) ? clearAbove : clearBelow;
      if (Math.abs(detourY - y1) < 2) continue;
      // Find enterX/exitX that keep vertical legs clear.
      // The vertical legs go from y1 to detourY at enterX and exitX.
      const detMinY = Math.min(y1, detourY);
      const detMaxY = Math.max(y1, detourY);
      // Start with the first/last blocking node edges
      let eX = x1 < x2 ? Math.min(...hits.map(r => r.left)) : Math.max(...hits.map(r => r.right));
      let xX = x1 < x2 ? Math.max(...hits.map(r => r.right)) : Math.min(...hits.map(r => r.left));
      // Expand eX/xX if the vertical legs would hit any node
      for (let iter = 0; iter < 5; iter++) {
        let expanded = false;
        for (const r of rects) {
          if (r.bottom <= detMinY || r.top >= detMaxY) continue;
          // Check if eX is inside this rect
          if (eX > r.left && eX < r.right) {
            eX = x1 < x2 ? r.left : r.right;
            expanded = true;
          }
          // Check if xX is inside this rect
          if (xX > r.left && xX < r.right) {
            xX = x1 < x2 ? r.right : r.left;
            expanded = true;
          }
        }
        if (!expanded) break;
      }
      // Also check the horizontal detour segment at detourY
      const detSegMinX = Math.min(eX, xX);
      const detSegMaxX = Math.max(eX, xX);
      let detourClear = true;
      for (const r of rects) {
        if (r.right <= detSegMinX || r.left >= detSegMaxX) continue;
        if (detourY > r.top && detourY < r.bottom) { detourClear = false; break; }
      }
      if (!detourClear) {
        // Fallback: use segment endpoints for vertical legs (2-point detour)
        waypoints.splice(i, 0, [x1, detourY], [x2, detourY]);
      } else {
        waypoints.splice(i, 0, [eX, y1], [eX, detourY], [xX, detourY], [xX, y1]);
      }
      anyChanged = true;
    } else {
      const segMinY = Math.min(y1, y2);
      const segMaxY = Math.max(y1, y2);
      let clearLeft = x1 - 1;
      let clearRight = x1 + 1;
      for (let iter = 0; iter < 10; iter++) {
        let blocked = false;
        for (const r of rects) {
          if (r.bottom <= segMinY || r.top >= segMaxY) continue;
          if (clearLeft > r.left && clearLeft < r.right) { clearLeft = r.left; blocked = true; }
          if (clearRight > r.left && clearRight < r.right) { clearRight = r.right; blocked = true; }
        }
        if (!blocked) break;
      }
      const detourX = Math.abs(x1 - clearLeft) <= Math.abs(x1 - clearRight) ? clearLeft : clearRight;
      if (Math.abs(detourX - x1) < 2) continue;
      const detMinX = Math.min(x1, detourX);
      const detMaxX = Math.max(x1, detourX);
      let eY = y1 < y2 ? Math.min(...hits.map(r => r.top)) : Math.max(...hits.map(r => r.bottom));
      let xY = y1 < y2 ? Math.max(...hits.map(r => r.bottom)) : Math.min(...hits.map(r => r.top));
      for (let iter = 0; iter < 5; iter++) {
        let expanded = false;
        for (const r of rects) {
          if (r.right <= detMinX || r.left >= detMaxX) continue;
          if (eY > r.top && eY < r.bottom) {
            eY = y1 < y2 ? r.top : r.bottom;
            expanded = true;
          }
          if (xY > r.top && xY < r.bottom) {
            xY = y1 < y2 ? r.bottom : r.top;
            expanded = true;
          }
        }
        if (!expanded) break;
      }
      waypoints.splice(i, 0, [x1, eY], [detourX, eY], [detourX, xY], [x1, xY]);
      anyChanged = true;
    }
  }
  if (!anyChanged) break;
  }

  return waypoints;
}

/**
 * Rebuild an SVG path d string from waypoints.
 * @param {Array<[number,number]>} waypoints
 * @returns {string}
 */
function rebuildPathD(waypoints) {
  if (waypoints.length === 0) return '';
  // Ensure all segments are orthogonal: if a segment has both dx and dy,
  // insert an intermediate waypoint to create an L-bend.
  const ortho = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const prev = ortho[ortho.length - 1];
    const curr = waypoints[i];
    const dx = Math.abs(curr[0] - prev[0]);
    const dy = Math.abs(curr[1] - prev[1]);
    if (dx > 1 && dy > 1) {
      // Diagonal — break into H then V (horizontal first)
      ortho.push([curr[0], prev[1]]);
    }
    ortho.push(curr);
  }
  return ortho.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0]},${pt[1]}`).join(' ');
}

// ─── Cross-lane handoff detection & rendering ─────────────────────────────────

/**
 * Detect whether a connection crosses from one swimlane to another.
 *
 * @param {object} conn   - Connection object.
 * @param {object} layout - Layout with nodes and lanes.
 * @returns {boolean}
 */
function isCrossLane(conn, layout) {
  const src = layout.nodes[conn.from];
  const tgt = layout.nodes[conn.to];
  if (!src || !tgt) return false;
  return src.laneIndex !== tgt.laneIndex;
}

/**
 * Find the point where the path crosses a lane boundary.
 *
 * @param {string} pathD       - SVG path d string.
 * @param {object} layout      - Layout with lanes array.
 * @param {object} srcBounds   - Source node bounds.
 * @param {object} tgtBounds   - Target node bounds.
 * @returns {{ x: number, y: number }|null}
 */
function findLaneBoundaryCrossing(pathD, layout, srcBounds, tgtBounds) {
  const waypoints = parsePathWaypoints(pathD);
  if (waypoints.length < 2) return null;

  const minIdx = Math.min(srcBounds.laneIndex, tgtBounds.laneIndex);
  const maxIdx = Math.max(srcBounds.laneIndex, tgtBounds.laneIndex);

  // Collect boundary Y values (bottom edge of each lane between min and max)
  const boundaryYs = [];
  for (let li = minIdx; li < maxIdx; li++) {
    const lane = layout.lanes[li];
    if (lane) boundaryYs.push(lane.y + lane.height);
  }

  if (boundaryYs.length === 0) return null;

  // Walk segments and find the first crossing of any boundary
  for (let i = 1; i < waypoints.length; i++) {
    const [x1, y1] = waypoints[i - 1];
    const [x2, y2] = waypoints[i];

    for (const bY of boundaryYs) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (minY <= bY && maxY >= bY) {
        if (Math.abs(y2 - y1) < 0.01) {
          // Horizontal segment at or near boundary
          return { x: (x1 + x2) / 2, y: bY };
        }
        const t = (bY - y1) / (y2 - y1);
        return { x: x1 + (x2 - x1) * t, y: bY };
      }
    }
  }

  return null;
}

/**
 * Render a handoff indicator (dashed circle + transfer icon) at a lane crossing.
 *
 * @param {SVGElement} layer - SVG layer to append into.
 * @param {number} cx        - Center x of the indicator.
 * @param {number} cy        - Center y of the indicator.
 */
function renderHandoffIndicator(layer, cx, cy) {
  const g = svgEl('g', { class: 'handoff-indicator' });

  g.appendChild(svgEl('circle', {
    cx: cx,
    cy: cy,
    r: 8,
    fill: 'none',
    stroke: '#94a3b8',
    'stroke-width': '1.2',
    'stroke-dasharray': '3,2',
    opacity: '0.55',
  }));

  const text = svgEl('text', {
    x: cx,
    y: cy + 3.5,
    'text-anchor': 'middle',
    fill: '#94a3b8',
    'font-size': '9',
    opacity: '0.6',
    'pointer-events': 'none',
  });
  text.textContent = '\u21C4'; // transfer arrows
  g.appendChild(text);

  layer.appendChild(g);
}

// ─── Color + Stroke helpers ──────────────────────────────────────────────────

/**
 * Returns the stroke color for a connection based on its type.
 * @param {object} conn - Connection object with a `type` property.
 * @returns {string} CSS color string.
 */
export function connColor(conn) {
  switch (conn.type) {
    case 'message':     return '#60a5fa';
    case 'conditional': return '#f59e0b';
    default:            return '#475569';
  }
}

/**
 * Returns an object of SVG stroke attributes for a connection.
 * @param {object} conn - Connection object with a `type` property.
 * @returns {object} SVG attribute key/value pairs.
 */
export function connStrokeAttrs(conn) {
  switch (conn.type) {
    case 'message':
      return { 'stroke-dasharray': '5,4', 'stroke-width': '1.6', 'opacity': '0.9' };
    case 'conditional':
      return { 'stroke-dasharray': '4,3', 'stroke-width': '1.6', 'opacity': '0.9' };
    default:
      return { 'stroke-width': '1.8' };
  }
}

// ─── Arrowhead polygon ───────────────────────────────────────────────────────

/**
 * Returns a polygon `points` string for a filled arrowhead.
 * The arrowhead is 9px long and 4px wide on each side of the shaft axis.
 *
 * @param {'right'|'left'|'down'|'up'} direction - Direction the arrow points.
 * @param {number} tipX - X coordinate of the arrowhead tip.
 * @param {number} tipY - Y coordinate of the arrowhead tip.
 * @returns {string} SVG polygon points attribute value.
 */
export function arrowPolygon(direction, tipX, tipY) {
  switch (direction) {
    case 'right':
      return `${tipX},${tipY} ${tipX - 9},${tipY - 4} ${tipX - 9},${tipY + 4}`;
    case 'left':
      return `${tipX},${tipY} ${tipX + 9},${tipY - 4} ${tipX + 9},${tipY + 4}`;
    case 'down':
      return `${tipX},${tipY} ${tipX - 4},${tipY - 9} ${tipX + 4},${tipY - 9}`;
    case 'up':
      return `${tipX},${tipY} ${tipX - 4},${tipY + 9} ${tipX + 4},${tipY + 9}`;
    default:
      return `${tipX},${tipY} ${tipX - 9},${tipY - 4} ${tipX - 9},${tipY + 4}`;
  }
}

// ─── Path constructors ───────────────────────────────────────────────────────

/**
 * Straight horizontal path (same lane, left -> right).
 * The path stops 9px short of the target center so the arrowhead tip
 * lands exactly on the target edge.
 *
 * @param {number} sx - Source x (exit point).
 * @param {number} sy - Source y (exit point).
 * @param {number} tx - Target x (entry point / arrowhead tip).
 * @param {number} ty - Target y (entry point / arrowhead tip).
 * @param {object} conn - Connection object.
 * @returns {{ pathD, arrowPoints, arrowFill, labelX, labelY, direction }}
 */
export function straightHoriz(sx, sy, tx, ty, conn) {
  let pathD;
  if (Math.abs(sy - ty) < 1) {
    // Perfectly horizontal
    pathD = `M ${sx},${sy} L ${tx - 9},${sy}`;
  } else {
    // Different y — Z-bend: horizontal, vertical, horizontal
    const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
    pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
  }
  return {
    pathD,
    arrowPoints: arrowPolygon('right', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: Math.min(sy, ty) - 10,
    direction: 'right',
  };
}

/**
 * Straight horizontal-left path for cross-lane connections where the target
 * is to the left of the source. Routes: exit left edge of src, Z-bend
 * (horizontal-vertical-horizontal), enter right edge of tgt.
 * The arrow enters from the RIGHT, matching QA expectations.
 *
 * @param {number} sx - Source x (left edge of source).
 * @param {number} sy - Source y.
 * @param {number} tx - Target x (right edge of target).
 * @param {number} ty - Target y.
 * @param {object} conn - Connection object.
 * @returns {{ pathD, arrowPoints, arrowFill, labelX, labelY, direction }}
 */
export function straightHorizLeft(sx, sy, tx, ty, conn) {
  let pathD;
  if (Math.abs(sy - ty) < 1) {
    // Perfectly horizontal
    pathD = `M ${sx},${sy} L ${tx + 9},${sy}`;
  } else {
    // Different y — Z-bend: horizontal, vertical, horizontal
    const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
    pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx + 9},${ty}`;
  }
  return {
    pathD,
    arrowPoints: arrowPolygon('left', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: Math.min(sy, ty) - 10,
    direction: 'left',
  };
}

/**
 * Straight vertical path (same x-column, different lanes or same lane).
 * Handles both downward (sy < ty) and upward (sy > ty) directions.
 * The path stops 9px short of the target so the arrowhead tip is exact.
 *
 * @param {number} sx - Source x.
 * @param {number} sy - Source y (exit point).
 * @param {number} tx - Target x.
 * @param {number} ty - Target y (entry point / arrowhead tip).
 * @param {object} conn - Connection object.
 * @returns {{ pathD, arrowPoints, arrowFill, labelX, labelY, direction }}
 */
export function straightVert(sx, sy, tx, ty, conn) {
  if (sy < ty) {
    // Downward — enter target from TOP
    let pathD;
    if (Math.abs(sx - tx) < 1) {
      pathD = `M ${sx},${sy} L ${tx},${ty - 9}`;
    } else {
      // L-bend: horizontal to target x, then vertical down to target top
      // Check if horizontal segment at sy passes through any node
      const safeY = safeMidY(sy, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
      if (Math.abs(safeY - sy) < 1) {
        pathD = `M ${sx},${sy} L ${tx},${sy} L ${tx},${ty - 9}`;
      } else {
        // Route as V-H-V: vertical to safeY, horizontal to tx, vertical to target
        pathD = `M ${sx},${sy} L ${sx},${safeY} L ${tx},${safeY} L ${tx},${ty - 9}`;
      }
    }
    return {
      pathD,
      arrowPoints: arrowPolygon('down', tx, ty),
      arrowFill: connColor(conn),
      labelX: (sx + tx) / 2,
      labelY: sy + 8,
      direction: 'down',
    };
  } else {
    // Upward — enter target from BOTTOM
    let pathD;
    if (Math.abs(sx - tx) < 1) {
      pathD = `M ${sx},${sy} L ${tx},${ty + 9}`;
    } else {
      // L-bend: horizontal to target x, then vertical up to target bottom
      // Check if horizontal segment at sy passes through any node
      const safeY = safeMidY(sy, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
      if (Math.abs(safeY - sy) < 1) {
        pathD = `M ${sx},${sy} L ${tx},${sy} L ${tx},${ty + 9}`;
      } else {
        // Route as V-H-V: vertical to safeY, horizontal to tx, vertical to target
        pathD = `M ${sx},${sy} L ${sx},${safeY} L ${tx},${safeY} L ${tx},${ty + 9}`;
      }
    }
    return {
      pathD,
      arrowPoints: arrowPolygon('up', tx, ty),
      arrowFill: connColor(conn),
      labelX: (sx + tx) / 2,
      labelY: sy - 8,
      direction: 'up',
    };
  }
}

/**
 * Cross-lane downward path (source lane index < target lane index).
 * Routes orthogonally: exit vertically from source bottom, horizontal to
 * target x column, then vertical into target top — always enters from TOP edge.
 *   Straight vertical when x is close (within 1px).
 *   Otherwise: M sx,sy -> L sx,midY -> L tx,midY -> L tx,ty-9
 */
export function crossLaneDown(sx, sy, tx, ty, conn) {
  if (Math.abs(sx - tx) < 1) {
    // Truly vertical — same x column
    const pathD = `M ${sx},${sy} L ${sx},${ty - 9}`;
    return {
      pathD,
      arrowPoints: arrowPolygon('down', tx, ty),
      arrowFill: connColor(conn),
      labelX: sx + 8,
      labelY: (sy + ty) / 2,
      direction: 'down',
    };
  }

  // Route: exit bottom of source, go vertical to midY, horizontal to target x,
  // then vertical down into target top — always enters from TOP edge.
  const rawMidY = (sy + ty) / 2;
  const midY = safeMidY(rawMidY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${ty - 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('down', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: midY - 8,
    direction: 'down',
  };
}

/**
 * Cross-lane upward path (source lane index > target lane index).
 */
export function crossLaneUp(sx, sy, tx, ty, conn) {
  if (Math.abs(sx - tx) < 1) {
    // Truly vertical — same x column
    const pathD = `M ${sx},${sy} L ${sx},${ty + 9}`;
    return {
      pathD,
      arrowPoints: arrowPolygon('up', tx, ty),
      arrowFill: connColor(conn),
      labelX: sx + 8,
      labelY: (sy + ty) / 2,
      direction: 'up',
    };
  }

  // Route: exit top of source, go vertical to midY, horizontal to target x,
  // then vertical up into target bottom — always enters from BOTTOM edge.
  const rawMidY = (sy + ty) / 2;
  const midY = safeMidY(rawMidY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${ty + 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('up', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: midY + 8,
    direction: 'up',
  };
}

/**
 * Elbow right-then-down path.
 * Route: vertical from source to midY, horizontal to target x, vertical into target top.
 *   M sx,sy -> L sx,midY -> L tx,midY -> L tx,ty-9
 */
export function elbowRightDown(sx, sy, tx, ty, conn) {
  // Route: exit bottom of source, vertical to midY, horizontal to target x,
  // then vertical down into target top — always enters from TOP edge.
  const rawMidY = (sy + ty) / 2;
  const midY = safeMidY(rawMidY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${ty - 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('down', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: midY - 8,
    direction: 'elbow-right-down',
  };
}

/**
 * Elbow right-then-up path.
 * Route: vertical from source to midY, horizontal to target x, vertical into target bottom.
 *   M sx,sy -> L sx,midY -> L tx,midY -> L tx,ty+9
 */
export function elbowRightUp(sx, sy, tx, ty, conn) {
  // Route: exit top of source, vertical to midY, horizontal to target x,
  // then vertical up into target bottom — always enters from BOTTOM edge.
  const rawMidY = (sy + ty) / 2;
  const midY = safeMidY(rawMidY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${midY} L ${tx},${midY} L ${tx},${ty + 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('up', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: midY + 8,
    direction: 'elbow-right-up',
  };
}

/**
 * Gateway "No" branch path: exit from the bottom tip of a diamond, route
 * below the lane boundary, then enter the target node from below.
 */
export function gatewayNoRight(sx, sy, tx, ty, conn, lane) {
  const rawHookY = lane.y + lane.height + (conn.offset || 18);
  const hookY = safeMidY(rawHookY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${hookY} L ${tx},${hookY} L ${tx},${ty + 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('up', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: hookY + 10,
    direction: 'gateway-no-right',
  };
}

/**
 * Loop-back U-path for same-lane right-to-left connections.
 */
export function loopBack(sx, sy, tx, ty, conn, laneBounds) {
  const rawLoopY = laneBounds.bottom + (conn.offset || 24);
  const loopY = safeMidY(rawLoopY, Math.min(sx, tx), Math.max(sx, tx), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${sx},${loopY} L ${tx},${loopY} L ${tx},${ty + 9}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('up', tx, ty),
    arrowFill: connColor(conn),
    labelX: (sx + tx) / 2,
    labelY: loopY + 10,
    direction: 'left',
  };
}

// ─── Path waypoint parser ─────────────────────────────────────────────────────

/**
 * Parse a simple "M x,y L x,y L x,y ..." path string into an array of [x, y]
 * coordinate pairs. Used by animation.js to step a token along a path.
 *
 * @param {string} pathD - SVG path `d` attribute string.
 * @returns {Array<[number, number]>} Array of [x, y] coordinate pairs.
 */
export function parsePathWaypoints(pathD) {
  if (!pathD || typeof pathD !== 'string') return [];

  // Check if path contains cubic bezier commands
  if (/[Cc]/.test(pathD)) {
    // Sample the bezier curve into polyline waypoints for label computation
    return sampleBezierPath(pathD);
  }

  const waypoints = [];
  const tokenRe = /[ML]\s*([-\d.]+)[,\s]\s*([-\d.]+)/gi;
  let match;
  while ((match = tokenRe.exec(pathD)) !== null) {
    waypoints.push([parseFloat(match[1]), parseFloat(match[2])]);
  }
  return waypoints;
}

/**
 * Sample a cubic bezier SVG path into discrete waypoints for label positioning.
 * Handles "M sx,sy C cx1,cy1 cx2,cy2 ex,ey" format.
 */
function sampleBezierPath(pathD) {
  const mMatch = pathD.match(/M\s*([-\d.]+)[,\s]\s*([-\d.]+)/i);
  const cMatch = pathD.match(/C\s*([-\d.]+)[,\s]\s*([-\d.]+)\s+([-\d.]+)[,\s]\s*([-\d.]+)\s+([-\d.]+)[,\s]\s*([-\d.]+)/i);
  if (!mMatch || !cMatch) return [];

  const p0 = [parseFloat(mMatch[1]), parseFloat(mMatch[2])];
  const p1 = [parseFloat(cMatch[1]), parseFloat(cMatch[2])];
  const p2 = [parseFloat(cMatch[3]), parseFloat(cMatch[4])];
  const p3 = [parseFloat(cMatch[5]), parseFloat(cMatch[6])];

  const SAMPLES = 16;
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const mt = 1 - t;
    const x = mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0];
    const y = mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1];
    pts.push([x, y]);
  }
  return pts;
}

// ─── Lane header avoidance ────────────────────────────────────────────────────

const LANE_HEADER_W = 52;

function avoidLaneHeaders(waypoints, lanes) {
  if (!lanes || lanes.length === 0 || waypoints.length < 2) return waypoints;

  const headerRight = LANE_HEADER_W;
  const result = [waypoints[0]];

  for (let i = 1; i < waypoints.length; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];

    const minX = Math.min(prev[0], curr[0]);
    if (minX < headerRight) {
      const segMinY = Math.min(prev[1], curr[1]);
      const segMaxY = Math.max(prev[1], curr[1]);

      let needsDetour = false;
      for (const lane of lanes) {
        const laneTop = lane.y;
        const laneBot = lane.y + lane.height;
        if (segMaxY > laneTop && segMinY < laneBot && minX < headerRight) {
          needsDetour = true;
          break;
        }
      }

      if (needsDetour) {
        const detourX = headerRight + 4;
        if (prev[0] < headerRight) {
          result[result.length - 1] = [detourX, prev[1]];
        }
        if (curr[0] < headerRight) {
          result.push([detourX, curr[1]]);
          result.push([detourX, curr[1]]);
          continue;
        }
      }
    }
    result.push(curr);
  }

  return result;
}

function applyHeaderAvoidance(result, lanes) {
  if (!result || !lanes || lanes.length === 0) return result;

  const waypoints = parsePathWaypoints(result.pathD);
  if (waypoints.length < 2) return result;

  const corrected = avoidLaneHeaders(waypoints, lanes);

  if (corrected.length !== waypoints.length ||
      corrected.some((pt, i) => pt[0] !== waypoints[i][0] || pt[1] !== waypoints[i][1])) {
    result.pathD = rebuildPathD(corrected);
  }

  return result;
}

// ─── Post-processing: padding + label recomputation ───────────────────────────

/**
 * Apply ARROW_PADDING enforcement and recompute label position on a path result.
 * This is the final post-processing step after header avoidance.
 *
 * @param {object} result   - Path result with pathD, labelX, labelY.
 * @param {object} conn     - Connection object.
 * @param {object} nodesMap - layout.nodes map.
 * @returns {object} The result with adjusted pathD and label positions.
 */
function applyPaddingAndLabels(result, conn, nodesMap) {
  if (!result) return result;

  // Task 2.9: Enforce minimum padding from non-connected nodes
  if (nodesMap) {
    const waypoints = parsePathWaypoints(result.pathD);
    if (waypoints.length >= 2) {
      // Save the original waypoints before padding modifies them
      const origFirst = [...waypoints[0]];
      const origLast  = [...waypoints[waypoints.length - 1]];
      const origWaypoints = waypoints.map(p => [...p]);

      addPaddingToWaypoints(waypoints, nodesMap, conn.from, conn.to);

      // Re-snap endpoints and preserve entry direction.
      // The padding must NOT change WHERE the arrow enters the target or
      // FROM WHICH DIRECTION it approaches.
      waypoints[0] = origFirst;
      waypoints[waypoints.length - 1] = origLast;

      // Force the final segment to match the original entry direction.
      // The original path's last two points define the intended approach.
      // After padding, the second-to-last point may have shifted, changing
      // the approach direction. Fix: set the second-to-last point so the
      // final segment goes in the original direction.
      if (waypoints.length >= 2 && origWaypoints.length >= 2) {
        const origPrev = origWaypoints[origWaypoints.length - 2];
        const origLast2 = origWaypoints[origWaypoints.length - 1];
        const origDx = origLast2[0] - origPrev[0];
        const origDy = origLast2[1] - origPrev[1];
        const last = waypoints[waypoints.length - 1];

        if (Math.abs(origDy) > Math.abs(origDx)) {
          // Original approached vertically — keep x aligned with target
          waypoints[waypoints.length - 2] = [last[0], waypoints[waypoints.length - 2][1]];
        } else {
          // Original approached horizontally — keep y aligned with target
          waypoints[waypoints.length - 2] = [waypoints[waypoints.length - 2][0], last[1]];
        }
      }

      result.pathD = rebuildPathD(waypoints);
    }
  }

  // Task 2.5: Recompute label position using geometric midpoint of entire path
  if (conn.decision || conn.label) {
    const labelPos = computeLabelPosition(result.pathD, conn);
    if (labelPos) {
      result.labelX = labelPos.labelX;
      result.labelY = labelPos.labelY;
    }
  }

  return result;
}

// ─── Gateway port-based angular separation ────────────────────────────────────

const GATEWAY_EXIT_SEGMENT = 30;

function gatewayPortRoute(portId, srcBounds, tgtBounds, conn, layout) {
  const portPos = getPortPosition('gateway', portId, srcBounds.width, srcBounds.height);
  const sx = srcBounds.x + portPos.x;
  const sy = srcBounds.y + portPos.y;
  // Use target center for horizontal entry (left edge center),
  // target top for vertical entry (top edge center).
  const tx = tgtBounds.left;  // left edge x (for horizontal entry)
  const txCenter = tgtBounds.x;  // center x (for vertical entry)
  const ty = tgtBounds.y;    // center y (for horizontal entry)
  const tyTop = tgtBounds.top;  // top edge y (for vertical entry)

  const seg = GATEWAY_EXIT_SEGMENT;

  switch (portId) {
    case 'out-left': {
      const exitX = sx - seg;
      // Route: left from gateway, down to target center Y, right to target left edge
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${ty} L ${tx - 9},${ty}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('right', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: ty - 18,
        direction: 'gateway-port-left',
      };
    }

    case 'out-right': {
      // Route from the diamond's right tip to the target.
      // Determine target entry point based on relative position.
      const rightDy = tgtBounds.y - srcBounds.y;
      const rightCrossLane = srcBounds.laneIndex !== tgtBounds.laneIndex;

      if (rightCrossLane && Math.abs(rightDy) > 20) {
        // Cross-lane: exit right, go horizontal then vertical to target
        const safeSy = safeMidY(sy, Math.min(sx, txCenter), Math.max(sx, txCenter), _currentFromId, _currentToId);
        if (rightDy > 0) {
          // Target is below — enter from top
          const pathD = Math.abs(safeSy - sy) < 1
            ? `M ${sx},${sy} L ${txCenter},${sy} L ${txCenter},${tyTop - 9}`
            : `M ${sx},${sy} L ${sx},${safeSy} L ${txCenter},${safeSy} L ${txCenter},${tyTop - 9}`;
          return {
            pathD,
            arrowPoints: arrowPolygon('down', txCenter, tyTop),
            arrowFill: connColor(conn),
            labelX: (sx + txCenter) / 2,
            labelY: (Math.abs(safeSy - sy) < 1 ? sy : safeSy) - 8,
            direction: 'gateway-port-right',
          };
        } else {
          // Target is above — enter from bottom
          const tyBottom = tgtBounds.bottom;
          const pathD = Math.abs(safeSy - sy) < 1
            ? `M ${sx},${sy} L ${txCenter},${sy} L ${txCenter},${tyBottom + 9}`
            : `M ${sx},${sy} L ${sx},${safeSy} L ${txCenter},${safeSy} L ${txCenter},${tyBottom + 9}`;
          return {
            pathD,
            arrowPoints: arrowPolygon('up', txCenter, tyBottom),
            arrowFill: connColor(conn),
            labelX: (sx + txCenter) / 2,
            labelY: (Math.abs(safeSy - sy) < 1 ? sy : safeSy) + 8,
            direction: 'gateway-port-right',
          };
        }
      } else {
        // Same lane or close vertically: horizontal route to target left edge
        let pathD;
        if (Math.abs(sy - ty) < 1) {
          pathD = `M ${sx},${sy} L ${tx - 9},${sy}`;
        } else {
          const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
          pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
        }
        return {
          pathD,
          arrowPoints: arrowPolygon('right', tx, ty),
          arrowFill: connColor(conn),
          labelX: (sx + tx) / 2,
          labelY: Math.min(sy, ty) - 10,
          direction: 'gateway-port-right',
        };
      }
    }

    case 'out-bottom': {
      const rawExitY = sy + seg;
      const exitY = safeMidY(rawExitY, Math.min(sx, txCenter), Math.max(sx, txCenter), _currentFromId, _currentToId);
      // Route: down from gateway, horizontal to target x, down to target top edge
      const pathD = `M ${sx},${sy} L ${sx},${exitY} L ${txCenter},${exitY} L ${txCenter},${tyTop - 9}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('down', txCenter, tyTop),
        arrowFill: connColor(conn),
        labelX: (sx + txCenter) / 2,
        labelY: exitY - 8,
        direction: 'gateway-port-bottom',
      };
    }

    case 'out-bl': {
      const exitX = sx - seg * 0.7;
      const exitY = sy + seg * 0.7;
      // Route to target's left edge center
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${ty} L ${tx - 9},${ty}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('right', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: ty - 18,
        direction: 'gateway-port-bl',
      };
    }

    case 'out-br': {
      const exitX = sx + seg * 0.7;
      const exitY = sy + seg * 0.7;
      // Route to target's left edge center
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${ty} L ${tx - 9},${ty}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('right', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: ty - 18,
        direction: 'gateway-port-br',
      };
    }

    default:
      return null;
  }
}

/** Priority-ordered list of gateway outgoing ports. */
const GATEWAY_OUT_PORTS = ['out-right', 'out-left', 'out-bottom', 'out-br', 'out-bl'];

/**
 * Determine the preferred outgoing port for a gateway connection.
 * If `usedPorts` is provided, the preferred port will be checked against it;
 * when the preferred port is already taken, the next available port from the
 * priority list is returned instead, guaranteeing each branch exits from a
 * distinct point on the diamond.
 *
 * @param {object}      conn      - Connection object
 * @param {object}      srcBounds - Source gateway bounds
 * @param {object}      tgtBounds - Target node bounds
 * @param {Set<string>} [usedPorts] - Ports already claimed by earlier branches
 * @returns {string} Port name
 */
function resolveGatewayOutPort(conn, srcBounds, tgtBounds, usedPorts) {
  // Check pre-assigned port from the gateway port map first
  if (_gatewayPortMap) {
    const key = conn.id || `${conn.from}->${conn.to}`;
    const assigned = _gatewayPortMap.get(key);
    if (assigned) return assigned;
  }

  if (conn.sourcePort) return conn.sourcePort;

  // Compute the heuristic-preferred port
  let preferred;
  if (conn.decision === 'yes') {
    preferred = 'out-right';
  } else if (conn.decision === 'no') {
    preferred = tgtBounds.x < srcBounds.x ? 'out-left' : 'out-bottom';
  } else if (conn.decision) {
    preferred = tgtBounds.x < srcBounds.x ? 'out-left' : 'out-br';
  } else {
    const dx = tgtBounds.x - srcBounds.x;
    const dy = tgtBounds.y - srcBounds.y;
    if (dx > 20)       preferred = 'out-right';
    else if (dx < -20) preferred = 'out-left';
    else if (dy > 0)   preferred = 'out-bottom';
    else               preferred = 'out-right';
  }

  // Without collision tracking, return the heuristic choice directly
  if (!usedPorts) return preferred;

  // If the preferred port is still free, use it
  if (!usedPorts.has(preferred)) return preferred;

  // Preferred port is taken — find the next available one
  for (const port of GATEWAY_OUT_PORTS) {
    if (!usedPorts.has(port)) return port;
  }

  // All 5 ports exhausted — fall back to preferred (overlapping is unavoidable)
  return preferred;
}

/**
 * Pre-assign distinct outgoing ports for every gateway node's connections.
 * Returns a Map<connKey, portName> where connKey is the connection id or
 * 'from->to' string.
 *
 * Must be called before the render loop so that computeOrthogonalPath can
 * look up the pre-assigned port for each connection.
 *
 * @param {Array}  connections - Visible connection objects
 * @param {Object} layoutNodes - layout.nodes map (nodeId -> bounds)
 * @returns {Map<string, string>} connKey -> assigned port
 */
function preAssignGatewayPorts(connections, layoutNodes) {
  // Temporarily clear the module-level map so that resolveGatewayOutPort
  // inside this function uses the usedPorts parameter instead of stale data.
  const prevMap = _gatewayPortMap;
  _gatewayPortMap = null;

  const assignments = new Map();

  // Group connections by source gateway
  const byGateway = new Map();
  for (const conn of connections) {
    const srcBounds = layoutNodes[conn.from];
    if (!srcBounds || srcBounds.type !== 'gateway') continue;
    if (!byGateway.has(conn.from)) byGateway.set(conn.from, []);
    byGateway.get(conn.from).push(conn);
  }

  // For each gateway, assign ports sequentially, tracking used ports
  for (const [gatewayId, conns] of byGateway) {
    const usedPorts = new Set();
    const srcBounds = layoutNodes[gatewayId];

    for (const conn of conns) {
      const tgtBounds = layoutNodes[conn.to];
      if (!tgtBounds) continue;

      // Connections with explicit sourcePort always keep their port
      if (conn.sourcePort) {
        usedPorts.add(conn.sourcePort);
        const key = conn.id || `${conn.from}->${conn.to}`;
        assignments.set(key, conn.sourcePort);
        continue;
      }

      const port = resolveGatewayOutPort(conn, srcBounds, tgtBounds, usedPorts);
      usedPorts.add(port);

      const key = conn.id || `${conn.from}->${conn.to}`;
      assignments.set(key, port);
    }
  }

  // Restore previous map (will be overwritten by caller anyway)
  _gatewayPortMap = prevMap;
  return assignments;
}

// Module-level variable: current gateway port assignments for the active render pass
let _gatewayPortMap = null;

// ─── Master path dispatcher ───────────────────────────────────────────────────

/**
 * Compute the orthogonal SVG path for a connection using the layout.
 * Detects routing direction automatically (or uses conn.route hint),
 * then delegates to the appropriate path constructor.
 *
 * After path construction, applies:
 *   - Lane header avoidance
 *   - ARROW_PADDING enforcement (task 2.9)
 *   - Geometric midpoint label positioning (task 2.5)
 *
 * @param {object} conn   - Connection object
 * @param {object} layout - Layout object from computeLayout()
 * @returns {{ pathD, arrowPoints, arrowFill, labelX, labelY, direction }|null}
 */
export function computeOrthogonalPath(conn, layout, visibleNodesMap) {
  const srcBounds = layout.nodes[conn.from];
  const tgtBounds = layout.nodes[conn.to];

  if (!srcBounds || !tgtBounds) return null;

  // Use only visible nodes for obstacle avoidance (avoids detours around hidden nodes)
  const obstacleMap = visibleNodesMap || layout.nodes;

  // Set up context for safeMidX during path construction
  _currentNodesMap = obstacleMap;
  _currentFromId = conn.from;
  _currentToId = conn.to;

  const direction = detectDirection(srcBounds, tgtBounds, conn.route);

  // Gateway outgoing: use port-based angular separation.
  // Every gateway branch (including out-right) is routed through gatewayPortRoute
  // so that each branch starts from its assigned port's distinct pixel position,
  // preventing shared-origin violations in the QA audit.
  if (srcBounds.type === 'gateway') {
    const outPort = resolveGatewayOutPort(conn, srcBounds, tgtBounds);
    if (outPort) {
      const portResult = gatewayPortRoute(outPort, srcBounds, tgtBounds, conn, layout);
      if (portResult) {
        const r = applyHeaderAvoidance(portResult, layout.lanes);
        return applyPaddingAndLabels(r, conn, obstacleMap);
      }
    }
  }

  // ── Port-based start/end points ─────────────────────────────────────────
  let sx, sy, tx, ty;

  if (conn.sourcePort || conn.targetPort) {
    const fallback = getConnectionPoints(srcBounds, tgtBounds, direction);
    if (conn.sourcePort) {
      const offset = getPortPosition(srcBounds.type, conn.sourcePort, srcBounds.width, srcBounds.height);
      sx = srcBounds.x + offset.x;
      sy = srcBounds.y + offset.y;
    } else {
      sx = fallback.sx;
      sy = fallback.sy;
    }
    if (conn.targetPort) {
      const offset = getPortPosition(tgtBounds.type, conn.targetPort, tgtBounds.width, tgtBounds.height);
      tx = tgtBounds.x + offset.x;
      ty = tgtBounds.y + offset.y;
    } else {
      tx = fallback.tx;
      ty = fallback.ty;
    }
  } else {
    ({ sx, sy, tx, ty } = getConnectionPoints(srcBounds, tgtBounds, direction));
  }

  let result;
  switch (direction) {
    case 'right':
      result = straightHoriz(sx, sy, tx, ty, conn);
      break;

    case 'left': {
      result = straightHorizLeft(sx, sy, tx, ty, conn);
      break;
    }

    case 'down':
      result = crossLaneDown(sx, sy, tx, ty, conn);
      break;

    case 'up':
      result = crossLaneUp(sx, sy, tx, ty, conn);
      break;

    case 'elbow-right-down':
      result = elbowRightDown(sx, sy, tx, ty, conn);
      break;

    case 'elbow-right-up':
      result = elbowRightUp(sx, sy, tx, ty, conn);
      break;

    default:
      result = straightHoriz(sx, sy, tx, ty, conn);
      break;
  }

  // Apply lane header avoidance, then padding + label recomputation
  result = applyHeaderAvoidance(result, layout.lanes);
  const final = applyPaddingAndLabels(result, conn, obstacleMap);
  _currentNodesMap = null;
  return final;
}

// ─── Connection label renderer ────────────────────────────────────────────────

/**
 * Append a decision badge (YES/NO pill) or plain text label to the given SVG layer.
 *
 * @param {SVGElement} layer  - SVG layer element to append into.
 * @param {object}     conn   - Connection object (decision?, label?).
 * @param {object}     result - Path result with labelX, labelY.
 */
export function renderConnectionLabel(layer, conn, result) {
  const lx = result.labelX;
  const ly = result.labelY;

  if (conn.decision === 'yes') {
    const rect = svgEl('rect', {
      x: lx - 16,
      y: ly - 9,
      width: 32,
      height: 18,
      rx: 9,
      fill: '#14532d',
      opacity: '0.85',
      class: 'conn-label',
    });
    layer.appendChild(rect);

    const text = svgEl('text', {
      x: lx,
      y: ly + 4,
      'text-anchor': 'middle',
      fill: '#86efac',
      'font-size': '11',
      'font-weight': '600',
      'font-family': "'Segoe UI', sans-serif",
      class: 'conn-label',
    });
    text.textContent = 'Yes';
    layer.appendChild(text);

  } else if (conn.decision === 'no') {
    const rect = svgEl('rect', {
      x: lx - 14,
      y: ly - 9,
      width: 28,
      height: 18,
      rx: 9,
      fill: '#450a0a',
      opacity: '0.85',
      class: 'conn-label',
    });
    layer.appendChild(rect);

    const text = svgEl('text', {
      x: lx,
      y: ly + 4,
      'text-anchor': 'middle',
      fill: '#fca5a5',
      'font-size': '11',
      'font-weight': '600',
      'font-family': "'Segoe UI', sans-serif",
      class: 'conn-label',
    });
    text.textContent = 'No';
    layer.appendChild(text);

  } else if (conn.label) {
    const text = svgEl('text', {
      x: lx,
      y: ly,
      'text-anchor': 'middle',
      fill: '#94a3b8',
      'font-size': '8',
      'font-family': "'Segoe UI', sans-serif",
      opacity: '0.9',
      class: 'conn-label',
    });
    text.textContent = conn.label;
    layer.appendChild(text);
  }
}

// ─── Curved bezier path computation ───────────────────────────────────────────

/**
 * Compute a curved (cubic bezier) SVG path as an alternative to orthogonal routing.
 * Returns the same result shape as computeOrthogonalPath.
 *
 * @param {object} conn   - Connection object
 * @param {object} layout - Layout object from computeLayout()
 * @returns {{ pathD, arrowPoints, arrowFill, labelX, labelY, direction }|null}
 */
export function computeCurvedPath(conn, layout) {
  const srcBounds = layout.nodes[conn.from];
  const tgtBounds = layout.nodes[conn.to];
  if (!srcBounds || !tgtBounds) return null;

  const direction = detectDirection(srcBounds, tgtBounds, conn.route);

  // ── Port-based or default start/end points ──────────────────────────
  let sx, sy, tx, ty;

  if (conn.sourcePort || conn.targetPort) {
    const fallback = getConnectionPoints(srcBounds, tgtBounds, direction);
    if (conn.sourcePort) {
      const offset = getPortPosition(srcBounds.type, conn.sourcePort, srcBounds.width, srcBounds.height);
      sx = srcBounds.x + offset.x;
      sy = srcBounds.y + offset.y;
    } else {
      sx = fallback.sx;
      sy = fallback.sy;
    }
    if (conn.targetPort) {
      const offset = getPortPosition(tgtBounds.type, conn.targetPort, tgtBounds.width, tgtBounds.height);
      tx = tgtBounds.x + offset.x;
      ty = tgtBounds.y + offset.y;
    } else {
      tx = fallback.tx;
      ty = fallback.ty;
    }
  } else {
    ({ sx, sy, tx, ty } = getConnectionPoints(srcBounds, tgtBounds, direction));
  }

  const dx = tx - sx;
  const dy = ty - sy;
  const sameLane = srcBounds.laneIndex === tgtBounds.laneIndex;

  let cx1, cy1, cx2, cy2;
  let arrowDir;

  if (direction === 'left') {
    // Loop-back: curve below
    const lane = layout.lanes[srcBounds.laneIndex];
    const loopY = (lane ? lane.y + lane.height : sy) + (conn.offset || 40);
    cx1 = sx;
    cy1 = loopY;
    cx2 = tx;
    cy2 = loopY;
    arrowDir = 'up';
    ty = ty + 0; // keep target as-is for upward entry
  } else if (sameLane || Math.abs(dy) < 20) {
    // Same-lane or nearly horizontal: horizontal control points
    cx1 = sx + dx * 0.4;
    cy1 = sy;
    cx2 = sx + dx * 0.6;
    cy2 = ty;
    arrowDir = dx >= 0 ? 'right' : 'left';
  } else {
    // Cross-lane: S-curve with vertical offset
    const offsetY = dy * 0.35;
    cx1 = sx + dx * 0.3;
    cy1 = sy + offsetY;
    cx2 = sx + dx * 0.7;
    cy2 = ty - offsetY;
    arrowDir = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  // Shorten end point by 9px so arrowhead tip lands on target edge
  let endX = tx, endY = ty;
  const lastDx = tx - cx2;
  const lastDy = ty - cy2;
  const lastDist = Math.sqrt(lastDx * lastDx + lastDy * lastDy);
  if (lastDist > 9) {
    endX = tx - (lastDx / lastDist) * 9;
    endY = ty - (lastDy / lastDist) * 9;
  }

  // Compute arrowhead direction from the tangent at the end of the curve
  // Tangent at t=1 of cubic bezier: 3*(P3-P2)
  const tangentX = tx - cx2;
  const tangentY = ty - cy2;
  const absTx = Math.abs(tangentX);
  const absTy = Math.abs(tangentY);
  if (absTx > absTy) {
    arrowDir = tangentX > 0 ? 'right' : 'left';
  } else {
    arrowDir = tangentY > 0 ? 'down' : 'up';
  }

  const pathD = `M ${sx},${sy} C ${cx1},${cy1} ${cx2},${cy2} ${endX},${endY}`;
  const labelX = (sx + tx) / 2;
  const labelY = (sy + ty) / 2 - 10;

  const result = {
    pathD,
    arrowPoints: arrowPolygon(arrowDir, tx, ty),
    arrowFill: connColor(conn),
    labelX,
    labelY,
    direction: arrowDir,
  };

  // Recompute label position if needed
  if (conn.decision || conn.label) {
    const labelPos = computeLabelPosition(pathD, conn);
    if (labelPos) {
      result.labelX = labelPos.labelX;
      result.labelY = labelPos.labelY;
    }
  }

  return result;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Render all visible connections into the connections and annotations SVG layers.
 * Clears both layers first, then draws path lines, arrowhead polygons,
 * optional decision/label badges, and cross-lane handoff indicators.
 *
 * @param {object} graph    - Parsed graph object with connections array.
 * @param {object} layout   - Layout object from computeLayout().
 * @param {string} viewMode - Current view mode ('before'|'after'|'split'|'overlay').
 */
export function renderConnections(graph, layout, viewMode) {
  const connLayer  = dom.connectionsLayer;
  const arrowLayer = dom.annotationsLayer;

  connLayer.innerHTML  = '';
  arrowLayer.innerHTML = '';

  // ── Phase-based vs legacy visibility filtering ──────────────────────────────
  const phases = normalizePhases(graph);
  const phaseIndex = state.currentPhaseIndex ?? 0;
  const useMultiPhase = phases.length > 2;

  // Build a map of only visible nodes for obstacle avoidance.
  // This prevents arrows from detouring around invisible nodes in before/after views.
  const visibleNodesMap = {};
  for (const node of (graph.nodes || [])) {
    const nodeVisible = useMultiPhase
      ? isVisibleAtPhase(node, phaseIndex, phases)
      : isVisible(node, viewMode, state.selectedPhase);
    if (nodeVisible && layout.nodes[node.id]) {
      visibleNodesMap[node.id] = layout.nodes[node.id];
    }
  }

  let visible;
  if (useMultiPhase) {
    visible = (graph.connections || []).filter(conn => {
      if (!isVisibleAtPhase(conn, phaseIndex, phases)) return false;
      // Both endpoints must be visible
      const srcNode = graph.nodes.find(n => n.id === conn.from);
      const tgtNode = graph.nodes.find(n => n.id === conn.to);
      if (srcNode && !isVisibleAtPhase(srcNode, phaseIndex, phases)) return false;
      if (tgtNode && !isVisibleAtPhase(tgtNode, phaseIndex, phases)) return false;
      return true;
    });
  } else {
    // Legacy before/after path (unchanged)
    visible = (graph.connections || []).filter(
      conn => isVisible(conn, viewMode, state.selectedPhase)
    );
  }

  // Pre-assign distinct outgoing ports for each gateway so no two branches
  // share the same exit point on the diamond.
  _gatewayPortMap = preAssignGatewayPorts(visible, layout.nodes);

  for (const conn of visible) {
    // Choose routing mode based on state.arrowStyle
    const result = state.arrowStyle === 'curved'
      ? computeCurvedPath(conn, layout)
      : computeOrthogonalPath(conn, layout, visibleNodesMap);
    if (!result) continue;

    const cid = conn.id || `${conn.from}->${conn.to}`;
    const isMessage = conn.type === 'message';

    // Wrap path + label in a <g> group for hover targeting
    const groupClasses = ['conn-group'];
    if (state.flowAnimation && !isMessage) groupClasses.push('flow-animated');
    const group = svgEl('g', {
      class: groupClasses.join(' '),
      'data-from': conn.from || '',
      'data-to':   conn.to   || '',
    });

    // Build attribute map for the path/line element
    const strokeAttrs = connStrokeAttrs(conn);
    const pathAttrs = {
      d: result.pathD,
      stroke: connColor(conn),
      fill: 'none',
      'data-conn-id': cid,
      'data-conn-from': conn.from || '',
      'data-conn-to':   conn.to   || '',
      ...strokeAttrs,
    };

    const pathEl = svgEl('path', pathAttrs);
    group.appendChild(pathEl);

    // Optional label (rendered inside the group for hover opacity)
    if (conn.decision || conn.label) {
      renderConnectionLabel(group, conn, result);
    }

    connLayer.appendChild(group);

    // Arrowhead polygon (in annotations layer, as expected by tests)
    const arrowEl = svgEl('polygon', {
      points: result.arrowPoints,
      fill: result.arrowFill,
      'data-conn-id': cid,
    });
    arrowLayer.appendChild(arrowEl);

    // Task 2.6: Cross-lane handoff indicator (in annotation layer, outside group)
    if (isCrossLane(conn, layout)) {
      conn.handoff = true;

      const srcBounds = layout.nodes[conn.from];
      const tgtBounds = layout.nodes[conn.to];
      if (srcBounds && tgtBounds) {
        const crossing = findLaneBoundaryCrossing(result.pathD, layout, srcBounds, tgtBounds);
        if (crossing) {
          renderHandoffIndicator(arrowLayer, crossing.x, crossing.y);
        }
      }
    }
  }

  // Clear the gateway port map after rendering to avoid stale lookups
  _gatewayPortMap = null;
}

// ─── Live re-routing during drag ─────────────────────────────────────────────

/**
 * Re-route only the connections that touch nodeId by mutating existing DOM
 * path/polygon elements in place. Called on every mousemove during a drag so
 * edges follow the node without a full re-render.
 *
 * @param {string} nodeId   - The id of the node being dragged.
 * @param {object} graph    - Parsed graph object with connections array.
 * @param {object} layout   - Layout object (nodes bounds already updated).
 * @param {string} viewMode - Current view mode.
 */
export function rerouteNodeConnections(nodeId, graph, layout, viewMode) {
  const connLayer  = dom.connectionsLayer;
  const arrowLayer = dom.annotationsLayer;
  if (!connLayer || !arrowLayer) return;

  // ── Phase-based vs legacy visibility filtering ──────────────────────────────
  const phases = normalizePhases(graph);
  const phaseIndex = state.currentPhaseIndex ?? 0;
  const useMultiPhase = phases.length > 2;

  // Pre-assign gateway ports for ALL visible connections so that port
  // assignments remain consistent even when only a subset is re-routed.
  let allVisible;
  if (useMultiPhase) {
    allVisible = (graph.connections || []).filter(c => {
      if (!isVisibleAtPhase(c, phaseIndex, phases)) return false;
      const srcNode = graph.nodes.find(n => n.id === c.from);
      const tgtNode = graph.nodes.find(n => n.id === c.to);
      if (srcNode && !isVisibleAtPhase(srcNode, phaseIndex, phases)) return false;
      if (tgtNode && !isVisibleAtPhase(tgtNode, phaseIndex, phases)) return false;
      return true;
    });
  } else {
    allVisible = (graph.connections || []).filter(
      c => isVisible(c, viewMode, state.selectedPhase)
    );
  }
  _gatewayPortMap = preAssignGatewayPorts(allVisible, layout.nodes);

  const visible = allVisible.filter(
    c => c.from === nodeId || c.to === nodeId
  );

  for (const conn of visible) {
    const result = state.arrowStyle === 'curved'
      ? computeCurvedPath(conn, layout)
      : computeOrthogonalPath(conn, layout);
    if (!result) continue;

    const cid = conn.id || `${conn.from}->${conn.to}`;
    const pathEl  = connLayer.querySelector(`path[data-conn-id="${cid}"]`);
    const arrowEl = arrowLayer.querySelector(`polygon[data-conn-id="${cid}"]`);

    if (pathEl)  pathEl.setAttribute('d', result.pathD);
    if (arrowEl) arrowEl.setAttribute('points', result.arrowPoints);
  }

  _gatewayPortMap = null;
}
