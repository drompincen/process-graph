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
    const OFFSET = 14;
    return {
      labelX: px + (isHorizontal ? 0 : -OFFSET),
      labelY: py + (isHorizontal ? -OFFSET : 0),
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
    // Downward
    let pathD;
    if (Math.abs(sx - tx) < 1) {
      pathD = `M ${sx},${sy} L ${tx},${ty - 9}`;
    } else {
      // Orthogonal L-bend: go vertical to target row, then horizontal
      pathD = `M ${sx},${sy} L ${sx},${ty - 9} L ${tx},${ty - 9}`;
    }
    return {
      pathD,
      arrowPoints: arrowPolygon('down', tx, ty),
      arrowFill: connColor(conn),
      labelX: sx + 8,
      labelY: (sy + ty) / 2,
      direction: 'down',
    };
  } else {
    // Upward
    let pathD;
    if (Math.abs(sx - tx) < 1) {
      pathD = `M ${sx},${sy} L ${tx},${ty + 9}`;
    } else {
      // Orthogonal L-bend: go vertical to target row, then horizontal
      pathD = `M ${sx},${sy} L ${sx},${ty + 9} L ${tx},${ty + 9}`;
    }
    return {
      pathD,
      arrowPoints: arrowPolygon('up', tx, ty),
      arrowFill: connColor(conn),
      labelX: sx + 8,
      labelY: (sy + ty) / 2,
      direction: 'up',
    };
  }
}

/**
 * Cross-lane downward path (source lane index < target lane index).
 * Routes orthogonally: exit horizontally, then vertically, then horizontally
 * into the target — never cutting diagonally through lane bodies.
 *   Straight vertical when x is close (within 12px).
 *   Otherwise: M sx,sy -> L midX,sy -> L midX,ty -> L tx-9,ty  (enter from left)
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

  // Route: exit horizontally from source, vertical transition, enter target horizontally
  const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('right', tx, ty),
    arrowFill: connColor(conn),
    labelX: midX + 8,
    labelY: (sy + ty) / 2,
    direction: 'down',
  };
}

/**
 * Cross-lane upward path (source lane index > target lane index).
 * Routes orthogonally: exit horizontally, then vertically, then horizontally
 * into the target — never cutting diagonally through lane bodies.
 *   Straight vertical when x is close (within 12px).
 *   Otherwise: M sx,sy -> L midX,sy -> L midX,ty -> L tx-9,ty  (enter from left)
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

  // Route: exit horizontally from source, vertical transition, enter target horizontally
  const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('right', tx, ty),
    arrowFill: connColor(conn),
    labelX: midX + 8,
    labelY: (sy + ty) / 2,
    direction: 'up',
  };
}

/**
 * Elbow right-then-down path.
 * Route: exit horizontally, vertical transition at midX, enter target horizontally.
 *   M sx,sy -> L midX,sy -> L midX,ty -> L tx-9,ty
 */
export function elbowRightDown(sx, sy, tx, ty, conn) {
  const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('right', tx, ty),
    arrowFill: connColor(conn),
    labelX: midX + 8,
    labelY: (sy + ty) / 2,
    direction: 'elbow-right-down',
  };
}

/**
 * Elbow right-then-up path.
 * Route: exit horizontally, vertical transition at midX, enter target horizontally.
 *   M sx,sy -> L midX,sy -> L midX,ty -> L tx-9,ty
 */
