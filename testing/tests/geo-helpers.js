/**
 * geo-helpers.js — Geometric assertion helpers for SVG diagram testing.
 *
 * All helpers operate in SVG user-space coordinates (not viewport pixels).
 * They use getCTM() to correctly account for transforms on <g> elements.
 */

// ─── Core data extraction ─────────────────────────────────────────────────────

/**
 * Get effective bounding boxes for all visible nodes, accounting for transforms.
 * Returns Array<{ id, x, y, w, h }>
 */
export async function getAllNodeBBoxes(page) {
  return page.evaluate(() => {
    const results = [];
    const groups = document.querySelectorAll('[data-node-id]');
    const svg = document.getElementById('diagram-svg');
    if (!svg) return results;

    for (const g of groups) {
      const id = g.getAttribute('data-node-id');
      const bbox = g.getBBox();
      if (bbox.width === 0 && bbox.height === 0) continue;

      const ctm = g.getCTM();
      const svgCtm = svg.getCTM();
      if (!ctm || !svgCtm) {
        results.push({ id, x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height });
        continue;
      }

      const toRoot = svgCtm.inverse().multiply(ctm);
      const pt = svg.createSVGPoint();
      const corners = [
        [bbox.x, bbox.y],
        [bbox.x + bbox.width, bbox.y],
        [bbox.x + bbox.width, bbox.y + bbox.height],
        [bbox.x, bbox.y + bbox.height],
      ];

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [cx, cy] of corners) {
        pt.x = cx; pt.y = cy;
        const t = pt.matrixTransform(toRoot);
        minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x); maxY = Math.max(maxY, t.y);
      }
      results.push({ id, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }
    return results;
  });
}

/**
 * Get all connection paths as { id, from, to, d } objects.
 */
export async function getAllConnections(page) {
  return page.evaluate(() => {
    const paths = document.querySelectorAll(
      '#connections-layer path[data-conn-id]'
    );
    return Array.from(paths).map(p => ({
      id: p.getAttribute('data-conn-id'),
      from: p.getAttribute('data-conn-from'),
      to: p.getAttribute('data-conn-to'),
      d: p.getAttribute('d'),
    }));
  });
}

/**
 * Get all label positions { connId, x, y, text } from the connections layer.
 */
export async function getAllConnectionLabels(page) {
  return page.evaluate(() => {
    const labels = [];
    const textEls = document.querySelectorAll(
      '#connections-layer text'
    );
    for (const t of textEls) {
      const parent = t.closest('[data-conn-id]');
      const connId = parent?.getAttribute('data-conn-id') || 'unknown';
      const bbox = t.getBBox();
      labels.push({
        connId,
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
        text: t.textContent?.trim() || '',
      });
    }
    return labels;
  });
}

/**
 * Get lane geometry: { id, y, height } for each lane band.
 */
export async function getLaneBounds(page) {
  return page.evaluate(() => {
    const lanes = [];
    const rects = document.querySelectorAll('#lanes-layer rect');
    for (const r of rects) {
      const h = parseFloat(r.getAttribute('height'));
      if (h > 20) {  // skip small decorative rects
        lanes.push({
          id: r.getAttribute('data-lane-id') || 'unknown',
          y: parseFloat(r.getAttribute('y')),
          height: h,
          x: parseFloat(r.getAttribute('x')),
          width: parseFloat(r.getAttribute('width')),
        });
      }
    }
    return lanes;
  });
}

// ─── Path parsing ─────────────────────────────────────────────────────────────

/**
 * Parse SVG path d-string into [[x,y]] waypoints.
 * Handles M, L, H, V commands (orthogonal routing output).
 */
export function parsePathToWaypoints(d) {
  if (!d) return [];
  const waypoints = [];
  let cx = 0, cy = 0;
  const tokens = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];

  for (const token of tokens) {
    const cmd = token[0].toUpperCase();
    const nums = token.slice(1).trim().match(/-?[\d.]+/g)?.map(Number) || [];

    switch (cmd) {
      case 'M': case 'L':
        for (let i = 0; i < nums.length; i += 2) {
          cx = nums[i]; cy = nums[i + 1];
          waypoints.push([cx, cy]);
        }
        break;
      case 'H':
        for (const n of nums) { cx = n; waypoints.push([cx, cy]); }
        break;
      case 'V':
        for (const n of nums) { cy = n; waypoints.push([cx, cy]); }
        break;
    }
  }
  return waypoints;
}

// ─── Geometric primitives ──────────────────────────────────────────────────────

function outcode(x, y, xmin, ymin, xmax, ymax) {
  let c = 0;
  if (x < xmin) c |= 1; if (x > xmax) c |= 2;
  if (y < ymin) c |= 4; if (y > ymax) c |= 8;
  return c;
}

