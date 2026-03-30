# Archviz Phase Model Research

Research of `/mnt/c/Users/drom/IdeaProjects/archviz` multi-phase progressive architecture visualization.

## Phase Visibility Algorithm

### Core function: `isVisibleInPhase(item)` in `js/core-data.js`

```
function isVisibleInPhase(item):
    if selectedPhase == Infinity:    // no phases defined
        return true
    if item.phase is undefined:      // no phase tag = always visible
        return true

    if item.phase is Array:
        // ARRAY MODE: visible ONLY when the current phase is in the list
        currentPhaseId = graph.phases[selectedPhase].id
        return currentPhaseId IN item.phase

    if item.phase is String:
        // STRING MODE (legacy): visible from this phase ONWARD
        idx = indexOf(item.phase in graph.phases)
        return idx >= 0 AND idx <= selectedPhase
```

Key distinction:
- `"phase": "mobile"` (string) = visible at phase index 1 and ALL later phases (cumulative)
- `"phase": ["legacy", "mobile"]` (array) = visible ONLY at legacy and mobile phases, NOT at later phases

### What gets filtered

The same `isVisibleInPhase()` is applied uniformly to:
- **Nodes** -- `rendering.js:189` filters before creating DOM elements
- **Zones** -- `rendering.js:169` filters before creating zone divs
- **Connections** -- `rendering.js:39` filters before drawing SVG paths
- **Sequence steps** -- `core-data.js:94` filters the active animation sequence
- **Flows** -- `isFlowVisibleInPhase()` checks if the flow's `phases` array contains the current phase, or falls back to checking if any steps are visible

### Flow-level phase visibility: `isFlowVisibleInPhase(flow)`

```
function isFlowVisibleInPhase(flow):
    if flow.phases exists:
        return currentPhaseId IN flow.phases
    else:
        return any step in flow.sequence passes isVisibleInPhase()
```

Flows have their own `phases` array (e.g., `"phases": ["mobile"]`) that controls when they appear in the flow dropdown -- independent of step-level phase tags.

### Helper: `itemBelongsToPhase(item, phaseId)`

Returns true if the item is specifically tagged for the given phase (array or string match). Used by narrative view to find "new in this phase" nodes for highlight/glow.

## State Model

From `js/state.js`:

```js
selectedPhase: Infinity  // default = show everything (no phase filtering)
```

When phases are defined in JSON, `selectedPhase` is clamped to `graph.phases.length - 1` (last phase) on initial render. The user clicks dots to select a specific phase index.

## Phase Dots UI

### HTML structure (from `collab-animation.html`)

```html
<div class="controls-group phase-controls" id="phase-controls" style="display:none;">
    <label>Phase:</label>
    <div class="phase-dots" id="phase-dots"></div>
    <span id="phase-label-display">All</span>
</div>
```

The phase-controls div is hidden by default (`display:none`) and shown only when the JSON defines a `phases` array.

### Dot rendering (from `rendering.js:updatePhaseDots`)

```
for each phase at index idx:
    create <span class="phase-dot">
    if idx <= selectedPhase:  add class "reached"
    if idx == selectedPhase:  add class "active"
    set data-phase-idx = idx
    set title = phase.label || phase.id
```

All dots up to the selected phase get the `reached` class (filled color). The selected dot additionally gets `active` (scaled up with glow).

### Dot click handler (from `ui-interactions.js`)

```
on click .phase-dot:
    selectedPhase = parseInt(dot.data-phase-idx)
    update phase label display
    resetAnimation()
    render()   // full re-render: filters nodes/zones/connections/flows
```

### CSS styling (from `css/core.css`)

```css
.phase-dots         { display: flex; align-items: center; }
.phase-dot          { width: 14px; height: 14px; border-radius: 50%;
                      background: #555; cursor: pointer; transition: ... }
.phase-dot + .phase-dot::before  { /* connecting line between dots */ }
.phase-dot.reached  { background: var(--highlight); }
.phase-dot.active   { transform: scale(1.3); box-shadow: 0 0 8px var(--highlight); }
```

The dots are connected by `::before` pseudo-elements that form a timeline bar. Reached segments are highlighted.

## Flow Dropdown Auto-Sync

When a user selects a flow from the dropdown (`ui-interactions.js:182-231`):

1. If the flow has an explicit `phases` array and the current phase is NOT in that array, the phase auto-jumps to the first phase in the flow's range.
2. If the flow has no explicit phases, it scans all sequence steps for the maximum phase index needed and jumps there.
3. After phase sync, it calls `resolveActiveSequence()` which filters steps by `isVisibleInPhase()`.

## JSON Schema Examples

### Phases definition (top-level)

```json
"phases": [
    { "id": "legacy",    "label": "0 -- Legacy (Today)" },
    { "id": "mobile",    "label": "1 -- Mobile Ordering" },
    { "id": "credits",   "label": "2 -- Credits & Loyalty" },
    { "id": "analytics", "label": "3 -- Analytics & AI" }
]
```