export function elbowRightUp(sx, sy, tx, ty, conn) {
  const midX = safeMidX((sx + tx) / 2, Math.min(sy, ty), Math.max(sy, ty), _currentFromId, _currentToId);
  const pathD = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ty} L ${tx - 9},${ty}`;
  return {
    pathD,
    arrowPoints: arrowPolygon('right', tx, ty),
    arrowFill: connColor(conn),
    labelX: midX + 8,
    labelY: (sy + ty) / 2,
    direction: 'elbow-right-up',
  };
}

/**
 * Gateway "No" branch path: exit from the bottom tip of a diamond, route
 * below the lane boundary, then enter the target node from below.
 */
export function gatewayNoRight(sx, sy, tx, ty, conn, lane) {
  const hookY = lane.y + lane.height + (conn.offset || 18);
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
  const loopY = laneBounds.bottom + (conn.offset || 24);
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
      const originalLen = waypoints.length;
      addPaddingToWaypoints(waypoints, nodesMap, conn.from, conn.to);
      // Always rebuild — addPaddingToWaypoints may insert or adjust waypoints
      if (waypoints.length !== originalLen) {
        result.pathD = rebuildPathD(waypoints);
      } else {
        // Even same length, rebuild to apply any coordinate changes
        result.pathD = rebuildPathD(waypoints);
      }
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
  const tx = tgtBounds.x;
  const ty = tgtBounds.top;

  const seg = GATEWAY_EXIT_SEGMENT;

  switch (portId) {
    case 'out-left': {
      const exitX = sx - seg;
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${ty - 9} L ${tx},${ty - 9}`;
      return {
        pathD,
        arrowPoints: arrowPolygon(tx > exitX ? 'right' : 'down', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: ty - 18,
        direction: 'gateway-port-left',
      };
    }

    case 'out-right':
      return null;

    case 'out-bottom': {
      const exitY = sy + seg;
      // Always use orthogonal routing: vertical then horizontal then vertical
      const pathD = `M ${sx},${sy} L ${sx},${exitY} L ${tx},${exitY} L ${tx},${ty - 9}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('down', tx, ty),
        arrowFill: connColor(conn),
        labelX: (sx + tx) / 2,
        labelY: exitY - 8,
        direction: 'gateway-port-bottom',
      };
    }

    case 'out-bl': {
      const exitX = sx - seg * 0.7;
      const exitY = sy + seg * 0.7;
      // Orthogonal: go left, then down, then horizontal, then vertical to target
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${exitY} L ${tx},${exitY} L ${tx},${ty - 9}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('down', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: exitY - 8,
        direction: 'gateway-port-bl',
      };
    }

    case 'out-br': {
      const exitX = sx + seg * 0.7;
      const exitY = sy + seg * 0.7;
      // Orthogonal: go right, then down, then horizontal, then vertical to target
      const pathD = `M ${sx},${sy} L ${exitX},${sy} L ${exitX},${exitY} L ${tx},${exitY} L ${tx},${ty - 9}`;
      return {
        pathD,
        arrowPoints: arrowPolygon('down', tx, ty),
        arrowFill: connColor(conn),
        labelX: (exitX + tx) / 2,
        labelY: exitY - 8,
        direction: 'gateway-port-br',
      };
    }

    default:
      return null;
  }
}

function resolveGatewayOutPort(conn, srcBounds, tgtBounds) {
  if (conn.sourcePort) return conn.sourcePort;

  const sameLane = srcBounds.laneIndex === tgtBounds.laneIndex;

  if (conn.decision === 'yes') return 'out-right';
  if (conn.decision === 'no') {
    // Same-lane targets to the right: use out-right (handled by straightHoriz
    // which creates a Z-bend if Y differs). This avoids the bottom-exit detour
    // that causes non-horizontal lines for vertically stacked targets.
    if (sameLane && tgtBounds.x > srcBounds.x) return 'out-right';
    if (tgtBounds.x > srcBounds.x) return 'out-bottom';
    return 'out-left';
  }

  const dx = tgtBounds.x - srcBounds.x;
  const dy = tgtBounds.y - srcBounds.y;

  if (dx > 20) return 'out-right';
  if (dx < -20) return 'out-left';
  if (dy > 0) return 'out-bottom';
  return 'out-right';
}

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

  // Gateway outgoing: use port-based angular separation
  if (srcBounds.type === 'gateway') {
    const outPort = resolveGatewayOutPort(conn, srcBounds, tgtBounds);
    if (outPort && outPort !== 'out-right') {
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
      const lane = layout.lanes[srcBounds.laneIndex];
      const laneBounds = lane
        ? { bottom: lane.y + lane.height }
        : { bottom: sy + 40 };
      result = loopBack(sx, sy, tx, ty, conn, laneBounds);
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

  // Build a map of only visible nodes for obstacle avoidance.
  // This prevents arrows from detouring around invisible nodes in before/after views.
  const visibleNodesMap = {};
  for (const node of (graph.nodes || [])) {
    if (isVisible(node, viewMode, state.selectedPhase) && layout.nodes[node.id]) {
      visibleNodesMap[node.id] = layout.nodes[node.id];
    }
  }

  const visible = (graph.connections || []).filter(
    conn => isVisible(conn, viewMode, state.selectedPhase)
  );

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

  const visible = (graph.connections || []).filter(
    c => (c.from === nodeId || c.to === nodeId) && isVisible(c, viewMode, state.selectedPhase)
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
}
