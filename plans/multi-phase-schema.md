# Multi-Phase Process Transformation Schema

Version: 2.0
Status: Draft
Date: 2026-03-27

---

## 1. Overview

The current process-graph JSON schema uses a binary `"before"` / `"after"` model where nodes and connections declare their visibility as one of two fixed phases. The new schema replaces this with an N-phase model where a process evolves through an arbitrary number of transformation phases (typically 4: a baseline plus 3 improvement stages).

The archviz project (`coffee-shop-transformation.json`) already implements this pattern and serves as the reference model.

---

## 2. Full Schema Definition

### 2.1 Top-Level Structure

```jsonc
{
  "title": "string (required)",
  "description": "string (optional)",
  "notes": "string (optional)",

  "metrics": {
    // Per-phase metrics keyed by phase ID (replaces before/after keys)
    "phase0": { "stepCount": 6, "cycleTimeHours": 48, ... },
    "phase1": { "stepCount": 5, "cycleTimeHours": 24, ... },
    "phase2": { "stepCount": 4, "cycleTimeHours": 4, ... },
    "phase3": { "stepCount": 3, "cycleTimeHours": 0.5, ... }
  },

  "phases": [
    // Ordered array. Index 0 = baseline. See section 2.2.
  ],

  "lanes": [
    // Unchanged from current schema.
    { "id": "string", "label": "string", "color": "#hex", "height": 130 }
  ],

  "nodes": [
    // See section 2.3.
  ],

  "connections": [
    // See section 2.4.
  ],

  "flows": [
    // Unchanged. Each flow's steps can carry phase fields.
  ],

  "sequence": [
    // Legacy top-level sequence. Unchanged.
  ],

  "story": {
    // Unchanged. story.phases continues to describe narrative phases.
  },

  "spec": {
    "schemaVersion": "2.0",
    // Unchanged structure.
  }
}
```

### 2.2 Phase Definition

```json
"phases": [
  { "id": "phase0", "label": "0 -- Manual Baseline",  "color": "#6b7280" },
  { "id": "phase1", "label": "1 -- Digital Forms",     "color": "#3b82f6" },
  { "id": "phase2", "label": "2 -- Auto Validation",   "color": "#8b5cf6" },
  { "id": "phase3", "label": "3 -- AI-Powered",        "color": "#10b981" }
]
```

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| `id`    | string | yes      | Unique phase identifier. Convention: `phase0`, `phase1`, etc. |
| `label` | string | yes      | Human-readable label shown in the UI phase slider and legend. |
| `color` | string | no       | Hex color for phase indicator dots and diff highlights. Falls back to a default palette if omitted. |

Rules:
- Array order defines the chronological progression. Index 0 is always the baseline.
- The `id` values are referenced by nodes and connections in their `phase` field.
- Minimum 2 phases. No hard upper limit, but the UI is optimized for 2-6.

### 2.3 Node Schema

```jsonc
{
  "id": "string (required)",
  "type": "start-event | task | subprocess | gateway | end-event | intermediate-event | annotation | persona | agent | system",
  "label": "string (required)",
  "lane": "string (required) -- references lanes[].id",
  "x": "number (required) -- horizontal position",

  // --- Phase field (the key change) ---
  "phase": "string | string[] | omitted",

  // --- Optional fields (unchanged) ---
  "diff": "added | removed | modified",   // DEPRECATED: computed at runtime in v2
  "state": "automated | manual | ...",
  "y": "number (optional -- override lane-based y)"
}
```

#### Phase Field Semantics

The `phase` field on a node (or connection) controls visibility across the phase timeline.

| Value | Type | Meaning | Example |
|-------|------|---------|---------|
| _(omitted)_ | undefined | Visible in ALL phases. Core infrastructure that never changes. | A gateway that exists from baseline through final phase. |
| `"phase1"` | string | **Introduced** at phase1. Visible from phase1 onward (phase1, phase2, phase3, ...). | A portal node added in Phase 1 that persists. |
| `["phase0"]` | array | Visible **only** in phase0. Removed starting at phase1. | A paper form that is eliminated in the first improvement. |
| `["phase0", "phase1"]` | array | Visible in phase0 and phase1 only. Removed starting at phase2. | A card terminal phased out when digital payments arrive. |
| `["phase1", "phase3"]` | array | Visible only in phase1 and phase3 (not phase0 or phase2). | Rare; allows non-contiguous visibility for special cases. |

