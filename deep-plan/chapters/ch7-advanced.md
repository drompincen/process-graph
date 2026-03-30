# Chapter 7 — Advanced Features & Polish

> **Depends on:** Chapters 3-6 (full editor functional)
> **Parallel Agents:** 3
> **Files:** new `js/versioning.js`, new `js/comments.js`, `js/animation.js`, `js/state.js`, `js/renderer.js`, `index.html`

---

## Goal
Implement the optional advanced features from rules.txt.txt Section 8:
versioning, commenting, KPI overlays, time simulation, agent-based simulation,
plus remaining enforcement rules.

---

## Agent 7-A: Versioning & Undo Expansion

### Tasks

#### 7.1 Undo/Redo Expansion
Current undo only covers drag and label edits. Expand to cover all operations:

**Operations to track:**
- Node create / delete
- Connection create / delete
- Node property changes
- Lane create / delete / rename / reorder
- Node lane reassignment
- Auto-layout (batch position change)

**Implementation — Command Pattern:**
```js
// Each undoable operation is a command object:
const command = {
  type: 'node-create',        // operation type
  data: { ...nodeSnapshot },  // data to restore
  undo: () => { /* reverse the operation */ },
  redo: () => { /* re-apply the operation */ },
};

// In state.js:
state.undoStack = [];  // already exists
state.redoStack = [];  // NEW

function pushUndo(command) {
  state.undoStack.push(command);
  state.redoStack = []; // clear redo on new action
  if (state.undoStack.length > 50) state.undoStack.shift(); // limit
}

function undo() {
  const cmd = state.undoStack.pop();
  if (!cmd) return;
  cmd.undo();
  state.redoStack.push(cmd);
  renderAll();
}

function redo() {
  const cmd = state.redoStack.pop();
  if (!cmd) return;
  cmd.redo();
  state.undoStack.push(cmd);
  renderAll();
}
```

Bind: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo.

#### 7.2 Versioning: Save/Restore Named Snapshots
Create `js/versioning.js`:

```js
const versionStore = {
  versions: [], // { name, timestamp, snapshot (deep clone of graph) }

  save(name) {
    this.versions.push({
      name: name || `v${this.versions.length + 1}`,
      timestamp: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(state.graph)),
    });
  },

  restore(index) {
    pushUndo(createFullSnapshotCommand()); // allow undo of restore
    state.graph = JSON.parse(JSON.stringify(this.versions[index].snapshot));
    renderAll();
  },

  list() { return this.versions.map((v, i) => ({ index: i, name: v.name, timestamp: v.timestamp })); },
};
```

**UI — Version Panel:**
```html
<div id="version-panel" class="panel-right">
  <h3>Versions</h3>
  <button id="btn-save-version">Save Version</button>
  <ul id="version-list">
    <!-- populated dynamically -->
    <!-- each item: name, timestamp, "Restore" button -->
  </ul>
</div>
```

Versions stored in-memory (localStorage optional for persistence across sessions).

---

## Agent 7-B: Comments & KPI Overlays

### Tasks

#### 7.3 Commenting System
Create `js/comments.js`:

**Data model:**
```js
// Add to graph JSON:
"comments": [
  {
    "id": "comment-1",
    "nodeId": "task-1",       // which node
    "author": "User",
    "text": "Need to verify SLA here",
    "timestamp": "2026-03-26T10:00:00Z",
    "resolved": false
  }
]
```

**UI — Comment Thread:**
- Click comment icon (💬) on node → opens comment thread popover
- Popover shows existing comments + input field for new comment
- Comment count badge on node (small blue circle with number)
- Resolved comments collapse/hide

**Rendering:**
- Nodes with comments get a small 💬 badge at top-left
- Badge shows unresolved comment count
- In SVG: `<g class="comment-badge">` with circle + text

#### 7.4 KPI Overlays on Diagram Nodes
Display KPI metrics directly on diagram nodes as overlays:

**Data model:**
```js
// In node definition:
"kpis": {
  "duration": "2h",
  "errorRate": "3%",
  "cost": "$45"
}
```

**Toggle:**
- "KPI Overlay" button in toolbar (toggle on/off)
- When on: show small KPI pills below each node
- Pills styled as compact badges: `⏱ 2h` `⚠ 3%` `💰 $45`
- Color-coded: green for good, amber for warning, red for bad (thresholds configurable)

**Rendering:**
```js
function renderKPIOverlay(nodeG, node) {
  if (!state.showKPIOverlay || !node.kpis) return;
  const overlay = createSVGGroup('kpi-overlay');
  let offsetX = 0;
  for (const [key, value] of Object.entries(node.kpis)) {
    // render pill: icon + value
    const pill = renderKPIPill(key, value, offsetX);
    overlay.appendChild(pill);
    offsetX += pill.getBBox().width + 4;
  }
  nodeG.appendChild(overlay);
}
```

