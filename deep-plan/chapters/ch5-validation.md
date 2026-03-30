# Chapter 5 — Validation Engine

> **Depends on:** Chapter 0 (data model), Chapter 2 (connection rules)
> **Parallel Agents:** 2
> **Files:** new `js/validation.js`, `js/renderer.js`, `js/state.js`, `css/widgets.css`, `index.html`

---

## Goal
Implement the complete validation rule set from rules.txt.txt, with a
validation UI panel that surfaces errors and warnings before save/publish.

---

## Agent 5-A: Graph Validation Rules

### Tasks

Create new file `js/validation.js` with a `validateGraph(graph)` function
that returns an array of issues:

```js
function validateGraph(graph) {
  const issues = []; // { severity: 'error'|'warning', nodeId?, message }

  // Run all checks
  issues.push(...checkStartNode(graph));
  issues.push(...checkEndNode(graph));
  issues.push(...checkDanglingArrows(graph));
  issues.push(...checkDecisionBranches(graph));
  issues.push(...checkCycles(graph));
  issues.push(...checkSwimlaneAssignment(graph));
  issues.push(...checkOrphanedNodes(graph));
  issues.push(...checkDecisionLabels(graph));
  issues.push(...checkDecisionCardinality(graph));
  issues.push(...checkDistinctPorts(graph));

  return issues;
}
```

#### 5.1 Exactly One Start Node
```js
function checkStartNode(graph) {
  const starts = graph.nodes.filter(n => n.type === 'start-event');
  if (starts.length === 0) return [{ severity: 'error', message: 'Process must have exactly one Start node' }];
  if (starts.length > 1) return [{ severity: 'error', message: `Found ${starts.length} Start nodes — only one allowed`, nodeId: starts[1].id }];
  // Start cannot have incoming arrows
  const incoming = graph.connections.filter(c => c.to === starts[0].id);
  if (incoming.length > 0) return [{ severity: 'error', nodeId: starts[0].id, message: 'Start node cannot have incoming arrows' }];
  return [];
}
```

#### 5.2 At Least One End Node
```js
function checkEndNode(graph) {
  const ends = graph.nodes.filter(n => n.type === 'end-event');
  if (ends.length === 0) return [{ severity: 'error', message: 'Process must have at least one End node' }];
  // End cannot have outgoing arrows
  const issues = [];
  for (const end of ends) {
    const outgoing = graph.connections.filter(c => c.from === end.id);
    if (outgoing.length > 0) issues.push({ severity: 'error', nodeId: end.id, message: 'End node cannot have outgoing arrows' });
  }
  return issues;
}
```

#### 5.3 No Dangling Arrows
```js
function checkDanglingArrows(graph) {
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  return graph.connections
    .filter(c => !nodeIds.has(c.from) || !nodeIds.has(c.to))
    .map(c => ({ severity: 'error', message: `Arrow ${c.id} references non-existent node` }));
}
```

#### 5.4 All Decision Branches Must Reconnect
Check that every outgoing path from a gateway eventually reaches a merge node,
an end node, or reconverges with another branch:

```js
function checkDecisionBranches(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');
  for (const gw of gateways) {
    const outgoing = graph.connections.filter(c => c.from === gw.id);
    // BFS from each branch — all must reach a merge, end, or common node
    const branchEndpoints = outgoing.map(c => findTerminalNodes(graph, c.to, new Set()));
    // Check that branches converge
    // (At minimum: each branch reaches an end-event or merge)
    for (let i = 0; i < branchEndpoints.length; i++) {
      if (branchEndpoints[i].length === 0) {
        issues.push({
          severity: 'error',
          nodeId: gw.id,
          message: `Decision branch "${outgoing[i].label || i+1}" dead-ends without reaching End or Merge`
        });
      }
    }
  }
  return issues;
}
```

#### 5.5 Cycle Detection
Implement Depth-First Search cycle detection:

```js
function checkCycles(graph) {
  if (state.loopModeEnabled) return []; // skip if loop mode on

  const adj = buildAdjacencyList(graph);
  const visited = new Set();
  const inStack = new Set();
  const issues = [];

  function dfs(nodeId) {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of (adj[nodeId] || [])) {
      if (inStack.has(neighbor)) {
        issues.push({
          severity: 'error',
          nodeId: neighbor,
          message: `Cycle detected involving node "${getNodeLabel(graph, neighbor)}"`
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
```

#### 5.6 All Tasks Must Belong to a Swimlane
```js
function checkSwimlaneAssignment(graph) {
  const laneIds = new Set(graph.lanes.map(l => l.id));
  return graph.nodes
    .filter(n => ['task','subprocess','process-group'].includes(n.type))
    .filter(n => !n.lane || !laneIds.has(n.lane))
    .map(n => ({ severity: 'error', nodeId: n.id, message: `Task "${n.label}" is not assigned to a valid swimlane` }));
}
```

#### 5.7 No Orphaned Nodes
```js
function checkOrphanedNodes(graph) {
  // BFS from start node — all non-annotation nodes must be reachable
  const start = graph.nodes.find(n => n.type === 'start-event');
  if (!start) return []; // caught by 5.1

  const reachable = new Set();
  const queue = [start.id];
  const adj = buildBidirectionalAdjList(graph); // both directions

  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const neighbor of (adj[id] || [])) queue.push(neighbor);
  }

  const annotationTypes = ['persona', 'system', 'agent', 'annotation'];
  return graph.nodes
    .filter(n => !annotationTypes.includes(n.type))
    .filter(n => !reachable.has(n.id))
    .map(n => ({ severity: 'warning', nodeId: n.id, message: `Node "${n.label}" is not connected to the process flow` }));
}
```

