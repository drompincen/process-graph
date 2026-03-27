/**
 * validation.js — Graph validation engine
 *
 * Validates process graphs against BPMN-style rules:
 *   5.1  Exactly one start-event, no incoming arrows
 *   5.2  At least one end-event, no outgoing arrows
 *   5.3  No dangling arrows (from/to must reference existing nodes)
 *   5.4  All decision branches must converge
 *   5.5  Cycle detection (DFS), skippable via loopModeEnabled
 *   5.6  Tasks/subprocess/process-group must belong to a valid swimlane
 *   5.7  No orphaned nodes (BFS reachability from start)
 *   5.8  Gateway outgoing arrows must have label or decision field
 *   5.9  Gateway cardinality: exactly 1 incoming, 2–5 outgoing
 *   5.10 Gateway outgoing arrows must use distinct sourcePort values
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a directed adjacency list from connections.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Record<string, string[]>}  nodeId → [targetNodeId, …]
 */
export function buildAdjacencyList(graph) {
  const adj = {};
  for (const node of graph.nodes) {
    adj[node.id] = [];
  }
  for (const conn of (graph.connections || [])) {
    if (adj[conn.from]) {
      adj[conn.from].push(conn.to);
    }
  }
  return adj;
}

/**
 * Build a bidirectional adjacency list (both directions) for reachability checks.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Record<string, string[]>}  nodeId → [neighbourId, …]
 */
export function buildBidirectionalAdjList(graph) {
  const adj = {};
  for (const node of graph.nodes) {
    adj[node.id] = [];
  }
  for (const conn of (graph.connections || [])) {
    if (adj[conn.from]) adj[conn.from].push(conn.to);
    if (adj[conn.to])   adj[conn.to].push(conn.from);
  }
  return adj;
}

/**
 * BFS from a starting node; returns the set of terminal node IDs reached
 * (end-event or merge nodes), or an empty array if the path dead-ends.
 *
 * @param {{ nodes: Array, connections: Array }} graph
 * @param {string} startId  - node to begin BFS from
 * @param {Set<string>} visited - already-visited set (to avoid infinite loops)
 * @returns {string[]}  IDs of terminal / merge / end-event nodes reached
 */
export function findTerminalNodes(graph, startId, visited) {
  const adj = buildAdjacencyList(graph);
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const terminalTypes = new Set(['end-event', 'merge']);
  const reached = [];
  const queue = [startId];

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) continue;

    // If we reached a terminal-type node, record it and stop expanding
    if (terminalTypes.has(node.type)) {
      reached.push(id);
      continue;
    }

    // Expand neighbours
    const neighbours = adj[id] || [];
    if (neighbours.length === 0 && !terminalTypes.has(node.type)) {
      // Dead-end — not a terminal node, path goes nowhere
      continue;
    }
    for (const next of neighbours) {
      queue.push(next);
    }
  }

  return reached;
}

/**
 * Get display label for a node (falls back to its id).
 * @param {{ nodes: Array }} graph
 * @param {string} nodeId
 * @returns {string}
 */
function getNodeLabel(graph, nodeId) {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return nodeId;
  return (node.label || node.id).replace(/\\n/g, ' ');
}

// ── Individual Checks ──────────────────────────────────────────────────────

