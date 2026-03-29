/**
 * interactions.js — User interaction layer
 *
 * Handles:
 *  - Node dragging with 10px grid snap (edit mode only)
 *  - Undo / Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
 *  - Inline label editing (double-click a node group)
 *  - Edit-mode toggle (#chk-edit-mode)
 *  - View-mode buttons (.view-btn)
 *  - Options menu (#btn-options, #options-menu)
 *  - Options checkboxes: show-editor, show-notes, light-mode
 *  - Delay slider wiring
 */

import { state, dom } from './state.js';
import { renderAll, renderPortIndicators, removePortIndicators, svgEl } from './renderer.js';
import { rerouteNodeConnections } from './routing.js';
import { NODE_DIMS, getAbsolutePortPosition, assignGatewayPort, computeLayout, findLaneAtY, autoResizeLanes } from './layout.js';
import { canConnect } from './data.js';
import { LANE_COLORS, LANE_TYPES, DEFAULT_LANE_TYPE } from './constants.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const GRID = 10;          // px — snap size (changed from 20 per spec 6.3)
const UNDO_LIMIT = 50;    // max entries in undo / redo stacks

// ─────────────────────────────────────────────────────────────
// Undo / Redo helpers
// ─────────────────────────────────────────────────────────────

// Ensure redoStack exists on state (task spec only guarantees undoStack)
if (!state.redoStack) state.redoStack = [];

/**
 * Capture the current graph as a JSON snapshot and push onto undoStack.
 * Clears the redoStack (a new action invalidates future redo history).
 * Caps the stack at UNDO_LIMIT entries.
 */
export function pushUndo() {
  if (!state.graph) return;
  state.undoStack.push(JSON.stringify(state.graph));
  if (state.undoStack.length > UNDO_LIMIT) {
    state.undoStack.shift();
  }
  // New action invalidates redo history
  state.redoStack = [];
}

/**
 * Pop the most recent undo snapshot, save the current state to redoStack,
 * restore graph, and re-render.
 */
function popUndo() {
  if (!state.undoStack.length) return;
  // Save current state for possible redo
  state.redoStack.push(JSON.stringify(state.graph));
  if (state.redoStack.length > UNDO_LIMIT) {
    state.redoStack.shift();
  }
  state.graph = JSON.parse(state.undoStack.pop());
  renderAll(state.graph);
}

/**
 * Pop the most recent redo snapshot, save the current state to undoStack,
 * restore graph, and re-render.
 */
function popRedo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify(state.graph));
  if (state.undoStack.length > UNDO_LIMIT) {
    state.undoStack.shift();
  }
  state.graph = JSON.parse(state.redoStack.pop());
  renderAll(state.graph);
}

// ─────────────────────────────────────────────────────────────
// Drag + Snap
// ─────────────────────────────────────────────────────────────

/**
 * Walk up the DOM from `el` to find the nearest ancestor (or self) that
 * is a <g> element with a data-node-id attribute. Returns null if none.
 */
function findNodeGroup(el) {
  let node = el;
  while (node && node !== document) {
    if (node.tagName === 'g' && node.dataset && node.dataset.nodeId) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Snap a coordinate value to the nearest GRID multiple.
 * @param {number} v — raw coordinate
 * @returns {number} snapped coordinate
 */
function snap(v) {
  return Math.round(v / GRID) * GRID;
}

/**
 * Return the SVG element's CTM (current transform matrix) so we can convert
 * screen-space mouse coordinates into SVG user-space coordinates.
 */
function svgPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const inv = ctm.inverse();
  const result = pt.matrixTransform(inv);
  return { x: result.x, y: result.y };
}

/**
 * AABB overlap test for two rectangles defined by center + half-dimensions.
 */
function rectsOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return (ax - ahw) < (bx + bhw) &&
         (ax + ahw) > (bx - bhw) &&
         (ay - ahh) < (by + bhh) &&
         (ay + ahh) > (by - bhh);
}

/**
 * Given candidate (cx, cy) for a dragged node, find the nearest grid-snapped
 * position that does not overlap any other node. Uses AABB rectangle test.
 * Searches outward in concentric rings trying 8 directions per ring.
 * Returns { x, y } of the resolved position.
 */
function findNonOverlappingPosition(cx, cy, dragNodeId, fallbackX, fallbackY) {
  if (!state.layout || !state.layout.nodes || !state.graph) return { x: cx, y: cy };

  const nodeData = state.graph.nodes.find(n => n.id === dragNodeId);
  if (!nodeData) return { x: cx, y: cy };

  const dims  = NODE_DIMS[nodeData.type] || { w: 110, h: 40 };
  const halfW = dims.w / 2;
  const halfH = dims.h / 2;

  // Collect all other node bounds
  const others = Object.entries(state.layout.nodes)
    .filter(([id]) => id !== dragNodeId)
    .map(([, b]) => b);

  function overlapsAny(testX, testY) {
    for (const b of others) {
      if (rectsOverlap(testX, testY, halfW, halfH, b.x, b.y, b.width / 2, b.height / 2)) {
        return true;
      }
    }
    return false;
  }

  if (!overlapsAny(cx, cy)) return { x: cx, y: cy };

  // Search outward in concentric rings (8 directions each)
  for (let step = 1; step <= 30; step++) {
    const d = step * GRID;
    const offsets = [
      [d, 0], [-d, 0], [0, d], [0, -d],
      [d, d], [-d, d], [d, -d], [-d, -d],
    ];
    for (const [ox, oy] of offsets) {
      const tx = snap(cx + ox);
      const ty = snap(cy + oy);
      if (!overlapsAny(tx, ty)) return { x: tx, y: ty };
    }
  }

  return { x: fallbackX, y: fallbackY };
}

/**
 * Legacy wrapper for mouseup — resolves only X axis (for backward compat).
 */
function findNonOverlappingX(candidateX, dragNodeId, startX) {
  if (!state.layout || !state.layout.nodes || !state.graph) return candidateX;
  const dragLayout = state.layout.nodes[dragNodeId];
  if (!dragLayout) return candidateX;
  const result = findNonOverlappingPosition(candidateX, dragLayout.y, dragNodeId, startX, dragLayout.y);
  return result.x;
}

/**
 * Remove lane highlight overlay if present.
 */