Key distinction: **string = "introduced at" (persists forever)**; **array = "visible exactly in" (explicit enumeration)**.

### 2.4 Connection Schema

```jsonc
{
  "id": "string (required)",
  "from": "string (required) -- source node ID",
  "to": "string (required) -- target node ID",
  "type": "sequence | message | conditional | association",

  // --- Phase field (same semantics as nodes) ---
  "phase": "string | string[] | omitted",

  // --- Port control (optional) ---
  "sourcePort": "1 | 2 | 3 | 4",   // exit point: 1=top, 2=right, 3=bottom, 4=left
  "targetPort": "1 | 2 | 3 | 4",   // entry point: 1=top, 2=right, 3=bottom, 4=left

  // --- Optional fields (unchanged) ---
  "label": "string",
  "decision": "yes | no",
  "style": "dashed | ...",
  "offset": "number (self-loop offset)",
  "route": "right | left | down | up"  // force routing direction
}
```

Connection phase rules follow the same semantics as nodes. Additionally:
- A connection is only renderable if BOTH its source and target nodes are visible at the current phase.
- If a connection has no `phase` field but one of its endpoint nodes is not visible, the connection is hidden.

#### Port System (Entry/Exit Points)

Each node has 4 numbered ports corresponding to the midpoint of each edge:

```
        ┌───── 1 (top) ─────┐
        │                     │
   4 (left)      NODE     2 (right)
        │                     │
        └──── 3 (bottom) ────┘
```

| Port | Position | Use for |
|------|----------|---------|
| `"1"` | Top center | Connections arriving from above |
| `"2"` | Right center | Connections going forward (left-to-right flow) |
| `"3"` | Bottom center | Connections going to a lower lane |
| `"4"` | Left center | Connections arriving from the left (default entry) |

**Usage in connections:**
```json
{
  "id": "c-risk-exception",
  "from": "risk-gateway",
  "to": "uw-exception",
  "sourcePort": "3",
  "targetPort": "1",
  "decision": "no",
  "label": "High Risk"
}
```
This means: exit from the bottom of the gateway (port 3), enter the top of the underwriter node (port 1).

**When to use ports:**
- Omit `sourcePort`/`targetPort` for automatic routing (default — works well for most connections)
- Use ports when the auto-router picks the wrong edge (e.g., enters from the side instead of top)
- Gateway branches: use `sourcePort: "2"` for "yes" (right) and `sourcePort: "3"` for "no" (bottom)
- Cross-lane connections: use `targetPort: "1"` to force top entry

**Legacy named ports** are also supported: `in-top`, `in-left`, `in-right`, `out-right`, `out-bottom`, `out-left`, `out-bl`, `out-br`.

#### Best Practice: Avoid Shared Entry/Exit Ports

A node should not have incoming AND outgoing connections using the same port. This creates confusing diagrams where arrows arrive and depart from the same edge.

**Bad** (both use port 2 — right edge):
```
  [A] ──→ [B] ──→ [C]     ← B has in from A (right) and out to C (right)
```
Both arrows connect to B's right edge — hard to read.

**Good** (separate ports):
```json
{ "from": "A", "to": "B", "targetPort": "4" },    // enters B from left
{ "from": "B", "to": "C", "sourcePort": "2" }      // exits B from right
```

**Rules:**
1. Standard flow: enter from port 4 (left), exit from port 2 (right)
2. Cross-lane: enter from port 1 (top) or port 3 (bottom)
3. If a node has both same-lane incoming and cross-lane outgoing, use port 3 (bottom) for the cross-lane exit
4. Never have more than 2 connections on the same port

---

## 3. Example Nodes

### Example A: Always-visible node (no phase field)

```json
{
  "id": "gateway-approve",
  "type": "gateway",
  "label": "Approved?",
  "lane": "manager",
  "x": 650
}
```

This gateway exists in every phase from phase0 through phase3. It is never added or removed.

### Example B: Introduced at Phase 1, persists forever (string)

