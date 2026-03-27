/**
 * data.js — JSON parser, validator, and phase-visibility helpers
 */

import {
  CONNECTION_MATRIX,
  ALLOW_DECISION_TO_DECISION,
  LANE_TYPES,
  DEFAULT_LANE_TYPE,
  PORT_DEFS,
} from './constants.js';

/** Valid node type identifiers accepted by the parser (derived from PORT_DEFS). */
const VALID_NODE_TYPES = new Set(Object.keys(PORT_DEFS));

/**
 * Parse a JSON string (may contain JS-style comments) into a validated graph.
 * Throws with a descriptive message on any error.
 */
export function parseGraph(jsonString) {
  const cleaned    = stripComments(jsonString);
  const normalized = normalizeMultilineStrings(cleaned);
  let graph;
  try {
    graph = JSON.parse(normalized);
  } catch (e) {
    throw new Error(`JSON parse error: ${e.message}`);
  }
  validateGraph(graph);
  return graph;
}

/**
 * Validate graph structure. Throws on hard errors, warns on soft issues.
 */
function validateGraph(graph) {
  if (!graph.lanes || !Array.isArray(graph.lanes) || graph.lanes.length === 0)
    throw new Error('Graph must have a non-empty "lanes" array');
  if (!graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0)
    throw new Error('Graph must have a non-empty "nodes" array');

  // Validate and default lane types
  graph.lanes.forEach(lane => {
    if (!lane.type) {
      lane.type = DEFAULT_LANE_TYPE;
    } else if (!LANE_TYPES.includes(lane.type)) {
      throw new Error(`Lane "${lane.id}" has invalid type "${lane.type}" — must be one of: ${LANE_TYPES.join(', ')}`);
    }
  });

  const laneIds = new Set(graph.lanes.map(l => l.id));
  const nodeIds = new Set(graph.nodes.map(n => n.id));

  // Check node lane refs and types
  graph.nodes.forEach(n => {
    if (!n.id)       throw new Error(`Node missing "id" field: ${JSON.stringify(n)}`);
    if (!n.lane)     throw new Error(`Node "${n.id}" missing "lane" field`);
    if (!laneIds.has(n.lane)) throw new Error(`Node "${n.id}" references unknown lane "${n.lane}"`);
    if (!n.type)     throw new Error(`Node "${n.id}" missing "type" field`);
    if (!VALID_NODE_TYPES.has(n.type))
      throw new Error(`Node "${n.id}" has unknown type "${n.type}"`);

    // Process group children must reference existing node IDs
    if (n.type === 'process-group' && n.children) {
      if (!Array.isArray(n.children))
        throw new Error(`Node "${n.id}" children must be an array`);
      n.children.forEach(childId => {
        if (!nodeIds.has(childId))
          throw new Error(`Process group "${n.id}" references unknown child "${childId}"`);
      });
    }
  });

  // Check connection node refs and self-connections
  (graph.connections || []).forEach(c => {
    if (!nodeIds.has(c.from)) throw new Error(`Connection "${c.id || '?'}" from unknown node "${c.from}"`);
    if (!nodeIds.has(c.to))   throw new Error(`Connection "${c.id || '?'}" to unknown node "${c.to}"`);
    if (c.from === c.to) {
      console.warn(`[data] Connection "${c.id || '?'}" is a self-connection (from === to === "${c.from}")`);
    }
  });

  // Soft warnings
  if (graph.story) {
    const kpiIds = new Set((graph.story.kpis || []).map(k => k.id));
    (graph.story.benefits || []).forEach(b => {
      if (b.kpiId && !kpiIds.has(b.kpiId))
        console.warn(`[data] Benefit "${b.id}" references unknown kpiId "${b.kpiId}"`);
    });
  }
}

/**
 * Comprehensive connection validation that wraps isValidConnection with
 * additional checks: self-connection, port availability, gateway-to-gateway.
 *
 * @param {object} sourceNode          - source node object (must have .id, .type)
 * @param {object} targetNode          - target node object (must have .id, .type)
 * @param {Array}  existingConnections - current connections array [{from, to, ...}]
 * @param {object} [config]            - optional overrides
 * @param {boolean} [config.allowDecisionToDecision] - override ALLOW_DECISION_TO_DECISION
 * @returns {{ valid: boolean, reason?: string }}
 */