#### 5.8 No Unlabelled Decision Branches
```js
function checkDecisionLabels(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');
  for (const gw of gateways) {
    const outgoing = graph.connections.filter(c => c.from === gw.id);
    for (const conn of outgoing) {
      if (!conn.label && !conn.decision) {
        issues.push({
          severity: 'error',
          nodeId: gw.id,
          message: `Decision "${gw.label}" has an unlabelled branch`
        });
      }
    }
  }
  return issues;
}
```

#### 5.9 Decision Node: Exactly 1 Incoming, 2-5 Outgoing
```js
function checkDecisionCardinality(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');
  for (const gw of gateways) {
    const inCount = graph.connections.filter(c => c.to === gw.id).length;
    const outCount = graph.connections.filter(c => c.from === gw.id).length;
    if (inCount !== 1) issues.push({ severity: 'error', nodeId: gw.id, message: `Decision "${gw.label}" must have exactly 1 incoming arrow (has ${inCount})` });
    if (outCount < 2) issues.push({ severity: 'error', nodeId: gw.id, message: `Decision "${gw.label}" must have at least 2 outgoing branches (has ${outCount})` });
    if (outCount > 5) issues.push({ severity: 'error', nodeId: gw.id, message: `Decision "${gw.label}" cannot have more than 5 outgoing branches (has ${outCount})` });
  }
  return issues;
}
```

#### 5.10 All Outgoing Arrows from Distinct Ports
```js
function checkDistinctPorts(graph) {
  const issues = [];
  const gateways = graph.nodes.filter(n => n.type === 'gateway');
  for (const gw of gateways) {
    const outgoing = graph.connections.filter(c => c.from === gw.id);
    const ports = outgoing.map(c => c.sourcePort).filter(Boolean);
    const unique = new Set(ports);
    if (ports.length !== unique.size) {
      issues.push({ severity: 'error', nodeId: gw.id, message: `Decision "${gw.label}" has multiple branches sharing the same port` });
    }
  }
  return issues;
}
```

#### 5.12 Loop Mode Toggle
Add state flag and UI toggle:
```js
// state.js
state.loopModeEnabled = false;
```
Add toggle button in toolbar. When enabled, cycle detection (5.5) is skipped.

---

## Agent 5-B: Validation UI Panel

### Tasks

#### 5.11 Validation UI Panel
Add a validation results panel accessible from toolbar:

**Button in header:**
```html
<button id="btn-validate" title="Validate process">✓ Validate</button>
```

**Panel:**
```html
<div id="validation-panel" class="panel-bottom">
  <div class="validation-header">
    <span class="validation-title">Validation Results</span>
    <span id="validation-count" class="badge">0 issues</span>
    <button id="btn-close-validation">×</button>
  </div>
  <ul id="validation-list"></ul>
</div>
```

**Behavior:**
1. Click "Validate" button → run `validateGraph()` → populate panel
2. Each issue is a clickable list item:
   - Error icon (🔴) or warning icon (🟡)
   - Message text
   - Click → pan to and highlight the offending node
3. Nodes with issues get warning overlay icon (⚠️) rendered on their SVG group
4. Issue count badge updates in real-time
5. Auto-validate on save attempt — block save if errors exist

**CSS** in `widgets.css`:
```css
.validation-issue {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.validation-issue:hover { background: var(--bg-hover); }
.validation-issue.error .icon { color: #ef4444; }
.validation-issue.warning .icon { color: #f59e0b; }
```

**Node warning indicators:**
- After validation, nodes with issues get a small ⚠️ badge at top-right
- Badge is an SVG `<g>` with yellow triangle + "!" text
- Hovering badge shows tooltip with first issue message

---

## Acceptance Criteria
- [ ] `validateGraph()` catches: missing Start, missing End, dangling arrows
- [ ] Cycle detection works (DFS) and is skipped in loop mode
- [ ] Decision cardinality validated (1 in, 2-5 out)
- [ ] Decision labels required on all branches
- [ ] Decision ports must be distinct
- [ ] Orphaned nodes detected
- [ ] All tasks assigned to valid swimlane
- [ ] Decision branches must converge
- [ ] Validation panel shows clickable issue list
- [ ] Clicking issue pans to and highlights the node
- [ ] Nodes with issues show ⚠️ badge
- [ ] Loop mode toggle disables cycle checking
- [ ] Save blocked when errors exist (warnings allow save)

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 5 is complete:

1. Create a graph with no Start node — validate — expect error
2. Create a graph with 2 Start nodes — validate — expect error
3. Create a graph with no End node — validate — expect error
4. Create a dangling arrow (to non-existent node) — expect error
5. Create a cycle (A→B→C→A) — expect error
6. Enable loop mode, validate same cycle — expect no error
7. Create a decision with 1 outgoing branch — expect error
8. Create a decision with 6 outgoing branches — expect error
9. Create a decision branch with no label — expect error
10. Create an orphaned node — expect warning
11. Click an issue in validation panel — expect canvas pans to node
12. Verify warning badges appear on problem nodes
```