/**
 * 5.1 — Exactly one start-event node; start cannot have incoming arrows.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkStartNode(graph) {
  const starts = graph.nodes.filter(n => n.type === 'start-event');
  if (starts.length === 0) {
    return [{ severity: 'error', message: 'Process must have exactly one Start node' }];
  }
  const issues = [];
  if (starts.length > 1) {
    issues.push({
      severity: 'error',
      nodeId: starts[1].id,
      message: `Found ${starts.length} Start nodes — only one allowed`,
    });
  }
  // Start cannot have incoming arrows
  const incoming = (graph.connections || []).filter(c => c.to === starts[0].id);
  if (incoming.length > 0) {
    issues.push({
      severity: 'error',
      nodeId: starts[0].id,
      message: 'Start node cannot have incoming arrows',
    });
  }
  return issues;
}

/**
 * 5.2 — At least one end-event node; end cannot have outgoing arrows.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkEndNode(graph) {
  const ends = graph.nodes.filter(n => n.type === 'end-event');
  if (ends.length === 0) {
    return [{ severity: 'error', message: 'Process must have at least one End node' }];
  }
  const issues = [];
  for (const end of ends) {
    const outgoing = (graph.connections || []).filter(c => c.from === end.id);
    if (outgoing.length > 0) {
      issues.push({
        severity: 'error',
        nodeId: end.id,
        message: 'End node cannot have outgoing arrows',
      });
    }
  }
  return issues;
}

/**
 * 5.3 — No dangling arrows (from/to must reference existing nodes).
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDanglingArrows(graph) {
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  return (graph.connections || [])
    .filter(c => !nodeIds.has(c.from) || !nodeIds.has(c.to))
    .map(c => ({
      severity: 'error',
      connId: c.id,
      message: `Arrow "${c.id || '?'}" references non-existent node`,
    }));
}

/**
 * 5.4 — All decision branches must reconnect (reach merge, end, or converge).
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDecisionBranches(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');

  for (const gw of gateways) {
    const outgoing = (graph.connections || []).filter(c => c.from === gw.id);
    // BFS from each branch — all must reach a merge, end, or common node
    const branchEndpoints = outgoing.map(c =>
      findTerminalNodes(graph, c.to, new Set([gw.id]))
    );

    for (let i = 0; i < branchEndpoints.length; i++) {
      if (branchEndpoints[i].length === 0) {
        issues.push({
          severity: 'error',
          nodeId: gw.id,
          message: `Decision branch "${outgoing[i].label || i + 1}" dead-ends without reaching End or Merge`,
        });
      }
    }
  }

  return issues;
}

/**
 * 5.5 — Cycle detection via DFS. Skipped when config.loopModeEnabled is true.
 * @param {{ nodes: Array, connections: Array }} graph
 * @param {{ loopModeEnabled?: boolean }} config
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkCycles(graph, config) {
  if (config && config.loopModeEnabled) return [];

  const adj = buildAdjacencyList(graph);
  const visited = new Set();
  const inStack = new Set();
  const issues = [];

  /**
   * @param {string} nodeId
   */
  function dfs(nodeId) {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of (adj[nodeId] || [])) {
      if (inStack.has(neighbor)) {
        issues.push({
          severity: 'error',
          nodeId: neighbor,
          message: `Cycle detected involving node "${getNodeLabel(graph, neighbor)}"`,
        });
        return;
      }
      if (!visited.has(neighbor)) dfs(neighbor);
    }
    inStack.delete(nodeId);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) dfs(node.id);
  }
  return issues;
}

/**
 * 5.6 — All tasks / subprocess / process-group must belong to a valid swimlane.
 * @param {{ nodes: Array, lanes: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkSwimlaneAssignment(graph) {
  const laneIds = new Set((graph.lanes || []).map(l => l.id));
  return graph.nodes
    .filter(n => ['task', 'subprocess', 'process-group'].includes(n.type))
    .filter(n => !n.lane || !laneIds.has(n.lane))
    .map(n => ({
      severity: 'error',
      nodeId: n.id,
      message: `Task "${getNodeLabel(graph, n.id)}" is not assigned to a valid swimlane`,
    }));
}

/**
 * 5.7 — No orphaned nodes. BFS from start using bidirectional adjacency;
 *        all non-annotation nodes must be reachable.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkOrphanedNodes(graph) {
  const start = graph.nodes.find(n => n.type === 'start-event');
  if (!start) return []; // caught by 5.1

  const adj = buildBidirectionalAdjList(graph);
  const reachable = new Set();
  const queue = [start.id];

  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const neighbor of (adj[id] || [])) {
      queue.push(neighbor);
    }
  }

  const annotationTypes = new Set(['persona', 'system', 'agent', 'annotation']);
  return graph.nodes
    .filter(n => !annotationTypes.has(n.type))
    .filter(n => !reachable.has(n.id))
    .map(n => ({
      severity: 'warning',
      nodeId: n.id,
      message: `Node "${getNodeLabel(graph, n.id)}" is not connected to the process flow`,
    }));
}

/**
 * 5.8 — All outgoing arrows from a gateway must have a non-empty label or decision field.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDecisionLabels(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');

  for (const gw of gateways) {
    const outgoing = (graph.connections || []).filter(c => c.from === gw.id);
    for (const conn of outgoing) {
      if (!conn.label && !conn.decision) {
        issues.push({
          severity: 'error',
          nodeId: gw.id,
          connId: conn.id,
          message: `Decision "${getNodeLabel(graph, gw.id)}" has an unlabelled branch`,
        });
      }
    }
  }
  return issues;
}

/**
 * 5.9 — Gateway cardinality: exactly 1 incoming, 2–5 outgoing.
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDecisionCardinality(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');

  for (const gw of gateways) {
    const inCount  = (graph.connections || []).filter(c => c.to === gw.id).length;
    const outCount = (graph.connections || []).filter(c => c.from === gw.id).length;

    if (inCount !== 1) {
      issues.push({
        severity: 'error',
        nodeId: gw.id,
        message: `Decision "${getNodeLabel(graph, gw.id)}" must have exactly 1 incoming arrow (has ${inCount})`,
      });
    }
    if (outCount < 2) {
      issues.push({
        severity: 'error',
        nodeId: gw.id,
        message: `Decision "${getNodeLabel(graph, gw.id)}" must have at least 2 outgoing branches (has ${outCount})`,
      });
    }
    if (outCount > 5) {
      issues.push({
        severity: 'error',
        nodeId: gw.id,
        message: `Decision "${getNodeLabel(graph, gw.id)}" cannot have more than 5 outgoing branches (has ${outCount})`,
      });
    }
  }
  return issues;
}

/**
 * 5.10 — Gateway outgoing arrows must use distinct sourcePort values (if ports assigned).
 * @param {{ nodes: Array, connections: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDistinctPorts(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');

  for (const gw of gateways) {
    const outgoing = (graph.connections || []).filter(c => c.from === gw.id);
    const ports = outgoing.map(c => c.sourcePort).filter(Boolean);
    const unique = new Set(ports);
    if (ports.length !== unique.size) {
      issues.push({
        severity: 'error',
        nodeId: gw.id,
        message: `Decision "${getNodeLabel(graph, gw.id)}" has multiple branches sharing the same port`,
      });
    }
  }
  return issues;
}

/**
 * 7.8 — Process group nesting depth must not exceed 3 levels.
 * Walks the children references to compute the nesting depth of each
 * process-group node. Returns an error if any group is nested more than 3 deep.
 *
 * @param {{ nodes: Array }} graph
 * @returns {Array<{severity: string, nodeId?: string, message: string}>}
 */