export function canConnect(sourceNode, targetNode, existingConnections, config) {
  // 1. Self-connection check
  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'Cannot connect a node to itself' };
  }

  // 2. Type compatibility (delegates to isValidConnection)
  const typeCheck = isValidConnection(sourceNode.type, targetNode.type, config);
  if (!typeCheck.valid) {
    return typeCheck;
  }

  // 3. Source port availability (maxOut)
  const portDef = PORT_DEFS[sourceNode.type];
  if (portDef) {
    const outCount = existingConnections.filter(c => c.from === sourceNode.id).length;
    if (outCount >= portDef.maxOut) {
      return { valid: false, reason: `Maximum outgoing connections reached (${portDef.maxOut})` };
    }
  }

  // 4. Target port availability (maxIn)
  const targetPortDef = PORT_DEFS[targetNode.type];
  if (targetPortDef) {
    const inCount = existingConnections.filter(c => c.to === targetNode.id).length;
    if (inCount >= targetPortDef.maxIn) {
      return { valid: false, reason: `Maximum incoming connections reached (${targetPortDef.maxIn})` };
    }
  }

  return { valid: true };
}

/**
 * Check whether a connection from one node type to another is allowed.
 *
 * @param {string} fromType  - source node type (e.g. 'task', 'gateway')
 * @param {string} toType    - target node type
 * @param {object} [config]  - optional overrides
 * @param {boolean} [config.allowDecisionToDecision] - override ALLOW_DECISION_TO_DECISION
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isValidConnection(fromType, toType, config) {
  const allowD2D = (config && config.allowDecisionToDecision !== undefined)
    ? config.allowDecisionToDecision
    : ALLOW_DECISION_TO_DECISION;

  // Unknown source type
  const allowed = CONNECTION_MATRIX[fromType];
  if (!allowed) {
    return { valid: false, reason: `Unknown source type "${fromType}"` };
  }

  // Gateway → gateway guard
  if (fromType === 'gateway' && toType === 'gateway' && !allowD2D) {
    return { valid: false, reason: 'Gateway-to-gateway connections are not allowed (ALLOW_DECISION_TO_DECISION is false)' };
  }

  // Check matrix
  if (!allowed.includes(toType)) {
    return { valid: false, reason: `"${fromType}" cannot connect to "${toType}"` };
  }

  return { valid: true };
}

/**
 * Determine if a node/connection/zone is visible given the current view mode
 * and selected phase.
 *
 * @param {object} item      - node or connection with .phase property
 * @param {string} viewMode  - 'before' | 'after' | 'split' | 'overlay'
 * @param {string|null} selectedPhase - phase ID or null (show all)
 * @returns {boolean}
 */
export function isVisible(item, viewMode, selectedPhase) {
  const phase = item.phase;

  // Phase filter (improvement rollout phases) — takes precedence
  if (selectedPhase && phase !== 'both') {
    if (!itemBelongsToPhase(item, selectedPhase)) return false;
  }

  // View mode filter
  if (viewMode === 'before') {
    return phase === 'before' || phase === 'both';
  }
  if (viewMode === 'after') {
    return phase === 'after' || phase === 'both';
  }
  if (viewMode === 'overlay') {
    // Overlay shows all nodes so diff classes can be applied to removed (before) nodes too
    return true;
  }
  if (viewMode === 'split') {
    // Split shows everything (both sides rendered side-by-side)
    return true;
  }
  return true;
}

/**
 * Check if item belongs to the given improvement phase.
 * An item belongs if phase === phaseId, or phase is an array containing phaseId,
 * or phase === 'both' (always visible).
 */
export function itemBelongsToPhase(item, phaseId) {
  const p = item.phase;
  if (!p || p === 'both') return true;
  if (Array.isArray(p)) return p.includes(phaseId);
  return p === phaseId;
}

/**
 * Get the index of a phase by ID within graph.phases array.
 * Returns -1 if not found.
 */
export function getPhaseIndex(graph, phaseId) {
  return (graph.phases || []).findIndex(p => p.id === phaseId);
}

/**
 * Resolve the active animation sequence from state.
 * Returns filtered array of steps for the selected flow + phase.
 */
export function resolveActiveSequence(graph, selectedFlowId, selectedPhase) {
  let steps;

  if (selectedFlowId && graph.flows) {
    const flow = graph.flows.find(f => f.id === selectedFlowId);
    steps = flow ? flow.sequence : (graph.sequence || []);
  } else {
    steps = graph.sequence || [];
  }

  if (!selectedPhase) return steps;

  return steps.filter(s => itemBelongsToPhase(s, selectedPhase));
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip JS-style // line comments and /* block comments from a JSON string.
 * Safe to run on valid JSON (which has no comments) — returns unchanged.
 */
export function stripComments(str) {
  // Remove block comments /* ... */
  str = str.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments // ... (but not URLs like https://)
  str = str.replace(/([^:])\/\/[^\n]*/g, '$1');
  return str;
}

/**
 * Normalize actual newline characters inside JSON string values to \n escapes
 * so JSON.parse doesn't choke on multiline strings.
 */
export function normalizeMultilineStrings(str) {
  // Replace literal newlines inside double-quoted strings with \n
  return str.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
    return '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
  });
}
