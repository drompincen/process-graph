/**
 * diff.js — Diff classification and view-mode button wiring
 */
import { state, dom } from './state.js';
import { renderAll } from './renderer.js';

// ── Diff state CSS classes ──────────────────────────────────────────────────
const DIFF_CLASSES = ['diff-added', 'diff-removed', 'diff-changed', 'diff-unchanged'];

/**
 * Classify every node in the graph as 'added' | 'removed' | 'changed' | 'unchanged'.
 *
 * Rules (in precedence order):
 *  1. node.diff === 'added'   → 'added'
 *  2. node.diff === 'removed' → 'removed'
 *  3. node.phase === 'before' with no matching label in phase='after' → 'removed'
 *  4. node.phase === 'after'  with no matching label in phase='before' → 'added'
 *  5. node.phase === 'both'   → 'unchanged'
 *  6. Graph has no before/after phases at all → all 'unchanged'
 *
 * @param {object} graph - The parsed graph object
 * @returns {Map<string, string>} Map of nodeId → diffState
 */
export function classifyDiff(graph) {
  const result = new Map();
  const nodes = graph.nodes || [];

  // Determine whether this graph uses before/after phases at all
  const hasPhases = nodes.some(n => n.phase === 'before' || n.phase === 'after');

  if (!hasPhases) {
    // No before/after distinction — every node is unchanged
    nodes.forEach(n => result.set(n.id, 'unchanged'));
    return result;
  }

  // Build lookup sets for matching nodes by label across phases
  // Matching convention: 'b-xxx' prefix → before, 'a-xxx' prefix → after
  // Secondary fallback: match by node.label across phases
  const beforeLabels = new Set(
    nodes
      .filter(n => n.phase === 'before' || (n.id && n.id.startsWith('b-')))
      .map(n => n.label)
      .filter(Boolean)
  );
  const afterLabels = new Set(
    nodes
      .filter(n => n.phase === 'after' || (n.id && n.id.startsWith('a-')))
      .map(n => n.label)
      .filter(Boolean)
  );

  nodes.forEach(n => {
    // Explicit diff override takes highest precedence
    if (n.diff === 'added') {
      result.set(n.id, 'added');
      return;
    }
    if (n.diff === 'removed') {
      result.set(n.id, 'removed');
      return;
    }
    if (n.diff === 'changed') {
      result.set(n.id, 'changed');
      return;
    }

    // phase='both' is always unchanged
    if (n.phase === 'both') {
      result.set(n.id, 'unchanged');
      return;
    }

    // Determine effective phase from node.phase or id prefix
    let effectivePhase = n.phase;
    if (!effectivePhase) {
      if (n.id && n.id.startsWith('b-')) effectivePhase = 'before';
      else if (n.id && n.id.startsWith('a-')) effectivePhase = 'after';
    }

    if (effectivePhase === 'before') {
      // Removed if there is no node with the same label in the after set
      const label = n.label;
      if (label && afterLabels.has(label)) {
        result.set(n.id, 'unchanged');
      } else {
        result.set(n.id, 'removed');
      }
      return;
    }

    if (effectivePhase === 'after') {
      // Added if there is no node with the same label in the before set
      const label = n.label;
      if (label && beforeLabels.has(label)) {
        result.set(n.id, 'unchanged');
      } else {
        result.set(n.id, 'added');
      }
      return;
    }

    // Default fallback
    result.set(n.id, 'unchanged');
  });

  return result;
}

/**
 * Walk all nodes, look up their diffState from classifyDiff(graph), and apply
 * the appropriate CSS class to each SVG node group (`<g data-node-id="...">`)
 * inside dom.nodesLayer.
 *
 * @param {object} graph - The parsed graph object
 */
export function applyDiffClasses(graph) {
  if (!dom.nodesLayer) return;

  const diffMap = state.diffMap || classifyDiff(graph);

  diffMap.forEach((diffState, nodeId) => {
    const el = dom.nodesLayer.querySelector(`[data-node-id="${nodeId}"]`);
    if (!el) return;

    // Remove all diff classes first, then apply the correct one
    DIFF_CLASSES.forEach(cls => el.classList.remove(cls));

    switch (diffState) {
      case 'added':     el.classList.add('diff-added');     break;
      case 'removed':   el.classList.add('diff-removed');   break;
      case 'changed':   el.classList.add('diff-changed');   break;
      case 'unchanged': el.classList.add('diff-unchanged'); break;
      default: break;
    }
  });
}

/**
 * Initialise diff classification and wire up the 4 view-mode toggle buttons.
 *
 * - Computes and stores state.diffMap
 * - Binds click handlers on #btn-before, #btn-split, #btn-after, #btn-overlay
 *   (and any .view-btn elements as a fallback)
 * - Each click sets state.viewMode, updates the .active class, and re-renders
 *
 * @param {object} graph - The parsed graph object
 */
export function initDiff(graph) {
  // Classify and cache
  state.diffMap = classifyDiff(graph);

  // Collect the 4 named button refs from dom (populated by initDom)
  const namedButtons = [
    dom.btnBefore,
    dom.btnSplit,
    dom.btnAfter,
    dom.btnOverlay,
  ].filter(Boolean);

  // Also collect any .view-btn elements that may not be in the named set
  const allViewButtons = Array.from(
    document.querySelectorAll('.view-btn')
  );

  // Merge into a de-duplicated set
  const buttonSet = new Set([...namedButtons, ...allViewButtons]);

  /**
   * Update active state and trigger a re-render for the given mode.
   * @param {string} mode
   */
  function activateMode(mode) {
    state.viewMode = mode;

    // Update .active class on all known view-mode buttons
    buttonSet.forEach(btn => {
      const btnMode = btn.dataset.mode;
      btn.classList.toggle('active', btnMode === mode);
    });

    renderAll(graph);

    // Apply (or clear) diff CSS classes depending on mode
    if (mode === 'overlay') {
      applyDiffClasses(graph);
    } else {
      // Remove all diff classes when leaving overlay mode
      if (dom.nodesLayer) {
        dom.nodesLayer.querySelectorAll('[data-node-id]').forEach(el => {
          DIFF_CLASSES.forEach(cls => el.classList.remove(cls));
        });
      }
    }
  }

  // Attach click listeners
  buttonSet.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode) activateMode(mode);
    });
  });
}