export function checkNestingDepth(graph) {
  const issues = [];
  const groups = graph.nodes.filter(n => n.type === 'process-group');
  if (groups.length === 0) return issues;

  // Build a map: childId → parentGroupId
  const childToParent = new Map();
  for (const group of groups) {
    if (group.children && Array.isArray(group.children)) {
      for (const childId of group.children) {
        childToParent.set(childId, group.id);
      }
    }
  }

  /**
   * getDepth(nodeId) — walk up through parent groups to compute nesting depth.
   * depth 0 = top-level (no parent group), depth 1 = inside one group, etc.
   */
  function getDepth(nodeId, seen) {
    if (!seen) seen = new Set();
    if (seen.has(nodeId)) return 0; // prevent infinite loop on circular refs
    seen.add(nodeId);

    const parentId = childToParent.get(nodeId);
    if (!parentId) return 0;
    return 1 + getDepth(parentId, seen);
  }

  for (const group of groups) {
    const depth = getDepth(group.id);
    if (depth >= 3) {
      issues.push({
        severity: 'error',
        nodeId: group.id,
        message: `Process group "${getNodeLabel(graph, group.id)}" is nested ${depth} levels deep (maximum is 3)`,
      });
    }
  }

  return issues;
}

/**
 * 7.9 — Decision-to-decision connection check (controlled by config toggle).
 * When config.allowDecisionToDecision is false, flags any gateway→gateway connections.
 *
 * @param {{ nodes: Array, connections: Array }} graph
 * @param {{ allowDecisionToDecision?: boolean }} config
 * @returns {Array<{severity: string, nodeId?: string, connId?: string, message: string}>}
 */
function checkDecisionToDecision(graph, config) {
  if (config && config.allowDecisionToDecision) return [];

  const issues = [];
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

  for (const conn of (graph.connections || [])) {
    const fromNode = nodeMap.get(conn.from);
    const toNode   = nodeMap.get(conn.to);
    if (fromNode && toNode && fromNode.type === 'gateway' && toNode.type === 'gateway') {
      issues.push({
        severity: 'error',
        nodeId: fromNode.id,
        connId: conn.id,
        message: `Gateway-to-gateway connection not allowed: "${getNodeLabel(graph, fromNode.id)}" → "${getNodeLabel(graph, toNode.id)}"`,
      });
    }
  }
  return issues;
}

// ── Main Validation Entry Point ────────────────────────────────────────────

/**
 * Validate an entire process graph and return all issues found.
 *
 * @param {{ nodes: Array, connections?: Array, lanes?: Array }} graph
 *   The parsed graph object.
 * @param {{ loopModeEnabled?: boolean }} [config={}]
 *   Optional configuration overrides. When `loopModeEnabled` is true,
 *   cycle detection (5.5) is skipped.
 * @returns {Array<{severity: 'error'|'warning', nodeId?: string, connId?: string, message: string}>}
 */
export function validateGraph(graph, config = {}) {
  const issues = [];

  issues.push(...checkStartNode(graph));
  issues.push(...checkEndNode(graph));
  issues.push(...checkDanglingArrows(graph));
  issues.push(...checkDecisionBranches(graph));
  issues.push(...checkCycles(graph, config));
  issues.push(...checkSwimlaneAssignment(graph));
  issues.push(...checkOrphanedNodes(graph));
  issues.push(...checkDecisionLabels(graph));
  issues.push(...checkDecisionCardinality(graph));
  issues.push(...checkDistinctPorts(graph));
  issues.push(...checkNestingDepth(graph));
  issues.push(...checkDecisionToDecision(graph, config));

  return issues;
}