function removeLaneHighlight() {
  const existing = document.getElementById('lane-drop-highlight');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

/**
 * Show a semi-transparent blue overlay on the target lane during node drag.
 */
function showLaneHighlight(laneId) {
  removeLaneHighlight();
  if (!state.layout || !state.layout.lanes) return;
  const lane = state.layout.lanes.find(l => l.id === laneId);
  if (!lane) return;
  const lanesLayer = dom.lanesLayer;
  if (!lanesLayer) return;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('id', 'lane-drop-highlight');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', lane.y);
  rect.setAttribute('width', state.layout.svgWidth || 1200);
  rect.setAttribute('height', lane.height);
  rect.setAttribute('fill', 'rgba(59, 130, 246, 0.12)');
  rect.setAttribute('pointer-events', 'none');
  lanesLayer.appendChild(rect);
}

function initDrag() {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  // Drag state (local, not persisted on global state)
  let dragging = false;
  let dragGroup = null;   // The <g data-node-id="..."> element
  let nodeId = null;
  let dragNodeType = null;
  let offsetX = 0;        // SVG-space offset from node origin to pointer
  let offsetY = 0;
  let startX = 0;         // Original absolute position (for undo comparison)
  let startY = 0;         // Original absolute Y (from layout)
  let currentX = 0;
  let currentY = 0;       // Current absolute SVG Y during drag
  let startLaneId = null;  // Lane the node started in
  let currentLaneId = null; // Lane the node is currently hovering over

  // Capture pointer on pointerdown so that mouseup fires reliably after SVG drags.
  // Without this, Chromium's native SVG drag suppresses the mouseup event.
  nodesLayer.addEventListener('pointerdown', (e) => {
    if (!state.isEditing || e.button !== 0) return;
    if (e.target.classList && e.target.classList.contains('port-indicator')) return;
    const group = findNodeGroup(e.target);
    if (group && e.target.setPointerCapture) {
      e.target.setPointerCapture(e.pointerId);
    }
  });

  nodesLayer.addEventListener('mousedown', (e) => {
    if (!state.isEditing) return;
    if (e.button !== 0) return; // left button only

    // Do NOT initiate drag when clicking a port indicator (connect mode handles those)
    if (e.target.classList && e.target.classList.contains('port-indicator')) return;

    const group = findNodeGroup(e.target);
    if (!group) return;

    dragGroup = group;
    nodeId = group.dataset.nodeId;

    // Find the node in state.graph to get current position
    const nodeData = state.graph && state.graph.nodes
      ? state.graph.nodes.find(n => n.id === nodeId)
      : null;
    if (!nodeData) return;
    dragNodeType = nodeData.type;

    // Convert mouse position to SVG space
    const svgEl = dom.diagramSvg;
    const pt = svgPoint(svgEl, e.clientX, e.clientY);

    // Use layout center coordinates (absolute SVG space)
    const layoutNode = state.layout && state.layout.nodes ? state.layout.nodes[nodeId] : null;
    const nx = layoutNode ? layoutNode.x : (typeof nodeData.x === 'number' ? nodeData.x : 0);
    const ny = layoutNode ? layoutNode.y : 0;

    startX = nx;
    startY = ny;
    currentX = nx;
    currentY = ny;
    startLaneId = nodeData.lane || null;
    currentLaneId = startLaneId;

    // Offset = pointer position relative to node center in SVG space
    offsetX = pt.x - nx;
    offsetY = pt.y - ny;

    dragging = true;
    e.preventDefault();
  });

  // Use window listeners so drag continues if pointer leaves the layer
  window.addEventListener('mousemove', (e) => {
    if (!dragging || !dragGroup) return;

    const svgEl = dom.diagramSvg;
    const pt = svgPoint(svgEl, e.clientX, e.clientY);

    let candidateX = snap(pt.x - offsetX);
    let candidateY = snap(pt.y - offsetY);

    // Overlap prevention: push to nearest non-overlapping position (task 6.4)
    const resolved = findNonOverlappingPosition(candidateX, candidateY, nodeId, currentX, currentY);
    currentX = resolved.x;
    currentY = resolved.y;

    // Apply DELTA from the node's original position — group children use absolute
    // SVG coordinates, so we must not translate by the absolute target position.
    dragGroup.setAttribute('transform', `translate(${currentX - startX},${currentY - startY})`);

    // Keep layout in sync so edges drawn from layout coords stay roughly right.
    // Update both X and Y axis fields for full 2D drag.
    if (state.layout && state.layout.nodes && state.layout.nodes[nodeId]) {
      const layoutNode = state.layout.nodes[nodeId];
      const dims = NODE_DIMS[dragNodeType] || { w: 110, h: 40 };
      layoutNode.x      = currentX;
      layoutNode.y      = currentY;
      layoutNode.left   = currentX - dims.w / 2;
      layoutNode.right  = currentX + dims.w / 2;
      layoutNode.top    = currentY - dims.h / 2;
      layoutNode.bottom = currentY + dims.h / 2;
    }

    // Detect which lane the node center falls within and highlight it
    if (state.layout && state.layout.lanes) {
      const targetLaneId = findLaneAtY(currentY, null, state.layout.lanes);
      if (targetLaneId && targetLaneId !== currentLaneId) {
        currentLaneId = targetLaneId;
        showLaneHighlight(targetLaneId);
      }
    }

    // Re-route connections touching this node in place (no full re-render)
    rerouteNodeConnections(nodeId, state.graph, state.layout, state.viewMode);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) {
      // Safety net: clean up stale transforms from interrupted drags
      if (dragGroup) {
        dragGroup.removeAttribute('transform');
        dragGroup = null;
        if (state.graph) {
          state._skipLaneResize = true;
          renderAll(state.graph);
          state._skipLaneResize = false;
        }
      }
      return;
    }
    dragging = false;

    // Remove lane highlight
    removeLaneHighlight();

    // Anti-overlap: resolve any overlap before committing
    const resolvedFinal = findNonOverlappingPosition(currentX, currentY, nodeId, startX, startY);
    currentX = resolvedFinal.x;
    currentY = resolvedFinal.y;

    if (!nodeId || (currentX === startX && currentY === startY)) {
      if (dragGroup) dragGroup.removeAttribute('transform');
      dragGroup = null;
      nodeId = null;
      startLaneId = null;
      currentLaneId = null;
      return;
    }

    // Determine target lane from the final absolute Y position
    let targetLaneId = startLaneId;
    if (state.layout && state.layout.lanes) {
      targetLaneId = findLaneAtY(currentY, null, state.layout.lanes) || startLaneId;
    }

    // Commit position to state.graph — push undo BEFORE modifying
    pushUndo();

    if (state.graph && state.graph.nodes) {
      const nodeData = state.graph.nodes.find(n => n.id === nodeId);
      if (nodeData) {
        nodeData.x = currentX;

        // Compute laneY: position relative to the target lane's top
        const targetLaneLayout = state.layout.lanes.find(l => l.id === targetLaneId);
        if (targetLaneLayout) {
          nodeData.laneY = currentY - targetLaneLayout.y;
        }

        // Lane reassignment
        if (targetLaneId && targetLaneId !== nodeData.lane) {
          nodeData.lane = targetLaneId;

          // Update owner field to match new lane label if the node has an owner
          if (typeof nodeData.owner !== 'undefined') {
            const targetGraphLane = (state.graph.lanes || []).find(l => l.id === targetLaneId);
            if (targetGraphLane) {
              nodeData.owner = targetGraphLane.label || targetGraphLane.id;
            }
          }
        }
      }
    }

    // Re-render preserving lane sizes. Set a flag so renderAll skips
    // autoResizeLanes — we don't want swimlanes resizing during drag.
    state._skipLaneResize = true;
    renderAll(state.graph);
    state._skipLaneResize = false;

    dragGroup = null;
    nodeId = null;
    startLaneId = null;
    currentLaneId = null;
  });
}

// ─────────────────────────────────────────────────────────────
// Drag-to-Connect
// ─────────────────────────────────────────────────────────────

/** Connection-drawing state (null when not in connect mode). */
let connectState = null;

/** Distance threshold for port snapping during connect drag */
const PORT_SNAP_DISTANCE = 30;

/**
 * Generate a unique connection ID.
 */
function generateConnId() {
  return 'conn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/**
 * Convert screen coordinates to SVG user-space coordinates.
 */
function screenToSVG(clientX, clientY) {
  return svgPoint(dom.diagramSvg, clientX, clientY);
}

/**
 * Get the input port IDs for a node type.
 */
function getInPortIds(nodeType) {
  const portMap = {
    'task':               ['in-top'],
    'gateway':            ['in-top'],
    'merge':              ['in-top', 'in-left', 'in-right'],
    'start-event':        [],
    'end-event':          ['in-top', 'in-left'],
    'subprocess':         ['in-top'],
    'process-group':      ['in-left'],
    'intermediate-event': ['in-left'],
    'persona':            [],
    'system':             [],
    'agent':              [],
    'annotation':         [],
  };
  return portMap[nodeType] || [];
}

/**
 * Find the nearest valid target port within PORT_SNAP_DISTANCE of cursor.
 * Returns { node, portId, pos } or null.
 */
function findNearestValidPort(cursorSVG, validNodeIds) {
  let best = null;
  let bestDist = PORT_SNAP_DISTANCE;

  for (const nid of validNodeIds) {
    const bounds = state.layout && state.layout.nodes ? state.layout.nodes[nid] : null;
    if (!bounds) continue;

    const nodeData = state.graph.nodes.find(n => n.id === nid);
    if (!nodeData) continue;

    const inPorts = getInPortIds(nodeData.type);
    for (const portId of inPorts) {
      const pos = getAbsolutePortPosition(bounds, portId);
      if (!pos) continue;

      const dx = cursorSVG.x - pos.x;
      const dy = cursorSVG.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { node: nodeData, portId, pos };
      }
    }
  }

  return best;
}