```json
{
  "id": "portal-submit",
  "type": "task",
  "label": "Submit via\nPortal",
  "lane": "requester",
  "x": 290,
  "phase": "phase1",
  "state": "automated"
}
```

Not visible in phase0 (the manual baseline). Appears starting at phase1 and remains visible in phase2 and phase3. When viewing phase1 with diff mode enabled, this node receives the `diff-added` CSS class.

### Example C: Visible only in phase0 and phase1, removed at phase2 (array)

```json
{
  "id": "paper-form",
  "type": "task",
  "label": "Fill Paper\nForm",
  "lane": "requester",
  "x": 290,
  "phase": ["phase0", "phase1"]
}
```

Visible in phase0 and phase1. At phase2 this node disappears. When viewing phase2 with diff mode enabled, this node receives the `diff-removed` CSS class (shown faded/struck-through).

---

## 4. Visibility Algorithm

### 4.1 Core Visibility Function

```javascript
/**
 * Determine if an item (node or connection) is visible at a given phase.
 *
 * @param {object}   item              - node or connection object
 * @param {number}   currentPhaseIndex - index into the phases array (0-based)
 * @param {object[]} allPhases         - the graph's phases array
 * @returns {boolean}
 */
function isVisibleAtPhase(item, currentPhaseIndex, allPhases) {
  const phase = item.phase;

  // No phase field: always visible
  if (phase === undefined || phase === null) {
    return true;
  }

  // String value: "introduced at" semantics -- visible from that phase onward
  if (typeof phase === 'string') {
    const introIndex = allPhases.findIndex(p => p.id === phase);
    if (introIndex === -1) return true; // unknown phase ID, show by default
    return currentPhaseIndex >= introIndex;
  }

  // Array value: "visible exactly in" semantics -- must match current phase ID
  if (Array.isArray(phase)) {
    const currentPhaseId = allPhases[currentPhaseIndex]?.id;
    return phase.includes(currentPhaseId);
  }

  return true; // fallback
}
```

### 4.2 Connection Visibility (additional constraint)

```javascript
function isConnectionVisible(conn, currentPhaseIndex, allPhases, nodesById) {
  // Connection's own phase must allow visibility
  if (!isVisibleAtPhase(conn, currentPhaseIndex, allPhases)) {
    return false;
  }
  // Both endpoints must also be visible
  const fromNode = nodesById[conn.from];
  const toNode = nodesById[conn.to];
  if (fromNode && !isVisibleAtPhase(fromNode, currentPhaseIndex, allPhases)) return false;
  if (toNode && !isVisibleAtPhase(toNode, currentPhaseIndex, allPhases)) return false;
  return true;
}
```

---

## 5. Diff Highlighting Rules

When diff mode is active and the user is viewing phase N (where N > 0), the renderer classifies each visible item:

| Classification | CSS Class | Condition | Visual Treatment |
|----------------|-----------|-----------|------------------|
| **Added** | `diff-added` | Item's phase is a string equal to `allPhases[N].id` (introduced at exactly this phase) | Green background/border, "NEW" badge |
| **Removed** | `diff-removed` | Item's phase is an array containing `allPhases[N-1].id` but NOT `allPhases[N].id` | Red background/border, faded opacity, strikethrough label |
| **Modified** | `diff-modified` | Item has explicit `"diff": "modified"` in JSON, or item has property changes between phases | Yellow/amber background/border |
| **Unchanged** | _(none)_ | Item was visible at phase N-1 and is still visible at phase N with no changes | Default styling |

```javascript
function getDiffClass(item, currentPhaseIndex, allPhases) {
  if (currentPhaseIndex === 0) return null; // no diff at baseline

  const phase = item.phase;
  const currentId = allPhases[currentPhaseIndex].id;
  const prevId = allPhases[currentPhaseIndex - 1].id;

  // Added: string phase matching current phase exactly
  if (typeof phase === 'string' && phase === currentId) {
    return 'diff-added';
  }

  // Removed: array phase that includes previous but not current
  if (Array.isArray(phase)) {
    const inPrev = phase.includes(prevId);
    const inCurr = phase.includes(currentId);
    if (inPrev && !inCurr) return 'diff-removed';
  }

  // Explicit diff override from JSON (for edge cases)
  if (item.diff === 'modified') return 'diff-modified';

  return null;
}
```