---

## Agent 7-C: Simulation Modes & Remaining Rules

### Tasks

#### 7.5 Time/Duration Simulation Mode
Extend existing animation engine to include time-based simulation:

**Concept:**
- Each task node has a `duration` property (in minutes/hours)
- Simulation shows a clock advancing as tokens flow through the process
- Tokens pause at each task for the configured duration (scaled)
- Decision branches are randomly selected (or user-configured probability)
- Total process time displayed at end

**UI:**
- "Time Sim" button alongside existing "Simulate" button
- Speed slider: 1x, 2x, 5x, 10x
- Running clock display in toolbar
- At completion: summary popup with total time, bottleneck identification

**Implementation:**
```js
function runTimedSimulation(graph, speed = 1) {
  const simState = {
    currentNodeId: findStart(graph).id,
    elapsedTime: 0,
    path: [],
    clock: 0,
  };

  function step() {
    const node = graph.nodes.find(n => n.id === simState.currentNodeId);
    const duration = parseDuration(node.duration || '0m');
    simState.elapsedTime += duration;
    simState.path.push({ nodeId: node.id, arrivedAt: simState.clock, duration });
    simState.clock += duration;

    // Animate token at this node for (duration / speed) real ms
    animateTokenAtNode(node, duration / speed, () => {
      const next = getNextNode(graph, node);
      if (!next || node.type === 'end-event') {
        showSimulationSummary(simState);
        return;
      }
      simState.currentNodeId = next.id;
      step();
    });
  }

  step();
}
```

#### 7.6 Agent-Based Simulation
Multi-token simulation where multiple "cases" flow through the process simultaneously:

- Spawn N tokens (configurable: 1-100) at intervals
- Each token follows the process independently
- Decision branches resolved by probability weights
- Track: throughput, queue buildup at tasks, bottlenecks
- Visual: multiple colored tokens flowing simultaneously
- Summary: average time, P50/P90/P99, utilization per task

#### 7.7 JSON Schema File
Create `deep-plan/schema.json` (or `schema/process-graph.schema.json`):
- JSON Schema draft-07 format
- Defines all node types with their required/optional fields
- Defines connection types
- Defines lane structure
- Defines metrics block
- Can be used for import validation

#### 7.8 Process Group Nesting Limit
Enforce maximum 3 levels of process group nesting:
```js
function checkNestingDepth(graph) {
  function getDepth(nodeId, depth = 0) {
    const parent = graph.nodes.find(n =>
      n.type === 'process-group' && n.children?.includes(nodeId)
    );
    if (!parent) return depth;
    return getDepth(parent.id, depth + 1);
  }

  for (const node of graph.nodes.filter(n => n.type === 'process-group')) {
    if (getDepth(node.id) >= 3) {
      return { valid: false, nodeId: node.id, message: 'Process groups cannot nest more than 3 levels deep' };
    }
  }
}
```

#### 7.9 Decision-to-Decision Connection Config Toggle
Add configuration option to allow/disallow gateway→gateway connections:
```js
// In state.js or a config panel:
state.config = {
  allowDecisionToDecision: false, // default per rules.txt
};
```

UI: Settings panel toggle or config JSON field.
When changed, re-validate existing connections.

---

## Acceptance Criteria
- [ ] Undo/redo works for all operation types (create, delete, connect, lane ops)
- [ ] Redo stack clears on new action
- [ ] Named versions can be saved and restored
- [ ] Version list shows name + timestamp
- [ ] Comments can be added to any node
- [ ] Comment badge shows on nodes with comments
- [ ] Comment thread popover works
- [ ] KPI overlays toggle on/off
- [ ] KPI pills render below nodes with data
- [ ] Time simulation runs with duration-based pacing
- [ ] Simulation summary shows total time and bottlenecks
- [ ] Agent-based simulation runs multiple tokens
- [ ] JSON Schema file validates sample data
- [ ] Process group nesting blocked at 3 levels
- [ ] Decision-to-decision toggle configurable

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 7 is complete:

1. Create node, delete node, undo, redo — verify full cycle works
2. Create connection, undo — verify connection removed
3. Save version "v1" — make changes — save "v2" — restore "v1" — verify state
4. Add comment to task node — verify badge appears with count
5. Open comment thread — verify existing comments shown
6. Toggle KPI overlay — verify pills appear/disappear on nodes with KPI data
7. Run time simulation — verify clock advances, tokens pause at tasks
8. Run agent simulation with 10 tokens — verify multiple tokens visible
9. Nest process groups 3 deep — verify allowed
10. Nest process groups 4 deep — verify blocked
11. Toggle decision-to-decision config — verify connection rules update
12. Validate sample JSON against schema file — verify passes
```
