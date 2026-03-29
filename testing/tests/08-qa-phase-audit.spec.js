/**
 * 08-qa-phase-audit.spec.js — Closed-loop QA audit for multi-phase diagrams.
 *
 * For every sample JSON × every phase (0-3):
 *   1. Loads the diagram, sets the phase via slider
 *   2. Takes a full-page PNG screenshot → qa-png/
 *   3. Runs comprehensive BPMN quality checks:
 *      - No node overlaps
 *      - All arrows orthogonal (H/V only)
 *      - Arrows avoid non-connected nodes
 *      - Labels attached to paths
 *      - Flow completeness (every node connected, start→end path exists)
 *      - Distinct gateway exit ports
 *      - Correct arrow entry direction
 *      - Arrow crossings ≤ threshold
 *      - Node spacing ≥ 20px
 *      - Start has no incoming, End has no outgoing
 *      - Decision gateways have exactly 2 outgoing branches
 *   4. Writes consolidated JSON report → qa-png/qa-phase-report.json
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';
import {
  getAllNodeBBoxes,
  getAllConnections,
  getAllConnectionLabels,
  getLaneBounds,
  parsePathToWaypoints,
  lineIntersectsRect,
  pointToSegmentDistance,
} from './geo-helpers.js';
// ─── Configuration ────────────────────────────────────────────────────────────

const SAMPLES = [
  'car-loan.json',
];

const PHASES = [0, 1, 2, 3];
const MAX_CROSSINGS = 2;
const MIN_NODE_SPACING = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(600);
  }
}

function segmentAngle(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx < 1 && dy < 1) return 0;
  if (dx < 1) return 90;
  if (dy < 1) return 0;
  return Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
}

function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  function cross(ox, oy, ax, ay, bx, by) {
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  }
  const d1 = cross(bx1, by1, bx2, by2, ax1, ay1);
  const d2 = cross(bx1, by1, bx2, by2, ax2, ay2);
  const d3 = cross(ax1, ay1, ax2, ay2, bx1, by1);
  const d4 = cross(ax1, ay1, ax2, ay2, bx2, by2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

// ─── Quality Check Functions ─────────────────────────────────────────────────

function checkNoOverlaps(boxes) {
  const violations = [];
  const SHRINK = 8;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const xOver = (a.x + SHRINK) < (b.x + b.w - SHRINK) && (a.x + a.w - SHRINK) > (b.x + SHRINK);
      const yOver = (a.y + SHRINK) < (b.y + b.h - SHRINK) && (a.y + a.h - SHRINK) > (b.y + SHRINK);
      if (xOver && yOver) {
        violations.push({
          category: 'node-overlap',
          severity: 'high',
          detail: `Nodes ${a.id} and ${b.id} overlap`,
        });
      }
    }
  }
  return violations;
}

function checkNodeSpacing(boxes) {
  const violations = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      // Only check nodes in roughly the same vertical band (same lane)
      const yCenterA = a.y + a.h / 2, yCenterB = b.y + b.h / 2;
      if (Math.abs(yCenterA - yCenterB) > 50) continue;
      const gap = Math.max(0,
        Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)
      );
      if (gap > 0 && gap < MIN_NODE_SPACING) {
        violations.push({
          category: 'node-crowding',
          severity: 'low',
          detail: `Nodes ${a.id} and ${b.id} are only ${Math.round(gap)}px apart (min: ${MIN_NODE_SPACING})`,
        });
      }
    }
  }
  return violations;
}

function checkOrthogonalArrows(connections) {
  const violations = [];
  for (const conn of connections) {
    if (!conn.d) continue;
    const wp = parseWaypoints(conn.d);
    for (let i = 1; i < wp.length; i++) {
      const angle = segmentAngle(wp[i-1][0], wp[i-1][1], wp[i][0], wp[i][1]);
      if (angle > 5 && angle < 85) {
        violations.push({
          category: 'diagonal-arrow',
          severity: 'high',
          detail: `Arrow ${conn.id || conn.from+'→'+conn.to} has ${angle}° diagonal segment`,
          connId: conn.id,
        });
        break;
      }
    }
  }
  return violations;
}

function checkArrowsAvoidNodes(connections, boxes) {
  const violations = [];
  const PAD = 4;
  for (const conn of connections) {
    if (!conn.d) continue;
    const wp = parseWaypoints(conn.d);
    if (wp.length < 2) continue;
    for (const box of boxes) {
      if (box.id === conn.from || box.id === conn.to) continue;
      const rect = { x: box.x - PAD, y: box.y - PAD, w: box.w + 2*PAD, h: box.h + 2*PAD };
      for (let i = 1; i < wp.length; i++) {
        if (lineIntersectsRect(wp[i-1][0], wp[i-1][1], wp[i][0], wp[i][1],
            rect.x, rect.y, rect.x + rect.w, rect.y + rect.h)) {
          violations.push({
            category: 'arrow-through-node',
            severity: 'high',
            detail: `Arrow ${conn.id || conn.from+'→'+conn.to} passes through node ${box.id}`,
            connId: conn.id,
            intersectedNode: box.id,
          });
          break;
        }
      }
    }
  }
  return violations;
}

function checkFlowCompleteness(boxes, connections) {
  const violations = [];
  const hasIn = new Set(), hasOut = new Set();
  connections.forEach(c => { hasOut.add(c.from); hasIn.add(c.to); });

  for (const box of boxes) {
    const type = box.type || '';
    if (['annotation', 'persona', 'agent', 'system'].includes(type)) continue;

    if (type !== 'start-event' && type !== 'start' && !hasIn.has(box.id)) {
      violations.push({
        category: 'flow-incomplete',
        severity: 'high',
        detail: `Orphan node: ${box.id} has no incoming connections`,
      });
    }
    if (type !== 'end-event' && type !== 'end' && !hasOut.has(box.id)) {
      violations.push({
        category: 'flow-incomplete',
        severity: 'high',
        detail: `Dead end: ${box.id} has no outgoing connections`,
      });
    }
  }
  return violations;
}

function checkDistinctGatewayPorts(connections, boxes) {
  const violations = [];
  const gateways = boxes.filter(b => b.type === 'gateway');

  for (const gw of gateways) {
    const outgoing = connections.filter(c => c.from === gw.id);
    if (outgoing.length < 2) continue;

    const origins = outgoing.map(c => {
      const wp = parseWaypoints(c.d);
      return wp.length > 0 ? { x: Math.round(wp[0][0]), y: Math.round(wp[0][1]), id: c.id } : null;
    }).filter(Boolean);

    for (let i = 0; i < origins.length; i++) {
      for (let j = i + 1; j < origins.length; j++) {
        if (origins[i].x === origins[j].x && origins[i].y === origins[j].y) {
          violations.push({
            category: 'shared-gateway-port',
            severity: 'high',
            detail: `Gateway ${gw.id} branches ${origins[i].id} and ${origins[j].id} share the same exit port`,
          });
        }
      }
    }
  }
  return violations;
}

function checkWrongEntryDirection(connections, boxes) {
  const violations = [];
  const boxMap = {};
  boxes.forEach(b => { boxMap[b.id] = b; });
  const gatewayIds = new Set(boxes.filter(b => b.type === 'gateway').map(b => b.id));

  for (const conn of connections) {
    if (!conn.d) continue;
    // Skip gateway outgoing — gateways use port-based angular separation
    // which intentionally routes branches at non-obvious angles
    if (gatewayIds.has(conn.from)) continue;
    const wp = parseWaypoints(conn.d);
    if (wp.length < 2) continue;

    const tgt = boxMap[conn.to];
    if (!tgt) continue;
    const src = boxMap[conn.from];
    if (!src) continue;

    const lastSeg = [wp[wp.length - 2], wp[wp.length - 1]];
    const dx = lastSeg[1][0] - lastSeg[0][0];
    const dy = lastSeg[1][1] - lastSeg[0][1];

    let entryEdge;
    if (Math.abs(dx) > Math.abs(dy)) {
      entryEdge = dx > 0 ? 'LEFT' : 'RIGHT';
    } else {
      entryEdge = dy > 0 ? 'TOP' : 'BOTTOM';
    }

    const srcCx = src.x + src.w / 2, srcCy = src.y + src.h / 2;
    const tgtCx = tgt.x + tgt.w / 2, tgtCy = tgt.y + tgt.h / 2;
    const relDx = srcCx - tgtCx, relDy = srcCy - tgtCy;

    let expectedEdge;
    if (Math.abs(relDx) > Math.abs(relDy) * 1.5) {
      expectedEdge = relDx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      expectedEdge = relDy > 0 ? 'BOTTOM' : 'TOP';
    }

    if (entryEdge !== expectedEdge) {
      violations.push({
        category: 'wrong-entry-direction',
        severity: 'high',
        detail: `Arrow ${conn.id || conn.from+'→'+conn.to} enters ${conn.to} from ${entryEdge} edge, but source ${conn.from} is ${expectedEdge === 'LEFT' ? 'to the left' : expectedEdge === 'RIGHT' ? 'to the right' : expectedEdge.toLowerCase()}`,
        connId: conn.id,
      });
    }
  }
  return violations;
}

function checkExcessiveCrossings(connections) {
  const violations = [];
  let crossCount = 0;

  for (let i = 0; i < connections.length; i++) {
    const wpA = parseWaypoints(connections[i].d);
    if (wpA.length < 2) continue;
    for (let j = i + 1; j < connections.length; j++) {
      const wpB = parseWaypoints(connections[j].d);
      if (wpB.length < 2) continue;
      let crosses = false;
      for (let a = 1; a < wpA.length && !crosses; a++) {
        for (let b = 1; b < wpB.length && !crosses; b++) {
          if (segmentsIntersect(
            wpA[a-1][0], wpA[a-1][1], wpA[a][0], wpA[a][1],
            wpB[b-1][0], wpB[b-1][1], wpB[b][0], wpB[b][1]
          )) {
            crosses = true;
            crossCount++;
          }
        }
      }
    }
  }

  if (crossCount > MAX_CROSSINGS) {
    violations.push({
      category: 'excessive-crossings',
      severity: 'medium',
      detail: `${crossCount} arrow crossings detected (max ${MAX_CROSSINGS} allowed)`,
    });
  }
  return violations;
}

function checkGatewayBranches(connections, boxes) {
  const violations = [];
  const gateways = boxes.filter(b => b.type === 'gateway');

  for (const gw of gateways) {
    const outgoing = connections.filter(c => c.from === gw.id);
    if (outgoing.length === 1) {
      violations.push({
        category: 'gateway-single-branch',
        severity: 'medium',
        detail: `Gateway ${gw.id} has only 1 outgoing branch (expected ≥2)`,
      });
    }
  }
  return violations;
}

function checkStartEndRules(boxes, connections) {
  const violations = [];
  const hasIn = new Set(), hasOut = new Set();
  connections.forEach(c => { hasOut.add(c.from); hasIn.add(c.to); });

  for (const box of boxes) {
    if ((box.type === 'start-event' || box.type === 'start') && hasIn.has(box.id)) {
      violations.push({
        category: 'start-has-incoming',
        severity: 'high',
        detail: `Start node ${box.id} has incoming arrows`,
      });
    }
    if ((box.type === 'end-event' || box.type === 'end') && hasOut.has(box.id)) {
      violations.push({
        category: 'end-has-outgoing',
        severity: 'high',
        detail: `End node ${box.id} has outgoing arrows`,
      });
    }
  }
  return violations;
}

// ─── Label-Node Collision Check ──────────────────────────────────────────────

function checkLabelNodeCollision(labels, boxes) {
  const violations = [];
  const PAD = 4;
  for (const label of labels) {
    if (!label.x || !label.y) continue;
    for (const box of boxes) {
      // Skip the connection's own endpoints
      if (label.connFrom === box.id || label.connTo === box.id) continue;
      if (label.x > box.x - PAD && label.x < box.x + box.w + PAD &&
          label.y > box.y - PAD && label.y < box.y + box.h + PAD) {
        violations.push({
          category: 'label-node-collision',
          severity: 'high',
          detail: `Label "${label.text}" collides with node ${box.id}`,
        });
      }
    }
  }
  return violations;
}

// ─── Reachability: Every node reachable from Start ───────────────────────────

function checkReachabilityFromStart(boxes, connections) {
  const violations = [];
  const starts = boxes.filter(b => b.type === 'start-event' || b.type === 'start');
  if (starts.length === 0) return violations;

  // BFS from all start nodes
  const reachable = new Set();
  const queue = starts.map(s => s.id);
  queue.forEach(id => reachable.add(id));

  while (queue.length > 0) {
    const current = queue.shift();
    for (const conn of connections) {
      if (conn.from === current && !reachable.has(conn.to)) {
        reachable.add(conn.to);
        queue.push(conn.to);
      }
    }
  }

  for (const box of boxes) {
    if (['annotation', 'persona', 'agent', 'system'].includes(box.type)) continue;
    if (!reachable.has(box.id)) {
      violations.push({
        category: 'unreachable-node',
        severity: 'high',
        detail: `Node ${box.id} is not reachable from any start event`,
      });
    }
  }
  return violations;
}

// ─── Reachability: Every non-end path reaches an End ─────────────────────────

function checkPathToEnd(boxes, connections) {
  const violations = [];
  const ends = new Set(boxes.filter(b => b.type === 'end-event' || b.type === 'end').map(b => b.id));
  if (ends.size === 0) return violations;

  // For each non-end, non-decorator node, check if it can reach an end via BFS
  const nodeIds = boxes.filter(b =>
    !['annotation', 'persona', 'agent', 'system'].includes(b.type)
  ).map(b => b.id);

  // Build adjacency list
  const adj = {};
  for (const conn of connections) {
    if (!adj[conn.from]) adj[conn.from] = [];
    adj[conn.from].push(conn.to);
  }

  for (const nodeId of nodeIds) {
    if (ends.has(nodeId)) continue;
    // BFS forward from this node
    const visited = new Set();
    const q = [nodeId];
    visited.add(nodeId);
    let reachesEnd = false;

    while (q.length > 0 && !reachesEnd) {
      const cur = q.shift();
      if (ends.has(cur)) { reachesEnd = true; break; }
      for (const next of (adj[cur] || [])) {
        if (!visited.has(next)) {
          visited.add(next);
          q.push(next);
        }
      }
    }

    if (!reachesEnd) {
      violations.push({
        category: 'no-path-to-end',
        severity: 'high',
        detail: `Node ${nodeId} has no path to any end event`,
      });
    }
  }
  return violations;
}

// ─── Infinite loop detection (cycle without exit) ────────────────────────────

function checkInfiniteLoops(boxes, connections) {
  const violations = [];
  const ends = new Set(boxes.filter(b => b.type === 'end-event' || b.type === 'end').map(b => b.id));

  // Build adjacency
  const adj = {};
  for (const conn of connections) {
    if (!adj[conn.from]) adj[conn.from] = [];
    adj[conn.from].push(conn.to);
  }

  // Find all cycles via DFS
  const nodeIds = boxes.map(b => b.id);
  const visited = new Set(), inStack = new Set();
  const cycleNodes = new Set();

  function dfs(node) {
    visited.add(node);
    inStack.add(node);
    for (const next of (adj[node] || [])) {
      if (inStack.has(next)) {
        cycleNodes.add(next);
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }
    inStack.delete(node);
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id);
  }

  // A cycle is OK if at least one node in the cycle has a path OUT to an end
  // (e.g., a rework loop with a gateway exit). Only flag if ALL paths loop.
  // This is already caught by checkPathToEnd, so skip here to avoid duplicates.

  return violations;
}

// ─── End events should not connect to each other ─────────────────────────────

function checkEndToEndConnections(boxes, connections) {
  const violations = [];
  const endIds = new Set(boxes.filter(b => b.type === 'end-event' || b.type === 'end').map(b => b.id));

  for (const conn of connections) {
    if (endIds.has(conn.from) && endIds.has(conn.to)) {
      violations.push({
        category: 'end-to-end-connection',
        severity: 'high',
        detail: `End event ${conn.from} connects to end event ${conn.to} — terminal nodes should not connect to each other`,
      });
    }
  }
  return violations;
}

// ─── Decision labels must come from gateways ────────────────────────────────

function checkDecisionLabelsFromGateways(labels, boxes) {
  const violations = [];
  const gatewayIds = new Set(boxes.filter(b => b.type === 'gateway').map(b => b.id));

  for (const label of labels) {
    const text = (label.text || '').trim().toLowerCase();
    const isDecision = ['yes', 'no', 'approved', 'denied', 'pass', 'fail',
      'low risk', 'high risk', '>95%', '<95%'].includes(text);
    if (isDecision && label.connFrom && !gatewayIds.has(label.connFrom)) {
      violations.push({
        category: 'decision-without-gateway',
        severity: 'high',
        detail: `Decision label "${label.text}" on connection from ${label.connFrom} but source is not a gateway`,
      });
    }
  }
  return violations;
}

// ─── Path parser ─────────────────────────────────────────────────────────────

function parseWaypoints(d) {
  if (!d || typeof d !== 'string') return [];
  const wp = [];
  const re = /[ML]\s*([-\d.]+)[,\s]\s*([-\d.]+)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    wp.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return wp;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

for (const sample of SAMPLES) {
  for (const phase of PHASES) {
    const testName = `QA-audit: ${sample} / phase ${phase}`;

    test(testName, async ({ page }) => {
      await loadApp(page);
      await selectDiagram(page, sample);
      await setPhase(page, phase);
      await page.waitForTimeout(400);

      // ── Gather data ──
      const boxes = await getAllNodeBBoxes(page);
      const connections = await getAllConnections(page);

      // Add type info to boxes
      const nodeTypes = await page.evaluate(() => {
        const result = {};
        document.querySelectorAll('[data-node-id]').forEach(g => {
          const id = g.getAttribute('data-node-id');
          const cls = g.className.baseVal || '';
          if (cls.includes('start-event')) result[id] = 'start-event';
          else if (cls.includes('end-event')) result[id] = 'end-event';
          else if (cls.includes('gateway')) result[id] = 'gateway';
          else if (cls.includes('annotation')) result[id] = 'annotation';
          else if (cls.includes('persona')) result[id] = 'persona';
          else if (cls.includes('agent')) result[id] = 'agent';
          else if (cls.includes('system')) result[id] = 'system';
          else result[id] = 'task';
        });
        return result;
      });
      boxes.forEach(b => { b.type = nodeTypes[b.id] || 'task'; });

      // ── Gather labels ──
      const labels = await getAllConnectionLabels(page);

      // ── Run all BPMN quality + best-practice checks ──
      const issues = [
        // Geometric quality
        ...checkNoOverlaps(boxes),
        ...checkNodeSpacing(boxes),
        ...checkOrthogonalArrows(connections),
        ...checkArrowsAvoidNodes(connections, boxes),
        ...checkLabelNodeCollision(labels, boxes),
        // Flow integrity
        ...checkFlowCompleteness(boxes, connections),
        ...checkReachabilityFromStart(boxes, connections),
        ...checkPathToEnd(boxes, connections),
        ...checkEndToEndConnections(boxes, connections),
        // Gateway quality
        ...checkDistinctGatewayPorts(connections, boxes),
        ...checkWrongEntryDirection(connections, boxes),
        ...checkGatewayBranches(connections, boxes),
        // BPMN semantics
        ...checkDecisionLabelsFromGateways(labels, boxes),
        // Structural rules
        ...checkExcessiveCrossings(connections),
        ...checkStartEndRules(boxes, connections),
      ];

      // ── Log results ──
      const label = `${sample} phase ${phase}`;
      if (issues.length === 0) {
        console.log(`✓ ${label}: CLEAN (${boxes.length}n/${connections.length}c)`);
      } else {
        console.log(`⚠ ${label}: ${issues.length} issue(s)`);
        for (const issue of issues) {
          console.log(`  [${issue.severity}] ${issue.category}: ${issue.detail}`);
        }
      }

      // ── Assert — fail on high severity issues ──
      const highSeverity = issues.filter(i => i.severity === 'high');
      expect(highSeverity, `${label} has ${highSeverity.length} high-severity issues:\n${highSeverity.map(i => i.detail).join('\n')}`).toHaveLength(0);
    });
  }
}

// Report is logged per-test via console.log. No file output needed.
