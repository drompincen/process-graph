# Chapter 0 — Data Model & Port System Foundation

> **Priority:** CRITICAL — all other chapters depend on this
> **Parallel Agents:** 2
> **Files:** `js/constants.js`, `js/state.js`, `js/data.js`, sample JSONs

---

## Goal
Extend the data model to support all node types, explicit port definitions,
connection matrix rules, and swimlane types required by `rules.txt.txt`.

---

## Agent 0-A: Node Types & Port Model

### Tasks

#### 0.1 Define Port Model
Add to `constants.js`:
```js
const PORT_DEFS = {
  'task':        { in: ['top'], out: ['right'], maxIn: 1, maxOut: 1 },
  'gateway':     { in: ['top'], out: ['left','right','bottom'], maxIn: 1, maxOut: 5, minOut: 2 },
  'merge':       { in: ['top','left','right'], out: ['bottom'], maxIn: 10, maxOut: 1 },
  'start-event': { in: [],      out: ['right'], maxIn: 0, maxOut: 1 },
  'end-event':   { in: ['top','left'], out: [], maxIn: 10, maxOut: 0 },
  'subprocess':  { in: ['top'], out: ['right'], maxIn: 1, maxOut: 1 },
  'process-group': { in: ['left'], out: ['right'], maxIn: 1, maxOut: 1 },
  'persona':     { in: [], out: [], maxIn: 0, maxOut: 0 },  // annotation only
  'system':      { in: [], out: [], maxIn: 0, maxOut: 0 },  // annotation only
  'agent':       { in: [], out: [], maxIn: 0, maxOut: 0 },  // annotation only
};
```

Each port should resolve to a pixel offset relative to the node center
at render time (computed by `layout.js`).

#### 0.2 Add Merge Node Type
In `constants.js` NODE_DIMS, add:
```js
'merge': { w: 30, h: 30 }  // small circle
```
In `data.js` validateGraph, accept `type: 'merge'`.

#### 0.3 Add Process Group Node Type
```js
'process-group': { w: 300, h: 200, headerH: 36 }
```
Process Group is a container. Its JSON should include a `children: [nodeId, ...]`
array referencing contained node IDs. Add `nestingLevel` computed property.

#### 0.7 Update Sample JSONs
Add at least one sample JSON (`sample/decision-flow.json`) that exercises:
- Gateway with 3 branches
- Merge node converging those branches
- Process Group containing 2 tasks
- Cross-lane handoff

---

## Agent 0-B: Connection Matrix & Schema

### Tasks

#### 0.4 Define Connection Matrix
In `constants.js`:
```js
const CONNECTION_MATRIX = {
  'start-event':   ['task', 'gateway', 'process-group'],
  'task':          ['task', 'gateway', 'process-group', 'merge', 'end-event'],
  'gateway':       ['task', 'process-group', 'merge', 'end-event'],
  'merge':         ['task', 'process-group', 'gateway', 'end-event'],
  'process-group': ['task', 'gateway', 'merge', 'end-event'],
  'subprocess':    ['task', 'gateway', 'merge', 'end-event'],
  // Annotation-only types cannot connect
  'persona': [], 'system': [], 'agent': [],
  'end-event': [],  // cannot have outgoing
};

// Configurable: allow gateway→gateway
const ALLOW_DECISION_TO_DECISION = false;
```

Add `isValidConnection(fromType, toType)` function in `data.js`.

#### 0.5 Add Swimlane Type Field
Extend lane schema:
```json
{
  "id": "lane-1",
  "label": "Operations",
  "type": "department",   // NEW: persona | system | agent | department
  "color": "#1a3a5c",
  "height": 160
}
```
Update `data.js` validation to accept and default the `type` field.

#### 0.6 JSON Schema Documentation
Create `deep-plan/schema.json` — a JSON Schema (draft-07) formally defining
the graph data model including:
- Node object (all types, all fields per rules.txt)
- Connection object (from, to, type, label, phase, decision)
- Lane object (with type field)
- Metrics block
- Port references

---

## Acceptance Criteria
- [ ] All 10 node types defined in constants with port configs
- [ ] `isValidConnection()` returns correct results for all matrix pairs
- [ ] Merge node accepted by parser without errors
- [ ] Process Group accepted with children array
- [ ] Lane type field parsed and defaulted
- [ ] At least one sample JSON exercises new types
- [ ] Existing sample JSONs still load without errors (backward compat)

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 0 is complete, run these checks:

1. Load every JSON in /sample/ — none should throw parse errors
2. Confirm PORT_DEFS exists in constants.js for all 10 node types
3. Confirm CONNECTION_MATRIX exists and covers all 10 types
4. Call isValidConnection('gateway','gateway') — expect false (default config)
5. Call isValidConnection('task','gateway') — expect true
6. Call isValidConnection('start-event','end-event') — expect false
7. Confirm 'merge' and 'process-group' in NODE_DIMS
8. Confirm lane objects in sample JSON have 'type' field
```