/**
 * Apply CSS classes/styles to highlight valid/invalid targets during connect drag.
 */
function applyConnectHighlights(validTargetIds, invalidTargetIds) {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  const groups = nodesLayer.querySelectorAll('[data-node-id]');
  for (const g of groups) {
    const nid = g.dataset.nodeId;
    if (validTargetIds.has(nid)) {
      g.classList.add('connection-valid');
      g.style.opacity = '';
      // Show port indicators on valid targets
      const nodeData = state.graph.nodes.find(n => n.id === nid);
      const bounds = state.layout && state.layout.nodes ? state.layout.nodes[nid] : null;
      if (nodeData && bounds) {
        renderPortIndicators(g, nodeData, bounds, state.graph);
      }
    } else if (invalidTargetIds.has(nid)) {
      g.classList.remove('connection-valid');
      g.style.opacity = '0.3';
    }
  }
}

/**
 * Remove all connect-mode highlights from nodes.
 */
function clearConnectHighlights() {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  const groups = nodesLayer.querySelectorAll('[data-node-id]');
  for (const g of groups) {
    g.classList.remove('connection-valid');
    g.style.opacity = '';
    removePortIndicators(g);
  }
}

/**
 * Start connection drawing mode from a port indicator.
 */
function startConnect(sourceNodeId, sourcePortId, e) {
  const sourceNode = state.graph.nodes.find(n => n.id === sourceNodeId);
  if (!sourceNode) return;

  const sourceBounds = state.layout && state.layout.nodes
    ? state.layout.nodes[sourceNodeId]
    : null;
  if (!sourceBounds) return;

  const sourcePos = getAbsolutePortPosition(sourceBounds, sourcePortId);
  if (!sourcePos) return;

  // Create temp path in the connections layer
  const connLayer = dom.connectionsLayer;
  const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tempPath.setAttribute('stroke', '#475569');
  tempPath.setAttribute('stroke-width', '1.8');
  tempPath.setAttribute('stroke-dasharray', '6,4');
  tempPath.setAttribute('fill', 'none');
  tempPath.setAttribute('opacity', '0.5');
  tempPath.setAttribute('pointer-events', 'none');
  tempPath.setAttribute('d', `M ${sourcePos.x} ${sourcePos.y} L ${sourcePos.x} ${sourcePos.y}`);
  connLayer.appendChild(tempPath);

  // Determine valid and invalid targets
  const connections = state.graph.connections || [];
  const validTargetIds = new Set();
  const invalidTargetIds = new Set();

  for (const node of state.graph.nodes) {
    if (node.id === sourceNodeId) continue;
    const result = canConnect(sourceNode, node, connections);
    if (result.valid) {
      validTargetIds.add(node.id);
    } else {
      invalidTargetIds.add(node.id);
    }
  }

  // Apply visual feedback
  applyConnectHighlights(validTargetIds, invalidTargetIds);

  connectState = {
    sourceNode,
    sourcePortId,
    sourcePos,
    tempPath,
    validTargetIds,
    invalidTargetIds,
    snappedPort: null,
  };

  // 9.4 — Add connect-mode class for pulse animation on available ports
  document.body.classList.add('connect-mode');

  e.preventDefault();
  e.stopPropagation();
}

/**
 * Update the temp path during drag and handle port snapping.
 */
function dragConnect(e) {
  if (!connectState) return;

  const cursor = screenToSVG(e.clientX, e.clientY);
  const { sourcePos, tempPath, validTargetIds } = connectState;

  // Find nearest valid port for snapping
  const nearest = findNearestValidPort(cursor, validTargetIds);

  let endX = cursor.x;
  let endY = cursor.y;

  // Remove previous snap highlight
  if (connectState.snappedPort) {
    const prevGroup = dom.nodesLayer.querySelector(
      `[data-node-id="${connectState.snappedPort.node.id}"]`
    );
    if (prevGroup) {
      const prevCircle = prevGroup.querySelector(
        `[data-port-id="${connectState.snappedPort.portId}"]`
      );
      if (prevCircle) {
        prevCircle.setAttribute('r', '4');
        prevCircle.setAttribute('fill', '#3b82f6');
      }
    }
  }

  if (nearest) {
    endX = nearest.pos.x;
    endY = nearest.pos.y;
    connectState.snappedPort = nearest;

    // Highlight the snapped port with green glow + scale-up
    const targetGroup = dom.nodesLayer.querySelector(
      `[data-node-id="${nearest.node.id}"]`
    );
    if (targetGroup) {
      const circle = targetGroup.querySelector(
        `[data-port-id="${nearest.portId}"]`
      );
      if (circle) {
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', '#22c55e');
      }
    }
  } else {
    connectState.snappedPort = null;
  }

  // Update temp path: straight line from source port to endpoint
  tempPath.setAttribute('d', `M ${sourcePos.x} ${sourcePos.y} L ${endX} ${endY}`);
}

/**
 * End connect mode. If snapped to valid port, create connection.
 */
function endConnect() {
  if (!connectState) return;

  const { sourceNode, sourcePortId, tempPath, snappedPort } = connectState;

  // Clean up temp path
  if (tempPath && tempPath.parentNode) {
    tempPath.parentNode.removeChild(tempPath);
  }

  // Clean up highlights
  clearConnectHighlights();

  if (snappedPort) {
    const connections = state.graph.connections || [];
    const conn = {
      id: generateConnId(),
      from: sourceNode.id,
      to: snappedPort.node.id,
      sourcePort: sourcePortId,
      targetPort: snappedPort.portId,
      type: 'sequence',
      label: '',
    };

    // Gateway auto-labeling and port assignment
    if (sourceNode.type === 'gateway') {
      const assignedPort = assignGatewayPort(sourceNode.id, connections);
      if (assignedPort) {
        conn.sourcePort = assignedPort;
      }

      const outgoingCount = connections.filter(c => c.from === sourceNode.id).length;
      if (outgoingCount === 0) {
        conn.decision = 'Yes';
        conn.label = 'Yes';
      } else if (outgoingCount === 1) {
        conn.decision = 'No';
        conn.label = 'No';
      } else {
        const branchNum = outgoingCount + 1;
        conn.decision = `Branch ${branchNum}`;
        conn.label = `Branch ${branchNum}`;
      }
    }

    // Push undo BEFORE modifying state
    pushUndo();

    if (!state.graph.connections) {
      state.graph.connections = [];
    }
    state.graph.connections.push(conn);

    renderAll(state.graph);
  }

  connectState = null;
  // 9.4 — Remove connect-mode class
  document.body.classList.remove('connect-mode');
}

/**
 * Initialize drag-to-connect event listeners.
 * Listens for mousedown on port indicators, then tracks mousemove/mouseup globally.
 */
function initConnect() {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  // Listen for mousedown on port indicator circles (capture phase to beat drag)
  nodesLayer.addEventListener('mousedown', (e) => {
    if (!state.isEditing) return;
    if (e.button !== 0) return;

    // Only activate from port indicator circles
    if (!e.target.classList || !e.target.classList.contains('port-indicator')) return;

    const portId = e.target.getAttribute('data-port-id');
    if (!portId) return;

    // Only allow dragging from output ports
    if (!portId.startsWith('out-')) return;

    const group = findNodeGroup(e.target);
    if (!group) return;

    startConnect(group.dataset.nodeId, portId, e);
  }, true);  // useCapture so this fires before the drag mousedown

  // Mousemove: update temp path
  window.addEventListener('mousemove', (e) => {
    if (!connectState) return;
    dragConnect(e);
  });

  // Mouseup: finalize or cancel
  window.addEventListener('mouseup', () => {
    if (!connectState) return;
    endConnect();
  });
}