For Phase 0 (baseline), diff mode is not applicable -- all items are shown in their default state.

---

## 6. Backward Compatibility

### 6.1 Phase Field Translation

When the parser encounters legacy `"before"` / `"after"` values, it translates them to the new model:

| Legacy Value | New Equivalent | Rationale |
|-------------|----------------|-----------|
| `"before"` | `["phase0"]` | Visible only in the baseline phase, removed afterward. |
| `"after"` | `"phase1"` | Introduced at phase1, persists through all subsequent phases. |
| `"both"` | _(omitted / removed)_ | Equivalent to no phase field (always visible). |

### 6.2 Default Phases Array

When a JSON file has no `phases` array (or an empty one), the parser injects a default:

```json
"phases": [
  { "id": "phase0", "label": "Before", "color": "#ef4444" },
  { "id": "phase1", "label": "After",  "color": "#22c55e" }
]
```

This preserves exact binary before/after behavior for all existing sample files.

### 6.3 Metrics Key Translation

| Legacy Key | New Key |
|-----------|---------|
| `metrics.before` | `metrics.phase0` |
| `metrics.after` | `metrics.phase1` |

The parser checks for legacy keys and remaps them at load time. Both formats are accepted; if a file has both `metrics.before` and `metrics.phase0`, the `phase0` key takes precedence.

### 6.4 Translation Function

```javascript
function normalizePhaseField(item, hasLegacySchema) {
  if (!hasLegacySchema) return; // new-format files need no translation

  const p = item.phase;
  if (p === 'before') {
    item.phase = ['phase0'];
  } else if (p === 'after') {
    item.phase = 'phase1';
  } else if (p === 'both') {
    delete item.phase; // always-visible
  }
  // arrays and other strings pass through unchanged
}
```

Detection of legacy schema: `hasLegacySchema = true` when any node or connection has `phase === "before"` or `phase === "after"`.

---

## 7. View Mode Mapping

The current UI exposes four view modes: `before`, `split`, `after`, `overlay`. These map to the phase model as follows:

### 7.1 Two-Phase Files (backward-compatible)

| View Mode | Behavior |
|-----------|----------|
| `before` | Show phase index 0 only. |
| `after` | Show phase index 1 only. |
| `split` | Render phase 0 on the left, phase 1 on the right (side-by-side). |
| `overlay` | Show all items from both phases; apply diff classes to distinguish added/removed. |

No UI changes needed for two-phase files. The view mode buttons work identically.

### 7.2 Multi-Phase Files (3+ phases)

When `phases.length > 2`, the view mode controls adapt:

| View Mode | Behavior |
|-----------|----------|
| `before` | **Replaced by phase slider.** Show the phase at the slider's current index. Slider defaults to index 0. |
| `after` | **Replaced by phase slider.** Slider defaults to the last phase index. |
| `split` | Show phase N-1 on the left, phase N on the right (where N = slider position). At index 0, show only phase 0 (no left panel). |
| `overlay` | Show phase N with diff highlights. Items removed from N-1 are shown as `diff-removed` ghosts. Items added at N shown as `diff-added`. |

The **phase slider** is a new UI control (range input or step buttons) that selects the current phase index. It replaces the binary before/after toggle for multi-phase files.

### 7.3 Phase Slider Behavior

```
[0 -- Manual Baseline] ---[1 -- Digital Forms]---[2 -- Auto Validation]---[3 -- AI-Powered]
         ^
     slider position (current phase)
```

- Dragging the slider updates `currentPhaseIndex`.
- The phase label is shown below the slider.
- In `split` mode, the left panel shows `currentPhaseIndex - 1` and the right shows `currentPhaseIndex`.
- In `overlay` mode, diff is computed between `currentPhaseIndex - 1` and `currentPhaseIndex`.

---

## 8. Migration Guide for Existing Before/After JSONs

### Step-by-step migration for a sample file (e.g., `order-approval.json`):

**Step 1: Add the full phases array.** Replace the existing sub-phase `phases` array with the complete phase definition including phase0:

```json
"phases": [
  { "id": "phase0", "label": "0 -- Manual Paper Process",  "color": "#6b7280" },
  { "id": "phase1", "label": "1 -- Digitise Forms",        "color": "#3b82f6" },
  { "id": "phase2", "label": "2 -- Auto Budget Check",     "color": "#8b5cf6" },
  { "id": "phase3", "label": "3 -- Smart Routing",         "color": "#10b981" }
]
```

**Step 2: Convert node phase fields.** For each node:

| Current | Action |
|---------|--------|
| `"phase": "before"` | Change to `"phase": ["phase0"]` |
| `"phase": "before"` with no `diff` | If the node conceptually persists (e.g., Start, Gateway), consider removing the phase field entirely or using a string like `"phase0"` based on actual lifecycle |
| `"phase": "after"` | Change to the specific introduction phase: `"phase": "phase1"` or `"phase": "phase2"` etc. |
| `"phase": "after"` with `"diff": "added"` | Assign to the specific phase where this improvement is introduced |

**Step 3: Merge the two separate process flows into one.** The current schema has duplicate nodes (e.g., `b-start` and `a-start`). In the multi-phase model, a single process graph evolves:

- Keep one set of "core" nodes with no phase (always visible): start events, shared gateways, end events.
- Phase-specific nodes get the appropriate phase field.
- Remove the `b-` and `a-` prefix convention. Use descriptive IDs instead.

Example transformation:

```
BEFORE (two separate graphs):
  b-start (phase: before)  ->  b-fill-form (phase: before)  ->  b-mgr-review (phase: before)
  a-start (phase: after)   ->  a-portal (phase: after)      ->  a-auto-check (phase: after)

AFTER (single evolving graph):
  start (no phase)  ->  fill-form (phase: ["phase0"])    ->  mgr-review (no phase)
                    ->  portal (phase: "phase1")         ->  auto-check (phase: "phase2")
```

**Step 4: Convert metrics.** Rename `metrics.before` to `metrics.phase0` and `metrics.after` to `metrics.phase3` (or the final phase). Add intermediate metrics for phase1 and phase2.

**Step 5: Remove deprecated `diff` fields.** The `diff` field on nodes (`"diff": "added"`, `"diff": "removed"`) is no longer needed because diff classification is computed at runtime from the phase field. Remove these fields from nodes. The `"diff": "modified"` value may be retained as an explicit override for cases where a node changes behavior without being added or removed.

**Step 6: Update `story.phases`.** The `story.phases` array already uses `phaseRef` to link narrative phases to the top-level `phases` array. Ensure `phaseRef` values match the updated phase IDs and add a phase0 entry if the story should narrate the baseline.

**Step 7: Validate.** Load the file in the viewer and step through each phase with the slider to verify visibility, diff highlights, and connection routing are correct.

---

## 9. Schema Version Detection

```javascript
function detectSchemaVersion(graph) {
  const hasBeforeAfter = (graph.nodes || []).some(
    n => n.phase === 'before' || n.phase === 'after'
  );
  const hasPhaseArray = Array.isArray(graph.phases) && graph.phases.length > 0
    && graph.phases[0].id !== undefined;

  if (hasBeforeAfter && !hasPhaseArray) return '1.0'; // legacy binary
  if (hasBeforeAfter && hasPhaseArray)  return '1.5'; // mixed (needs migration)
  if (!hasBeforeAfter && hasPhaseArray) return '2.0'; // fully migrated
  return '1.0'; // default fallback
}
```

---

## 10. Summary of Changes from Schema v1.0

| Aspect | v1.0 (current) | v2.0 (new) |
|--------|----------------|------------|
| Phase model | Binary: `"before"` / `"after"` | N-phase: ordered array of phase objects |
| Node phase field | `"before"`, `"after"`, `"both"` | String (introduced-at), Array (visible-in), or omitted (always) |
| Diff field | Explicit in JSON: `"diff": "added"` | Computed at runtime from phase transitions |
| Metrics keys | `metrics.before`, `metrics.after` | `metrics.phase0`, `metrics.phase1`, etc. |
| View modes | before / after / split / overlay | Phase slider + split / overlay (adapted) |
| Phases array | Sub-phase dots within after view | Full phase definitions controlling visibility |
| Two separate graphs | `b-*` nodes and `a-*` nodes | Single graph that evolves across phases |