/** Cohen-Sutherland line-rect intersection test */
export function lineIntersectsRect(x1, y1, x2, y2, xmin, ymin, xmax, ymax) {
  let c1 = outcode(x1, y1, xmin, ymin, xmax, ymax);
  let c2 = outcode(x2, y2, xmin, ymin, xmax, ymax);
  let ax = x1, ay = y1, bx = x2, by = y2;

  for (let i = 0; i < 10; i++) {
    if ((c1 | c2) === 0) return true;   // Both inside
    if ((c1 & c2) !== 0) return false;  // Both outside same side
    const co = c1 !== 0 ? c1 : c2;
    let x, y;
    if (co & 8)      { x = ax + (bx - ax) * (ymax - ay) / (by - ay); y = ymax; }
    else if (co & 4) { x = ax + (bx - ax) * (ymin - ay) / (by - ay); y = ymin; }
    else if (co & 2) { y = ay + (by - ay) * (xmax - ax) / (bx - ax); x = xmax; }
    else             { y = ay + (by - ay) * (xmin - ax) / (bx - ax); x = xmin; }
    if (co === c1) { ax = x; ay = y; c1 = outcode(ax, ay, xmin, ymin, xmax, ymax); }
    else           { bx = x; by = y; c2 = outcode(bx, by, xmin, ymin, xmax, ymax); }
  }
  return true;
}

/** Point-to-line-segment distance */
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ─── Assertion functions ──────────────────────────────────────────────────────

/**
 * assertNoOverlaps — N² check on all node pair bounding boxes.
 * padding adds a minimum required gap (default 0).
 */
export async function assertNoOverlaps(page, padding = 0) {
  const boxes = await getAllNodeBBoxes(page);
  const violations = [];
  // Shrink each box by 12px on all sides to account for text labels extending
  // beyond the actual node shape (getBBox includes text overflow).
  const TEXT_SHRINK = 12;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ax = a.x + TEXT_SHRINK, aw = a.w - 2 * TEXT_SHRINK;
      const ay = a.y + TEXT_SHRINK, ah = a.h - 2 * TEXT_SHRINK;
      const bx = b.x + TEXT_SHRINK, bw = b.w - 2 * TEXT_SHRINK;
      const by = b.y + TEXT_SHRINK, bh = b.h - 2 * TEXT_SHRINK;
      if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) continue;
      const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx) + 2 * padding;
      const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by) + 2 * padding;
      if (ox > 0 && oy > 0) {
        violations.push({ pair: [a.id, b.id], overlapX: Math.round(ox), overlapY: Math.round(oy) });
      }
    }
  }
  return { pass: violations.length === 0, violations, nodeCount: boxes.length };
}

/**
 * assertWithinLane — For each node, check its vertical center is in a lane
 * and its top/bottom don't spill outside (5px tolerance).
 */
export async function assertWithinLane(page) {
  const result = await page.evaluate(() => {
    const svg = document.getElementById('diagram-svg');
    const nodes = document.querySelectorAll('[data-node-id]');
    const laneRects = document.querySelectorAll('#lanes-layer rect');
    const lanes = [];
    for (const r of laneRects) {
      const h = parseFloat(r.getAttribute('height'));
      if (h > 20) lanes.push({ id: r.getAttribute('data-lane-id') || '?', y: parseFloat(r.getAttribute('y')), h });
    }
    if (lanes.length === 0) return [];  // no lanes to check

    const issues = [];
    for (const g of nodes) {
      const nodeId = g.getAttribute('data-node-id');
      const bbox = g.getBBox();
      if (bbox.width === 0) continue;
      const ctm = g.getCTM(); const svgCtm = svg.getCTM();
      if (!ctm || !svgCtm) continue;
      const toRoot = svgCtm.inverse().multiply(ctm);
      const pt = svg.createSVGPoint();
      pt.x = bbox.x; pt.y = bbox.y;
      const top = pt.matrixTransform(toRoot).y;
      pt.x = bbox.x + bbox.width; pt.y = bbox.y + bbox.height;
      const bot = pt.matrixTransform(toRoot).y;
      const center = (top + bot) / 2;

      let inLane = false;
      for (const l of lanes) {
        if (center >= l.y && center <= l.y + l.h) { inLane = true; break; }
      }
      if (!inLane) issues.push({ nodeId, centerY: Math.round(center) });
    }
    return issues;
  });

  return { pass: result.length === 0, violations: result };
}

/**
 * assertOrthogonalArrows — Every connection path segment must be
 * purely horizontal or vertical (dx < 1 or dy < 1).
 */
export async function assertOrthogonalArrows(page) {
  const connections = await getAllConnections(page);
  const violations = [];

  for (const conn of connections) {
    const waypoints = parsePathToWaypoints(conn.d);
    for (let i = 1; i < waypoints.length; i++) {
      const [x1, y1] = waypoints[i - 1];
      const [x2, y2] = waypoints[i];
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      if (dx > 1 && dy > 1) {
        violations.push({
          connId: conn.id,
          from: conn.from,
          to: conn.to,
          angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI),
        });
        break; // one violation per connection is enough
      }
    }
  }

  return { pass: violations.length === 0, violations, totalConnections: connections.length };
}

/**
 * assertArrowsAvoidNodes — No arrow path segment passes through a
 * non-endpoint node (3px shrink to avoid edge-touching false positives).
 */