// ─────────────────────────────────────────────────────────────
// Inline label editing
// ─────────────────────────────────────────────────────────────

function initInlineLabelEdit() {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  nodesLayer.addEventListener('dblclick', (e) => {
    if (!state.isEditing) return;

    const group = findNodeGroup(e.target);
    if (!group) return;

    const nodeId = group.dataset.nodeId;
    const nodeData = state.graph && state.graph.nodes
      ? state.graph.nodes.find(n => n.id === nodeId)
      : null;
    if (!nodeData) return;

    // Get the screen-space bounding box of the group to position the input
    const bbox = group.getBoundingClientRect();

    // Create absolutely-positioned input over the node
    const input = document.createElement('input');
    input.type = 'text';
    input.value = (nodeData.label || '').replace(/\n/g, ' ');
    input.style.cssText = [
      `position: fixed`,
      `left: ${bbox.left + bbox.width / 2}px`,
      `top: ${bbox.top + bbox.height / 2}px`,
      `transform: translate(-50%, -50%)`,
      `min-width: ${Math.max(bbox.width, 120)}px`,
      `max-width: 400px`,
      `z-index: 9999`,
      `font-size: 13px`,
      `padding: 4px 8px`,
      `border: 2px solid #4a9eff`,
      `border-radius: 4px`,
      `background: #1e1e2e`,
      `color: #cdd6f4`,
      `text-align: center`,
      `box-shadow: 0 2px 12px rgba(0,0,0,0.5)`,
    ].join(';');

    document.body.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      const newLabel = input.value.trim();
      pushUndo();
      nodeData.label = newLabel;
      document.body.removeChild(input);
      renderAll(state.graph);
    }

    function cancel() {
      if (committed) return;
      committed = true;
      document.body.removeChild(input);
    }

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      }
      ev.stopPropagation(); // prevent global shortcuts while editing
    });

    input.addEventListener('blur', () => {
      // Small delay so Enter keydown fires before blur in some browsers
      setTimeout(commit, 80);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Selection helpers
// ─────────────────────────────────────────────────────────────

function generateId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function clearSelection() {
  state.selectedNodes.clear();
  state.selectedConnection = null;
  document.querySelectorAll('.node-selected').forEach(el => el.classList.remove('node-selected'));
  document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.conn-selected').forEach(el => el.classList.remove('conn-selected'));
}

function selectNode(nodeId, additive) {
  if (!additive) clearSelection();
  state.selectedConnection = null;
  if (state.selectedNodes.has(nodeId) && additive) {
    state.selectedNodes.delete(nodeId);
  } else {
    state.selectedNodes.add(nodeId);
  }
  applySelectionHighlights();
}

function selectConnection(connId) {
  clearSelection();
  state.selectedConnection = connId;
  applyConnectionHighlight(connId);
}

function applySelectionHighlights() {
  if (dom.nodesLayer) {
    dom.nodesLayer.querySelectorAll('[data-node-id]').forEach(g => {
      const nid = g.dataset.nodeId;
      const sel = state.selectedNodes.has(nid);
      g.classList.toggle('selected', sel);
      g.classList.toggle('node-selected', sel);
    });
  }
}

function applyConnectionHighlight(connId) {
  document.querySelectorAll('.conn-selected').forEach(el => el.classList.remove('conn-selected'));
  if (!connId) return;
  const connLayer = dom.connectionsLayer;
  if (!connLayer) return;
  const pathEl = connLayer.querySelector(`[data-conn-id="${connId}"]`);
  if (pathEl) pathEl.classList.add('conn-selected');
}

// ─────────────────────────────────────────────────────────────
// Node click selection
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Connection click selection
// ─────────────────────────────────────────────────────────────

function initConnectionSelection() {
  const connLayer = dom.connectionsLayer;
  if (!connLayer) return;
  connLayer.addEventListener('click', (e) => {
    if (!state.isEditing) return;
    const connId = e.target.getAttribute && e.target.getAttribute('data-conn-id');
    if (!connId) return;
    selectConnection(connId);
    e.stopPropagation();
  });
  const arrowLayer = dom.annotationsLayer;
  if (arrowLayer) {
    arrowLayer.addEventListener('click', (e) => {
      if (!state.isEditing) return;
      const connId = e.target.getAttribute && e.target.getAttribute('data-conn-id');
      if (!connId) return;
      selectConnection(connId);
      e.stopPropagation();
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Canvas deselect
// ─────────────────────────────────────────────────────────────

function initCanvasDeselect() {
  const svg = dom.diagramSvg;
  if (!svg) return;
  svg.addEventListener('click', (e) => {
    if (!state.isEditing) return;
    if (e.target === svg || e.target.closest('#background-layer') || e.target.closest('#lanes-layer')) {
      clearSelection();
      hideContextMenu();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Node deletion
// ─────────────────────────────────────────────────────────────

function deleteSelectedNodes() {
  if (!state.graph || state.selectedNodes.size === 0) return;
  const ids = [...state.selectedNodes];
  if (ids.length > 1 && !confirm(`Delete ${ids.length} nodes and their connections?`)) return;

  pushUndo();
  const deletedIds = new Set(ids);

  for (const id of ids) {
    const node = state.graph.nodes.find(n => n.id === id);
    if (node && node.type === 'process-group' && node.children) node.children = [];
  }

  state.graph.connections = (state.graph.connections || []).filter(c => !deletedIds.has(c.from) && !deletedIds.has(c.to));
  state.graph.nodes = state.graph.nodes.filter(n => !deletedIds.has(n.id));

  for (const node of state.graph.nodes) {
    if (node.children) node.children = node.children.filter(cid => !deletedIds.has(cid));
  }

  clearSelection();
  renderAll(state.graph);
}

// ─────────────────────────────────────────────────────────────
// Connection deletion
// ─────────────────────────────────────────────────────────────

function deleteSelectedConnection() {
  if (!state.graph || !state.selectedConnection) return;
  pushUndo();
  state.graph.connections = (state.graph.connections || []).filter(c => (c.id || `${c.from}->${c.to}`) !== state.selectedConnection);
  clearSelection();
  renderAll(state.graph);
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Context menu
// ─────────────────────────────────────────────────────────────

function hideContextMenu() {
  const menu = dom.contextMenu;
  if (menu) menu.style.display = 'none';
}

function showContextMenu(x, y, items) {
  const menu = dom.contextMenu;
  if (!menu) return;

  menu.innerHTML = '';
  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-separator';
      menu.appendChild(sep);
      continue;
    }
    if (item.submenu) {
      const wrapper = document.createElement('div');
      wrapper.className = 'ctx-submenu';
      const trigger = document.createElement('div');
      trigger.className = 'ctx-item';
      trigger.textContent = item.label;
      wrapper.appendChild(trigger);
      const sub = document.createElement('div');
      sub.className = 'ctx-submenu-list';
      for (const si of item.submenu) {
        const subItem = document.createElement('div');
        subItem.className = 'ctx-item';
        subItem.textContent = si.label;
        subItem.addEventListener('click', () => { hideContextMenu(); si.action(); });
        sub.appendChild(subItem);
      }
      wrapper.appendChild(sub);
      menu.appendChild(wrapper);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = item.label;
    el.addEventListener('click', () => { hideContextMenu(); item.action(); });
    menu.appendChild(el);
  }

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  });
}

function getLanes() {
  if (!state.graph || !state.graph.lanes) return [];
  return state.graph.lanes.map(l => ({ id: l.id, label: l.label || l.id }));
}

function createNodeAtPosition(type, svgX, svgY) {
  if (!state.graph) return;
  pushUndo();
  const id = generateId();
  const labels = { 'task': 'New Task', 'gateway': 'Decision?', 'merge': '', 'start-event': 'Start', 'end-event': 'End', 'subprocess': 'Subprocess', 'process-group': 'Group' };
  const node = { id, type, label: labels[type] || type, x: snap(svgX), y: snap(svgY) };
  if (state.layout && state.layout.lanes) {
    for (const lane of state.layout.lanes) {
      if (svgY >= lane.y && svgY < lane.y + lane.height) { node.lane = lane.id; break; }
    }
  }
  state.graph.nodes.push(node);
  renderAll(state.graph);
}

function duplicateNode(nodeId) {
  if (!state.graph) return;
  const orig = state.graph.nodes.find(n => n.id === nodeId);
  if (!orig) return;
  pushUndo();
  const clone = JSON.parse(JSON.stringify(orig));
  clone.id = generateId();
  clone.label = (clone.label || '') + ' (copy)';
  if (typeof clone.x === 'number') clone.x += 40;
  state.graph.nodes.push(clone);
  renderAll(state.graph);
  selectNode(clone.id, false);
}

function initContextMenu() {
  const svg = dom.diagramSvg;
  if (!svg) return;

  document.addEventListener('click', () => hideContextMenu());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

  svg.addEventListener('contextmenu', (e) => {
    if (!state.isEditing) return;
    e.preventDefault();
    const svgCoord = svgPoint(svg, e.clientX, e.clientY);

    // Right-click on a node
    const group = findNodeGroup(e.target);
    if (group) {
      const nodeId = group.dataset.nodeId;
      const items = [
        { label: 'Edit Properties', action: () => selectNode(nodeId, false) },
        { label: 'Duplicate', action: () => duplicateNode(nodeId) },
        { label: 'Delete', action: () => { if (!state.selectedNodes.has(nodeId)) selectNode(nodeId, false); deleteSelectedNodes(); } },
        { separator: true },
        { label: 'Connect From Here', action: () => selectNode(nodeId, false) },
        { separator: true },
      ];
      const lanes = getLanes();
      if (lanes.length > 0) {
        items.push({
          label: 'Move to Lane',
          submenu: lanes.map(l => ({
            label: l.label,
            action: () => { pushUndo(); const nd = state.graph.nodes.find(n => n.id === nodeId); if (nd) { nd.lane = l.id; renderAll(state.graph); } },
          })),
        });
      }
      showContextMenu(e.clientX, e.clientY, items);
      return;
    }

    // Right-click on a connection
    const connId = e.target.getAttribute && e.target.getAttribute('data-conn-id');
    if (connId) {
      showContextMenu(e.clientX, e.clientY, [
        {
          label: 'Edit Label', action: () => {
            const conn = (state.graph.connections || []).find(c => (c.id || `${c.from}->${c.to}`) === connId);
            if (!conn) return;
            const newLabel = prompt('Connection label:', conn.label || '');
            if (newLabel !== null) { pushUndo(); conn.label = newLabel; renderAll(state.graph); }
          },
        },
        { label: 'Delete', action: () => { selectConnection(connId); deleteSelectedConnection(); } },
      ]);
      return;
    }

    // Right-click on empty canvas
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Add Task', action: () => createNodeAtPosition('task', svgCoord.x, svgCoord.y) },
      { label: 'Add Decision', action: () => createNodeAtPosition('gateway', svgCoord.x, svgCoord.y) },
      { label: 'Add Merge', action: () => createNodeAtPosition('merge', svgCoord.x, svgCoord.y) },
      { label: 'Add Start', action: () => createNodeAtPosition('start-event', svgCoord.x, svgCoord.y) },
      { label: 'Add End', action: () => createNodeAtPosition('end-event', svgCoord.x, svgCoord.y) },
    ]);
  });
}

// ─────────────────────────────────────────────────────────────
// Keyboard shortcuts (Undo / Redo / Delete)
// ─────────────────────────────────────────────────────────────

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); popUndo(); }
    else if (ctrl && e.key === 'y') { e.preventDefault(); popRedo(); }
    else if (ctrl && e.shiftKey && e.key === 'z') { e.preventDefault(); popRedo(); }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.isEditing) {
      e.preventDefault();
      if (state.selectedConnection) deleteSelectedConnection();
      else if (state.selectedNodes.size > 0) deleteSelectedNodes();
    }

    if (e.key === 'Escape') {
      hideContextMenu();
      if (state.isEditing) clearSelection();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Edit mode toggle
// ─────────────────────────────────────────────────────────────

function initEditModeToggle() {
  const chk = dom.chkEditMode;
  const svg = dom.diagramSvg;
  if (!chk) return;

  chk.addEventListener('change', () => {
    state.isEditing = chk.checked;
    document.body.classList.toggle('is-editing', chk.checked);
    if (svg) {
      svg.classList.toggle('edit-active', chk.checked);
    }
    // Clear selection when leaving edit mode
    if (!chk.checked) {
      clearSelection();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// View mode buttons
// ─────────────────────────────────────────────────────────────

function initViewModeButtons() {
  const buttons = document.querySelectorAll('.view-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.mode;
      // Update active class
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.graph) renderAll(state.graph);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Options menu
// ─────────────────────────────────────────────────────────────

function initOptionsMenu() {
  const btnOptions  = dom.btnOptions;
  const optionsMenu = dom.optionsMenu;

  if (btnOptions && optionsMenu) {
    btnOptions.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = optionsMenu.style.display === 'block';
      optionsMenu.style.display = isVisible ? 'none' : 'block';
    });

    // Click outside closes the menu
    document.addEventListener('click', (e) => {
      if (!optionsMenu.contains(e.target) && e.target !== btnOptions) {
        optionsMenu.style.display = 'none';
      }
    });

    // Escape key closes the menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        optionsMenu.style.display = 'none';
      }
    });
  }

  // Show/hide JSON editor pane
  const chkEditor = dom.chkShowEditor;
  const editorPane = dom.editorPane;
  if (chkEditor && editorPane) {
    chkEditor.addEventListener('change', () => {
      editorPane.style.display = chkEditor.checked ? '' : 'none';
    });
  }

  // Show/hide notebook
  const chkNotes = dom.chkShowNotes;
  const notebook  = dom.notebook;
  if (chkNotes && notebook) {
    chkNotes.addEventListener('change', () => {
      notebook.style.display = chkNotes.checked ? '' : 'none';
    });
  }

  // Light theme toggle
  const chkLight = dom.chkLightMode;
  if (chkLight) {
    chkLight.addEventListener('change', () => {
      document.body.classList.toggle('light-theme', chkLight.checked);
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Delay slider
// ─────────────────────────────────────────────────────────────

function initDelaySlider() {
  const slider = dom.delaySlider;
  const label  = dom.delayLabel;
  if (!slider) return;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    state.stepDelay = Math.round(val * 1000); // store as ms
    if (label) label.textContent = `${val.toFixed(1)}s`;
  });
}

// ─────────────────────────────────────────────────────────────
// Arrow style toggle (9.5) & Flow animation toggle (9.7)
// ─────────────────────────────────────────────────────────────

function initArrowOptions() {
  const radioOrtho = dom.radioArrowOrthogonal;
  const radioCurved = dom.radioArrowCurved;
  const chkFlow = dom.chkFlowAnimation;

  if (radioOrtho) {
    radioOrtho.addEventListener('change', () => {
      if (radioOrtho.checked) {
        state.arrowStyle = 'orthogonal';
        if (state.graph) renderAll(state.graph);
      }
    });
  }
  if (radioCurved) {
    radioCurved.addEventListener('change', () => {
      if (radioCurved.checked) {
        state.arrowStyle = 'curved';
        if (state.graph) renderAll(state.graph);
      }
    });
  }
  if (chkFlow) {
    chkFlow.addEventListener('change', () => {
      state.flowAnimation = chkFlow.checked;
      if (state.graph) renderAll(state.graph);
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Connection hover tooltip (9.6)
// ─────────────────────────────────────────────────────────────

function initConnectionHoverTooltip() {
  const connLayer = dom.connectionsLayer;
  const stage = dom.stage;
  if (!connLayer || !stage) return;

  let tooltip = null;

  function showTooltip(e, fromId, toId) {
    if (!state.graph || !state.graph.nodes) return;
    const fromNode = state.graph.nodes.find(n => n.id === fromId);
    const toNode   = state.graph.nodes.find(n => n.id === toId);
    const fromLabel = fromNode ? (fromNode.label || fromNode.id).replace(/\\n/g, ' ') : fromId;
    const toLabel   = toNode   ? (toNode.label   || toNode.id).replace(/\\n/g, ' ')   : toId;

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'conn-hover-tooltip';
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = `${fromLabel} \u2192 ${toLabel}`;
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top  = (e.clientY - 8) + 'px';
    tooltip.style.display = '';
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  connLayer.addEventListener('mouseover', (e) => {
    const group = e.target.closest('.conn-group');
    if (!group) return;
    const fromId = group.getAttribute('data-from');
    const toId   = group.getAttribute('data-to');
    if (fromId && toId) showTooltip(e, fromId, toId);
  });

  connLayer.addEventListener('mousemove', (e) => {
    if (tooltip && tooltip.style.display !== 'none') {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top  = (e.clientY - 8) + 'px';
    }
  });

  connLayer.addEventListener('mouseout', (e) => {
    const group = e.target.closest('.conn-group');
    if (!group) { hideTooltip(); return; }
    const related = e.relatedTarget;
    if (!related || !group.contains(related)) hideTooltip();
  });
}

// ─────────────────────────────────────────────────────────────
// Port indicator hover/select
// ─────────────────────────────────────────────────────────────

/**
 * Show port indicator circles on node hover/select (edit mode only).
 * Uses event delegation on the nodes layer.
 */
function initPortIndicators() {
  const nodesLayer = dom.nodesLayer;
  if (!nodesLayer) return;

  nodesLayer.addEventListener('mouseenter', (e) => {
    if (!state.isEditing) return;

    const group = findNodeGroup(e.target);
    if (!group) return;

    const nodeId = group.dataset.nodeId;
    const nodeData = state.graph && state.graph.nodes
      ? state.graph.nodes.find(n => n.id === nodeId)
      : null;
    if (!nodeData) return;

    const bounds = state.layout && state.layout.nodes
      ? state.layout.nodes[nodeId]
      : null;
    if (!bounds) return;

    renderPortIndicators(group, nodeData, bounds, state.graph);
  }, true);  // useCapture so we catch enter on child elements

  nodesLayer.addEventListener('mouseleave', (e) => {
    // Don't remove port indicators while in connect mode (they show valid targets)
    if (connectState) return;

    const group = findNodeGroup(e.target);
    if (!group) return;

    // Only remove if the mouse truly left the group (not entering a child)
    const related = e.relatedTarget;
    if (related && group.contains(related)) return;

    removePortIndicators(group);
  }, true);
}


// ─────────────────────────────────────────────────────────────
// Multi-select: box select
// ─────────────────────────────────────────────────────────────

function initMultiSelect() {
  const svgContainer = dom.svgContainer;
  const diagramSvg = dom.diagramSvg;
  if (!svgContainer || !diagramSvg) return;

  // ── Box select: click on empty canvas + drag to draw rectangle ──
  let boxSelecting = false;
  let boxStartX = 0;
  let boxStartY = 0;
  let selectionRect = null;

  diagramSvg.addEventListener('mousedown', (e) => {
    if (!state.isEditing) return;
    if (e.button !== 0) return;

    // Only start box select if clicking on empty canvas (not on a node or port)
    const group = findNodeGroup(e.target);
    if (group) return;
    if (e.target.classList && e.target.classList.contains('port-indicator')) return;

    const pt = svgPoint(diagramSvg, e.clientX, e.clientY);
    boxStartX = pt.x;
    boxStartY = pt.y;
    boxSelecting = true;
  });

  window.addEventListener('mousemove', (e) => {
    if (!boxSelecting) return;

    const pt = svgPoint(diagramSvg, e.clientX, e.clientY);
    const dx = pt.x - boxStartX;
    const dy = pt.y - boxStartY;

    if (!selectionRect && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      selectionRect = svgEl('rect', { class: 'selection-rect' });
      dom.overlaysLayer.appendChild(selectionRect);
    }

    if (selectionRect) {
      const x = Math.min(boxStartX, pt.x);
      const y = Math.min(boxStartY, pt.y);
      const w = Math.abs(pt.x - boxStartX);
      const h = Math.abs(pt.y - boxStartY);
      selectionRect.setAttribute('x', x);
      selectionRect.setAttribute('y', y);
      selectionRect.setAttribute('width', w);
      selectionRect.setAttribute('height', h);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!boxSelecting) return;
    boxSelecting = false;

    if (selectionRect) {
      const rx = parseFloat(selectionRect.getAttribute('x'));
      const ry = parseFloat(selectionRect.getAttribute('y'));
      const rw = parseFloat(selectionRect.getAttribute('width'));
      const rh = parseFloat(selectionRect.getAttribute('height'));
      const rRight = rx + rw;
      const rBottom = ry + rh;

      if (!e.shiftKey) clearSelection();

      if (state.layout && state.layout.nodes) {
        for (const [nid, bounds] of Object.entries(state.layout.nodes)) {
          if (bounds.x >= rx && bounds.x <= rRight &&
              bounds.y >= ry && bounds.y <= rBottom) {
            state.selectedNodes.add(nid);
          }
        }
      }
      applySelectionHighlights();

      selectionRect.parentNode.removeChild(selectionRect);
      selectionRect = null;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Lane CRUD helpers
// ─────────────────────────────────────────────────────────────

/** Lane type icon map (matches renderer.js LANE_TYPE_ICONS) */
const LANE_TYPE_ICONS = {
  persona:    '\u{1F464}',   // 👤
  system:     '\u{1F5A5}',   // 🖥
  agent:      '\u26A1',      // ⚡
  department: '\u{1F3E2}',   // 🏢
};

/**
 * Walk up the DOM from `el` to find a <g> with data-lane-id attribute.
 */
function findLaneHeaderGroup(el) {
  let node = el;
  while (node && node !== document) {
    if (node.tagName === 'g' && node.dataset && node.dataset.laneId) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Show the "Add Lane" modal/form and create a new lane on submit.
 */
function showAddLaneForm() {
  // Remove any existing form
  const existing = document.getElementById('add-lane-form');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'add-lane-form';
  overlay.style.cssText = [
    'position: fixed', 'top: 0', 'left: 0', 'width: 100vw', 'height: 100vh',
    'background: rgba(0,0,0,0.5)', 'z-index: 20000',
    'display: flex', 'align-items: center', 'justify-content: center',
  ].join(';');

  const colorIndex = (state.graph && state.graph.lanes) ? state.graph.lanes.length % LANE_COLORS.length : 0;
  const defaultColor = LANE_COLORS[colorIndex];

  const form = document.createElement('div');
  form.style.cssText = [
    'background: #1e1e2e', 'border: 1px solid #3b4a6b', 'border-radius: 8px',
    'padding: 20px', 'min-width: 280px', 'box-shadow: 0 8px 32px rgba(0,0,0,0.7)',
    'font-family: "Segoe UI", system-ui, sans-serif', 'color: #cdd6f4',
  ].join(';');

  form.innerHTML = `
    <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#e2e8f0;">Add Swimlane</h3>
    <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:3px;">Name</label>
    <input id="lane-name-input" type="text" value="New Lane" style="width:100%;box-sizing:border-box;background:#161b27;border:1px solid #3b4a6b;border-radius:4px;color:#cdd6f4;font-size:12px;padding:6px 8px;margin-bottom:10px;outline:none;">
    <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:3px;">Type</label>
    <select id="lane-type-input" style="width:100%;box-sizing:border-box;background:#161b27;border:1px solid #3b4a6b;border-radius:4px;color:#cdd6f4;font-size:12px;padding:6px 8px;margin-bottom:10px;cursor:pointer;">
      ${LANE_TYPES.map(t => `<option value="${t}"${t === DEFAULT_LANE_TYPE ? ' selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
    </select>
    <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:3px;">Color</label>
    <input id="lane-color-input" type="color" value="${defaultColor}" style="width:48px;height:28px;border:1px solid #3b4a6b;border-radius:4px;background:transparent;cursor:pointer;margin-bottom:14px;">
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="lane-form-cancel" style="background:none;border:1px solid #3b4a6b;border-radius:4px;color:#94a3b8;padding:6px 14px;font-size:12px;cursor:pointer;">Cancel</button>
      <button id="lane-form-submit" style="background:#3b82f6;border:none;border-radius:4px;color:#fff;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Add</button>
    </div>
  `;

  overlay.appendChild(form);
  document.body.appendChild(overlay);

  const nameInput = document.getElementById('lane-name-input');
  nameInput.focus();
  nameInput.select();

  function close() { overlay.remove(); }

  function submit() {
    const name = nameInput.value.trim() || 'New Lane';
    const type = document.getElementById('lane-type-input').value;
    const color = document.getElementById('lane-color-input').value;

    pushUndo();
    const lane = {
      id: `lane-${Date.now()}`,
      label: name,
      type: type || DEFAULT_LANE_TYPE,
      color: color || defaultColor,
      height: 160,
    };
    if (!state.graph.lanes) state.graph.lanes = [];
    state.graph.lanes.push(lane);
    renderAll(state.graph);
    close();
  }

  document.getElementById('lane-form-cancel').addEventListener('click', close);
  document.getElementById('lane-form-submit').addEventListener('click', submit);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();
  });
}

/**
 * 4.1 — Handle click on the "+" add-lane button in SVG
 */
function initAddLaneButton() {
  const svg = dom.diagramSvg;
  if (!svg) return;

  svg.addEventListener('click', (e) => {
    if (!state.isEditing) return;

    // Walk up from click target to find the add-lane-btn group
    let el = e.target;
    while (el && el !== svg) {
      if (el.dataset && el.dataset.action === 'add-lane') {
        e.stopPropagation();
        showAddLaneForm();
        return;
      }
      el = el.parentElement;
    }
  });
}

/**
 * 4.2 & 4.4 — Right-click on lane header for delete + set type
 */
function initLaneContextMenu() {
  const svg = dom.diagramSvg;
  if (!svg) return;

  svg.addEventListener('contextmenu', (e) => {
    if (!state.isEditing) return;

    const headerG = findLaneHeaderGroup(e.target);
    if (!headerG) return;

    // Only act if this is actually within the lane header area
    const laneId = headerG.dataset.laneId;
    if (!laneId) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const graphLane = (state.graph.lanes || []).find(l => l.id === laneId);
    if (!graphLane) return;

    // Count nodes in this lane
    const nodesInLane = (state.graph.nodes || []).filter(n => n.lane === laneId);

    const items = [];

    // Delete lane
    items.push({
      label: `Delete Lane`,
      action: () => {
        if (nodesInLane.length > 0) {
          alert(`Move or delete ${nodesInLane.length} node${nodesInLane.length > 1 ? 's' : ''} before deleting this lane.`);
          return;
        }
        pushUndo();
        state.graph.lanes = state.graph.lanes.filter(l => l.id !== laneId);
        renderAll(state.graph);
      },
    });

    items.push({ separator: true });

    // Set type submenu
    items.push({
      label: 'Set Type',
      submenu: LANE_TYPES.map(t => ({
        label: `${LANE_TYPE_ICONS[t] || ''} ${t.charAt(0).toUpperCase() + t.slice(1)}`,
        action: () => {
          pushUndo();
          graphLane.type = t;
          renderAll(state.graph);
        },
      })),
    });

    showContextMenu(e.clientX, e.clientY, items);
  }, true); // capture phase so it fires before the general contextmenu handler
}

/**
 * 4.3 — Double-click on lane header label for inline renaming
 */
function initLaneRename() {
  const svg = dom.diagramSvg;
  if (!svg) return;

  svg.addEventListener('dblclick', (e) => {
    if (!state.isEditing) return;

    const headerG = findLaneHeaderGroup(e.target);
    if (!headerG) return;

    const laneId = headerG.dataset.laneId;
    if (!laneId) return;

    const graphLane = (state.graph.lanes || []).find(l => l.id === laneId);
    if (!graphLane) return;

    e.stopPropagation();

    // Get the bounding box of the lane header group for positioning the input
    const bbox = headerG.getBoundingClientRect();

    // Create an absolutely-positioned input over the lane header
    const input = document.createElement('input');
    input.type = 'text';
    input.value = graphLane.label || '';
    input.style.cssText = [
      `position: fixed`,
      `left: ${bbox.left + bbox.width / 2}px`,
      `top: ${bbox.top + bbox.height / 2}px`,
      `transform: translate(-50%, -50%)`,
      `min-width: ${Math.max(bbox.height, 100)}px`,
      `max-width: 300px`,
      `z-index: 9999`,
      `font-size: 12px`,
      `padding: 4px 8px`,
      `border: 2px solid #4a9eff`,
      `border-radius: 4px`,
      `background: #1e1e2e`,
      `color: #cdd6f4`,
      `text-align: center`,
      `box-shadow: 0 2px 12px rgba(0,0,0,0.5)`,
    ].join(';');

    document.body.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      const newLabel = input.value.trim();
      if (newLabel && newLabel !== graphLane.label) {
        pushUndo();
        graphLane.label = newLabel;
        renderAll(state.graph);
      }
      if (input.parentNode) document.body.removeChild(input);
    }

    function cancel() {
      if (committed) return;
      committed = true;
      if (input.parentNode) document.body.removeChild(input);
    }

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      }
      ev.stopPropagation();
    });

    input.addEventListener('blur', () => {
      // Small delay to allow click on submit
      setTimeout(() => commit(), 100);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Public initialiser
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Zoom & Pan (mousewheel + double-click zoom-to-fit)
// ─────────────────────────────────────────────────────────────

/** Clamp a value between min and max. */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Apply the current zoom + pan transform to the SVG element.
 * Uses CSS transform so the viewBox remains untouched.
 */
function applyZoomPanLocal() {
  const svg = dom.diagramSvg;
  if (!svg) return;
  const zoom = state.zoom;
  const panX = state.panX;
  const panY = state.panY;
  svg.style.transformOrigin = '0 0';
  svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

/**
 * Initialize mousewheel zoom toward cursor and double-click zoom-to-fit.
 */
function initZoomPan() {
  const container = dom.svgContainer;
  const svg = dom.diagramSvg;
  if (!container || !svg) return;

  // ── Mousewheel zoom toward cursor ───────────────────────────
  container.addEventListener('wheel', (e) => {
    e.preventDefault();

    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const oldZoom = state.zoom;
    const newZoom = clamp(oldZoom * factor, 0.2, 3.0);
    if (newZoom === oldZoom) return;

    // Get cursor position relative to the container
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // The diagram point under the cursor before zoom:
    //   diagramPt = (cursorScreen - pan) / oldZoom
    // After zoom, we want the same diagram point under cursor:
    //   cursorScreen = diagramPt * newZoom + newPan
    //   newPan = cursorScreen - diagramPt * newZoom
    const diagX = (cursorX - state.panX) / oldZoom;
    const diagY = (cursorY - state.panY) / oldZoom;

    state.zoom = newZoom;
    state.panX = cursorX - diagX * newZoom;
    state.panY = cursorY - diagY * newZoom;

    applyZoomPanLocal();

    // Update minimap + zoom label (lazy import to avoid circular deps)
    try {
      const zoomLabel = document.getElementById('zoom-pct-label');
      if (zoomLabel) zoomLabel.textContent = Math.round(newZoom * 100) + '%';
    } catch { /* ignore */ }

    // Re-render minimap (imported dynamically to avoid circular dependency)
    _updateMinimap();
  }, { passive: false });

  // ── Double-click on empty canvas → zoom-to-fit ──────────────
  container.addEventListener('dblclick', (e) => {
    // Only on empty canvas — if a node was double-clicked, don't interfere
    const target = e.target;
    if (target !== svg && target.id !== 'background-layer' &&
        !target.closest('#background-layer') &&
        !target.closest('#lanes-layer')) {
      return;
    }

    zoomToFit();
  });
}

/**
 * Zoom and pan to fit the entire diagram in the visible container.
 * The SVG uses viewBox + width:100%, so its rendered size before CSS transform is:
 *   renderedW = containerW, renderedH = containerW * (diagH / diagW)
 * The CSS transform zoom is applied on top of that.
 */
export function zoomToFit() {
  const container = dom.svgContainer;
  const layout = state.layout;
  if (!container || !layout) return;

  const pad = 20; // px padding around diagram
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  const diagW = layout.svgWidth  || 1200;
  const diagH = layout.svgHeight || 600;

  // SVG rendered size (before CSS transform) when width:100%
  const svgRenderedW = containerW;
  const svgRenderedH = containerW * (diagH / diagW);

  const fitZoom = clamp(
    Math.min(
      (containerW - pad * 2) / svgRenderedW,
      (containerH - pad * 2) / svgRenderedH
    ),
    0.2, 3.0
  );

  // Center the diagram
  state.zoom = fitZoom;
  state.panX = (containerW - svgRenderedW * fitZoom) / 2;
  state.panY = (containerH - svgRenderedH * fitZoom) / 2;

  applyZoomPanLocal();
  _updateMinimap();

  const zoomLabel = document.getElementById('zoom-pct-label');
  if (zoomLabel) zoomLabel.textContent = Math.round(fitZoom * 100) + '%';
}

/** Lazy minimap update — avoids circular import with minimap.js */
function _updateMinimap() {
  try {
    import('./minimap.js').then(m => m.renderMinimap()).catch(() => {});
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────
// Auto-Layout button
// ─────────────────────────────────────────────────────────────
// Lane reordering (drag lane headers to reorder)
// ─────────────────────────────────────────────────────────────

/**
 * Remove lane insertion indicator line if present.
 */
function removeLaneInsertionLine() {
  const existing = document.getElementById('lane-insertion-line');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

/**
 * Show a blue insertion line at a given Y position between lanes.
 */
function showLaneInsertionLine(y) {
  removeLaneInsertionLine();
  const lanesLayer = dom.lanesLayer;
  if (!lanesLayer || !state.layout) return;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('id', 'lane-insertion-line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', y);
  line.setAttribute('x2', state.layout.svgWidth || 1200);
  line.setAttribute('y2', y);
  line.setAttribute('stroke', '#3b82f6');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('pointer-events', 'none');
  lanesLayer.appendChild(line);
}

/**
 * Find the drop index for lane reordering given an absolute Y position.
 * Returns the index in the lanes array where the dragged lane should be inserted.
 */
function findLaneDropIndex(absY) {
  if (!state.layout || !state.layout.lanes) return 0;
  const lanes = state.layout.lanes;
  for (let i = 0; i < lanes.length; i++) {
    const mid = lanes[i].y + lanes[i].height / 2;
    if (absY < mid) return i;
  }
  return lanes.length;
}

/**
 * Get the Y position of the insertion line for a given drop index.
 */
function getInsertionY(dropIndex) {
  if (!state.layout || !state.layout.lanes) return 0;
  const lanes = state.layout.lanes;
  if (dropIndex <= 0) return lanes.length > 0 ? lanes[0].y : 0;
  if (dropIndex >= lanes.length) {
    const last = lanes[lanes.length - 1];
    return last.y + last.height;
  }
  return lanes[dropIndex].y;
}

function initLaneDrag() {
  const lanesLayer = dom.lanesLayer;
  if (!lanesLayer) return;

  let laneDragging = false;
  let dragLaneId = null;
  let dragStartY = 0;

  // Mousedown on lane header starts lane-drag mode
  lanesLayer.addEventListener('mousedown', (e) => {
    if (!state.isEditing) return;
    if (e.button !== 0) return;

    // Find the lane header group
    let target = e.target;
    while (target && target !== lanesLayer) {
      if (target.classList && target.classList.contains('lane-header')) {
        break;
      }
      target = target.parentElement;
    }
    if (!target || !target.dataset || !target.dataset.laneId) return;

    dragLaneId = target.dataset.laneId;
    laneDragging = true;

    const svgEl = dom.diagramSvg;
    const pt = svgPoint(svgEl, e.clientX, e.clientY);
    dragStartY = pt.y;

    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!laneDragging || !dragLaneId) return;

    const svgEl = dom.diagramSvg;
    const pt = svgPoint(svgEl, e.clientX, e.clientY);

    // Only show insertion line if mouse has moved enough
    if (Math.abs(pt.y - dragStartY) < 5) return;

    const dropIndex = findLaneDropIndex(pt.y);
    const insertionY = getInsertionY(dropIndex);
    showLaneInsertionLine(insertionY);
  });

  window.addEventListener('mouseup', (e) => {
    if (!laneDragging) return;
    laneDragging = false;
    removeLaneInsertionLine();

    if (!dragLaneId || !state.graph || !state.graph.lanes) {
      dragLaneId = null;
      return;
    }

    const svgEl = dom.diagramSvg;
    const pt = svgPoint(svgEl, e.clientX, e.clientY);

    // Only act if mouse moved enough
    if (Math.abs(pt.y - dragStartY) < 5) {
      dragLaneId = null;
      return;
    }

    const lanes = state.graph.lanes;
    const currentIndex = lanes.findIndex(l => l.id === dragLaneId);
    if (currentIndex === -1) {
      dragLaneId = null;
      return;
    }

    const dropIndex = findLaneDropIndex(pt.y);

    // Adjust drop index: if dragging downward, account for the removed lane
    let targetIndex = dropIndex;
    if (targetIndex > currentIndex) targetIndex--;

    if (targetIndex === currentIndex) {
      dragLaneId = null;
      return;
    }

    // Push undo before modifying
    pushUndo();

    // Remove lane from current position and insert at new position
    const [lane] = lanes.splice(currentIndex, 1);
    lanes.splice(targetIndex, 0, lane);

    // Re-render (node Y positions recalculated automatically via computeLayout)
    renderAll(state.graph);

    dragLaneId = null;
  });
}

/**
 * Set up all interaction event listeners.
 * Must be called after DOMContentLoaded and after initDom() has populated `dom`.
 */
export function initInteractions() {
  initConnect();   // must be before initDrag so capture-phase port handler fires first
  initDrag();
  initInlineLabelEdit();
  initKeyboard();
  initEditModeToggle();
  initViewModeButtons();
  initOptionsMenu();
  initDelaySlider();
  initArrowOptions();
  initConnectionHoverTooltip();
  initPortIndicators();
  initMultiSelect();
  initConnectionSelection();
  initCanvasDeselect();
  initContextMenu();
  initAddLaneButton();
  initLaneContextMenu();
  initLaneRename();
  initLaneDrag();
  initZoomPan();

  // Prevent unwanted body scroll caused by header buttons overflowing the viewport.
  // When Playwright (or the browser) calls scrollIntoView on an off-screen button,
  // the body may scroll even with overflow:hidden. Reset it immediately.
  document.body.addEventListener('scroll', () => {
    if (document.body.scrollLeft !== 0) {
      document.body.scrollLeft = 0;
    }
  });
}