### Node with string phase (cumulative -- appears from this phase onward)

```json
{ "id": "api-gw", "type": "gateway", "label": "API\nGateway",
  "x": 430, "y": 100, "w": 130, "h": 85,
  "phase": "mobile" }
```

### Node with array phase (selective -- appears ONLY at listed phases)

```json
{ "id": "card-terminal", "type": "service", "label": "Card\nTerminal",
  "x": 170, "y": 200, "w": 130, "h": 70,
  "phase": ["legacy", "mobile"] }
```

This means the card terminal appears at legacy and mobile, but disappears at credits and analytics.

### Node with no phase (always visible)

```json
{ "id": "walk-in", "type": "human", "label": "Walk-in\nCustomer",
  "x": 30, "y": 80, "w": 120, "h": 75 }
```

### Zone with phase

```json
{ "id": "cloud", "type": "cloud", "label": "AWS Cloud",
  "x": 370, "y": 10, "w": 780, "h": 620,
  "phase": "mobile" }
```

### Connection with phase

```json
{ "from": "cashier", "to": "card-terminal", "phase": ["legacy", "mobile"] },
{ "from": "mobile-customer", "to": "api-gw", "phase": "mobile" }
```

### Flow with explicit phase list

```json
{
    "id": "mobile-order",
    "name": "Phase 1 -- Mobile Order Ahead",
    "phases": ["mobile"],
    "sequence": [
        { "from": "mobile-customer", "to": "api-gw", "text": "POST /orders", "phase": "mobile" },
        ...
    ]
}
```

## Diff Highlighting Between Phases

There is NO explicit diff highlighting in archviz. When the user clicks a different phase dot:

1. The entire diagram re-renders from scratch via `render()`.
2. Nodes/zones/connections that don't pass `isVisibleInPhase()` are simply not created in the DOM.
3. There is no transition animation, fade-in/out, or "new in this phase" styling.

The only highlight mechanism is the **narrative glow**: when viewing a story phase slide and clicking "View Architecture", nodes belonging to that phase get a 3-second `narr-glow` class. But this is story-mode specific, not a general phase-diff feature.

## Narrative/Story Mode (Bonus Feature)

The archviz has a full story mode (`narrative.js`) that builds slides from a `story` object in the JSON:

- Slide 1: Problem (headline, impact metric, risks, evidence)
- Slide 2: Vision (summary, KPI targets, acceptance criteria)
- Slides 3+: One per phase (description, idea cards, expected KPI impacts)

Each phase slide has a "View Architecture" button that switches to the diagram view at that phase with node glow. A "Back To Story" button returns to the slide.

KPI values are computed cumulatively by summing `expectedKpiImpacts` from all non-rejected idea cards in phases up to the selected phase.

## Key Patterns to Reuse for process-graph

### 1. Dual-mode phase tagging

The string-vs-array distinction is elegant:
- String = "this appears from phase X onward" (additive/cumulative model)
- Array = "this appears ONLY at these specific phases" (selective model)
- Absent = always visible

This handles both "legacy things that go away" (array) and "new things that persist" (string).

### 2. Single filter function for all entity types

One `isVisibleInPhase()` function handles nodes, zones, connections, and sequence steps uniformly. No separate logic per entity type.

### 3. Phase as an index into an ordered array

Phases are an ordered array. The `selectedPhase` is just an integer index. The "from this phase onward" logic is a simple `<=` comparison on indices. No need for complex ordering metadata.

### 4. Re-render on phase change

Phase changes trigger a complete re-render (DOM rebuild), not incremental show/hide. This keeps the code simple -- no need to track what changed between phases.

### 5. Flow-phase auto-sync

When a user selects a flow, the phase automatically jumps to the appropriate phase for that flow. This prevents confusion of selecting a flow whose nodes aren't visible.

### 6. Phase dots with "reached" state

The visual shows all phases up to the current one as "reached" (filled), creating a progress-bar effect. This communicates that earlier phases are included (for string-mode phases).

## File Inventory

| File | Role |
|------|------|
| `js/core-data.js` | `isVisibleInPhase()`, `isFlowVisibleInPhase()`, `itemBelongsToPhase()`, `resolveActiveSequence()` |
| `js/rendering.js` | `render()` main loop that filters and creates DOM, `updatePhaseDots()` |
| `js/state.js` | `selectedPhase` state variable (Infinity = show all) |
| `js/ui-interactions.js` | Phase dot click handler, flow dropdown auto-sync |
| `js/narrative.js` | Story mode slides, phase sync, KPI computation |
| `js/benefits.js` | Benefits panel filtered by phase |
| `css/core.css` | Phase dot styling (`.phase-dot`, `.reached`, `.active`) |
| `json/coffee-shop-transformation.json` | Reference JSON showing all phase patterns |