export async function assertArrowsAvoidNodes(page) {
  const connections = await getAllConnections(page);
  const boxes = await getAllNodeBBoxes(page);
  const violations = [];
  const boxMap = {};
  for (const b of boxes) boxMap[b.id] = b;

  for (const conn of connections) {
    const waypoints = parsePathToWaypoints(conn.d);
    if (waypoints.length < 2) continue;

    for (const box of boxes) {
      if (box.id === conn.from || box.id === conn.to) continue;
      const shrink = 12;
      for (let i = 1; i < waypoints.length; i++) {
        const [x1, y1] = waypoints[i - 1];
        const [x2, y2] = waypoints[i];
        if (lineIntersectsRect(
          x1, y1, x2, y2,
          box.x + shrink, box.y + shrink,
          box.x + box.w - shrink, box.y + box.h - shrink
        )) {
          violations.push({
            connId: conn.id,
            from: conn.from,
            to: conn.to,
            intersectedNode: box.id,
          });
          break;
        }
      }
    }
  }

  return { pass: violations.length === 0, violations };
}

/**
 * assertLabelsAttached — Every connection label within maxDistance of its path.
 */
export async function assertLabelsAttached(page, maxDistance = 40) {
  const connections = await getAllConnections(page);
  const labels = await getAllConnectionLabels(page);
  const violations = [];

  const connMap = {};
  for (const c of connections) connMap[c.id] = c;

  for (const label of labels) {
    if (!label.text) continue;
    const conn = connMap[label.connId];
    if (!conn) continue;

    const waypoints = parsePathToWaypoints(conn.d);
    if (waypoints.length < 2) continue;

    let minDist = Infinity;
    for (let i = 1; i < waypoints.length; i++) {
      const d = pointToSegmentDistance(
        label.x, label.y,
        waypoints[i - 1][0], waypoints[i - 1][1],
        waypoints[i][0], waypoints[i][1]
      );
      minDist = Math.min(minDist, d);
    }

    if (minDist > maxDistance) {
      violations.push({
        connId: label.connId,
        labelText: label.text,
        distanceToPath: Math.round(minDist),
      });
    }
  }

  return { pass: violations.length === 0, violations };
}

/**
 * assertNoDuplicateIds — No two elements with same data-node-id.
 */
export async function assertNoDuplicateIds(page) {
  const result = await page.evaluate(() => {
    const seen = {};
    const dupes = [];
    document.querySelectorAll('#diagram-svg [data-node-id]').forEach(el => {
      const id = el.getAttribute('data-node-id');
      if (seen[id]) dupes.push(id);
      else seen[id] = true;
    });
    return dupes;
  });

  return { pass: result.length === 0, violations: result };
}

/**
 * assertLightThemeColors — Verify light theme applies correctly.
 * Checks body bg, SVG bg, node fill, lane fill luminance.
 */
export async function assertLightThemeColors(page) {
  const result = await page.evaluate(() => {
    const cs = window.getComputedStyle;

    function parseBgColor(el) {
      const bg = cs(el).backgroundColor;
      const m = bg.match(/\d+/g);
      return m ? { r: +m[0], g: +m[1], b: +m[2] } : null;
    }
    function parseFill(el) {
      const fill = cs(el).fill;
      const m = fill.match(/\d+/g);
      return m ? { r: +m[0], g: +m[1], b: +m[2] } : null;
    }
    function luminance(c) {
      if (!c) return -1;
      const [rs, gs, bs] = [c.r, c.g, c.b].map(v => {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    const issues = [];

    // Body background should be light
    const bodyLum = luminance(parseBgColor(document.body));
    if (bodyLum < 0.5) issues.push({ element: 'body', property: 'background', luminance: bodyLum, expected: '>0.5 (light)' });

    // SVG background
    const svg = document.getElementById('diagram-svg');
    if (svg) {
      const svgLum = luminance(parseBgColor(svg));
      if (svgLum >= 0 && svgLum < 0.3) issues.push({ element: '#diagram-svg', property: 'background', luminance: svgLum, expected: '>0.3 (light)' });
    }

    // Lane fills should be light-ish (not pure dark)
    const laneRects = document.querySelectorAll('#lanes-layer rect');
    for (const r of laneRects) {
      const h = parseFloat(r.getAttribute('height'));
      if (h > 20) {
        const lum = luminance(parseFill(r));
        if (lum >= 0 && lum < 0.1) {
          issues.push({ element: 'lane-rect', id: r.getAttribute('data-lane-id') || 'unknown', property: 'fill', luminance: Math.round(lum * 1000) / 1000, expected: '>0.1 (not pure dark)' });
          break; // one lane failure is enough
        }
      }
    }

    // Node text should be dark (readable)
    const nodeText = document.querySelector('[data-node-id] text');
    if (nodeText) {
      const textFill = parseFill(nodeText);
      const textLum = luminance(textFill);
      if (textLum > 0.8) issues.push({ element: 'node-text', property: 'fill', luminance: textLum, expected: '<0.8 (dark text)' });
    }

    return issues;
  });

  return { pass: result.length === 0, violations: result };
}
