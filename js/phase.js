/**
 * phase.js — N-phase visibility and diff helpers for the multi-phase model.
 *
 * These functions implement the schema v2.0 phase semantics:
 *   - string phase = "introduced at" (visible from that phase onward)
 *   - array phase  = "visible exactly in" (explicit enumeration)
 *   - omitted      = always visible
 *
 * Backward-compatible: two-phase graphs (phases.length <= 2) should continue
 * to use the legacy isVisible() path in data.js.
 */

// ─── Default phases for legacy before/after graphs ──────────────────────────

const DEFAULT_PHASES = [
  { id: 'phase0', label: 'Before', color: '#ef4444' },
  { id: 'phase1', label: 'After',  color: '#22c55e' },
];

/**
 * Return the graph's phases array, injecting a default two-phase array
 * when the graph has no explicit phases definition.
 *
 * @param {object} graph - Parsed graph object.
 * @returns {object[]} Array of phase objects with at least { id, label }.
 */
export function normalizePhases(graph) {
  if (Array.isArray(graph.phases) && graph.phases.length > 0 && graph.phases[0].id !== undefined) {
    return graph.phases;
  }
  return DEFAULT_PHASES;
}

/**
 * Determine if an item (node or connection) is visible at a given phase index.
 *
 * Phase field semantics:
 *   - undefined/null: always visible (no phase restriction)
 *   - string: "introduced at" — visible from that phase onward
 *   - array:  "visible exactly in" — visible only in the listed phases
 *
 * Legacy string values ("before", "after", "both") are handled for
 * backward compatibility when a two-phase default is in use.
 *
 * @param {object}   item              - Node or connection object with optional .phase
 * @param {number}   currentPhaseIndex - 0-based index into the phases array
 * @param {object[]} allPhases         - The graph's phases array (from normalizePhases)
 * @returns {boolean}
 */
export function isVisibleAtPhase(item, currentPhaseIndex, allPhases) {
  const phase = item.phase;

  // No phase field: always visible
  if (phase === undefined || phase === null) {
    return true;
  }

  // String value: "introduced at" — visible from that phase onward
  if (typeof phase === 'string') {
    // Legacy compatibility
    if (phase === 'both') return true;
    if (phase === 'before') {
      return currentPhaseIndex === 0;
    }
    if (phase === 'after') {
      return currentPhaseIndex >= 1;
    }

    const introIndex = allPhases.findIndex(p => p.id === phase);
    if (introIndex === -1) return true; // unknown phase ID — show by default
    return currentPhaseIndex >= introIndex;
  }

  // Array value: "visible exactly in" — must match current phase ID
  if (Array.isArray(phase)) {
    const currentPhaseId = allPhases[currentPhaseIndex]?.id;
    return phase.includes(currentPhaseId);
  }

  return true; // fallback
}

/**
 * Compute the diff status for an item at the given phase.
 *
 * Returns a CSS-class-compatible string:
 *   - 'added'    — item introduced at exactly this phase
 *   - 'removed'  — item was visible at the previous phase but not at this one
 *   - 'modified' — explicit diff override from the JSON
 *   - null       — unchanged or phase 0 (no diff at baseline)
 *
 * @param {object}   item              - Node or connection object
 * @param {number}   currentPhaseIndex - 0-based index into the phases array
 * @param {object[]} allPhases         - The graph's phases array
 * @returns {string|null}
 */
export function getDiffStatus(item, currentPhaseIndex, allPhases) {
  if (currentPhaseIndex === 0) return null; // no diff at baseline

  const phase = item.phase;
  const currentId = allPhases[currentPhaseIndex]?.id;
  const prevId = allPhases[currentPhaseIndex - 1]?.id;

  // Added: string phase matching current phase exactly (introduced here)
  if (typeof phase === 'string' && phase !== 'both' && phase !== 'before' && phase !== 'after') {
    if (phase === currentId) {
      return 'added';
    }
  }

  // Removed: array phase that includes previous but not current
  if (Array.isArray(phase)) {
    const inPrev = phase.includes(prevId);
    const inCurr = phase.includes(currentId);
    if (inPrev && !inCurr) return 'removed';
  }

  // Explicit diff override from JSON (for edge cases like "modified")
  if (item.diff === 'modified') return 'modified';

  return null;
}
