# Chapter 3 — Editor: Node & Connection Creation

> **Depends on:** Chapter 1 (rendering), Chapter 2 (connection rules)
> **Parallel Agents:** 3
> **Files:** `js/interactions.js`, `js/renderer.js`, `js/state.js`, `index.html`, `css/panels.css`

---

## Goal
Transform the app from a viewer into a full editor: users can create nodes
via drag-and-drop, draw connections port-to-port, delete elements, and
edit node properties through a panel.

---

## Agent 3-A: Node Palette & Creation

### Tasks

#### 3.1 Node Palette / Toolbar
Add a collapsible left sidebar with draggable node prototypes:

**HTML structure** (add to `index.html`):
```html
<div id="node-palette" class="palette">
  <h3>Nodes</h3>
  <div class="palette-item" data-type="task" draggable="true">
    <svg width="24" height="16"><rect rx="4" width="24" height="16"/></svg>
    <span>Task</span>
  </div>
  <div class="palette-item" data-type="gateway" draggable="true">
    <svg width="20" height="20"><polygon points="10,0 20,10 10,20 0,10"/></svg>
    <span>Decision</span>
  </div>
  <div class="palette-item" data-type="merge" draggable="true">
    <svg width="16" height="16"><circle cx="8" cy="8" r="7"/></svg>
    <span>Merge</span>
  </div>
  <div class="palette-item" data-type="process-group" draggable="true">
    <svg width="28" height="20"><rect rx="2" width="28" height="20" stroke-dasharray="4"/></svg>
    <span>Group</span>
  </div>
  <div class="palette-item" data-type="start-event" draggable="true">
    <svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="#22c55e"/></svg>
    <span>Start</span>
  </div>
  <div class="palette-item" data-type="end-event" draggable="true">
    <svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="#ef4444"/></svg>
    <span>End</span>
  </div>
  <!-- Persona, System, Agent annotation nodes -->
</div>
```

**Drag-and-drop behavior:**
1. User drags palette item over SVG canvas
2. Show ghost preview of node shape following cursor
3. On drop: determine target lane from Y position
4. Snap to 10px grid
5. Create node object with auto-generated ID, default label
6. Add to `state.graph.nodes`, re-render
7. Push to undo stack

#### 3.8 Multi-Select
- **Shift+Click:** toggle node in/out of selection set
- **Box select:** click empty canvas + drag to create selection rectangle
- Selected nodes get `selected` CSS class (blue outline)
- Operations (delete, move) apply to entire selection
- Click empty canvas to deselect all

---

## Agent 3-B: Drag-to-Connect

### Tasks

#### 3.2 Drag-to-Connect: Draw Arrow from Port to Port
The core editor interaction — drawing connections:

1. **Initiate:** mousedown on a port indicator circle (from Ch1)
2. **Drag:** render a temporary arrow from source port following cursor
   - Arrow should use same routing style as permanent arrows
   - Lighter opacity (0.5) while dragging
3. **Hover targets:** as cursor nears valid target ports, highlight them
   - Call `canConnect()` from Ch2 to filter valid targets
   - Show green glow on valid ports, red on invalid nodes
4. **Drop on valid port:** create connection object, add to graph, re-render
   - For gateway sources: auto-assign port via `assignGatewayPort()`
   - For gateway sources: prompt for branch label (or default "Yes"/"No")
5. **Drop on invalid/empty:** cancel, remove temporary arrow
6. **Push to undo stack**

```js
// In interactions.js
let connectState = null;

function startConnect(sourceNode, sourcePort, e) {
  connectState = { sourceNode, sourcePort, tempPath: null };
  // create temp SVG path element
}

function dragConnect(e) {
  if (!connectState) return;
  const svgPoint = screenToSVG(e.clientX, e.clientY);
  // update temp path endpoint to svgPoint
  // highlight nearby valid target ports
}

function endConnect(targetNode, targetPort) {
  if (!connectState) return;
  const result = canConnect(connectState.sourceNode, targetNode, state.graph.connections);
  if (result.valid) {
    const conn = {
      id: generateId(),
      from: connectState.sourceNode.id,
      to: targetNode.id,
      sourcePort: connectState.sourcePort,
      targetPort: targetPort,
      type: 'sequence',
      label: '',
    };
    // If from gateway, prompt for label
    if (connectState.sourceNode.type === 'gateway') {
      conn.decision = getNextDecisionLabel(connectState.sourceNode);
      conn.label = conn.decision;
    }
    state.graph.connections.push(conn);
    pushUndo('connect', conn);
    renderAll();
  }
  connectState = null;
  // remove temp path
}
```

#### 3.3 Valid Target Port Highlighting During Drag-to-Connect
While dragging a connection:
- Scan all nodes in the graph
- For each node, call `canConnect(source, target, connections)`
- Valid targets: show port circles with green glow + scale-up animation
- Invalid targets: dim the node (opacity: 0.3)
- Nearest valid port within 20px snaps the temp arrow endpoint

---

## Agent 3-C: Delete, Properties & Context Menu

### Tasks

#### 3.4 Node Deletion
- Select node(s), press `Delete` or `Backspace`
- Confirm if deleting > 1 node: "Delete N nodes and their connections?"
- Remove node from `state.graph.nodes`
- Remove all connections where `from` or `to` matches deleted node ID
- Push to undo stack
- Re-render

#### 3.5 Connection Deletion
- Click an arrow to select it (highlight with blue glow)
- Press `Delete` to remove
- Remove from `state.graph.connections`
- Push to undo stack

#### 3.6 Node Property Editor Panel
Right sidebar panel that shows when a node is selected:

```html
<div id="property-panel" class="panel-right">
  <h3>Properties</h3>
  <div class="prop-group">
    <label>Name</label>
    <input type="text" id="prop-name"/>
  </div>
  <div class="prop-group">
    <label>Description</label>
    <textarea id="prop-desc"></textarea>
  </div>
  <!-- Dynamic fields based on node type -->
  <div class="prop-group" data-for="task">
    <label>Duration</label>
    <input type="text" id="prop-duration"/>
    <label>Owner</label>
    <select id="prop-owner"><!-- populated from personas/systems/agents --></select>
    <label>SLA</label>
    <input type="text" id="prop-sla"/>
  </div>
  <div class="prop-group" data-for="gateway">
    <label>Condition</label>
    <input type="text" id="prop-condition"/>
    <label>Rule Set</label>
    <textarea id="prop-ruleset"></textarea>
  </div>
  <!-- etc. for each node type per rules.txt fields -->
</div>
```

Fields per node type (from rules.txt.txt):
- **Task:** name, description, duration, owner, inputs, outputs, SLA, tags
- **Process Group:** name, description, KPIs, entry criteria, exit criteria
- **Decision/Gateway:** condition, rule set, outcomes
- **Persona:** name, role, department
- **System:** name, type, integration points
- **Agent:** name, capabilities, triggers

#### 3.7 Context Menu
Right-click on node or connection:
```
┌─────────────────────┐
│ Edit Properties     │
│ Duplicate           │
│ Delete              │
│ ─────────────────── │
│ Connect From Here   │
│ Connect To Here     │
│ ─────────────────── │
│ Move to Lane ►      │
│   ├ Operations      │
│   ├ Systems         │
│   └ Management      │
└─────────────────────┘
```

Right-click on canvas:
```
┌─────────────────────┐
│ Add Task            │
│ Add Decision        │
│ Add Merge           │
│ Add Start           │
│ Add End             │
│ ─────────────────── │
│ Paste               │
│ Select All          │
└─────────────────────┘
```

---

## Acceptance Criteria
- [ ] Node palette visible in edit mode with all node types
- [ ] Drag node from palette onto canvas creates new node in correct lane
- [ ] New nodes snap to 10px grid
- [ ] Drag from port to port creates valid connection
- [ ] Invalid connections blocked with visual feedback
- [ ] Gateway connections auto-prompt for branch label
- [ ] Gateway connections auto-assign distinct ports
- [ ] Delete key removes selected nodes and their connections
- [ ] Delete key removes selected connections
- [ ] Property panel shows correct fields for each node type
- [ ] Property changes update graph data and re-render
- [ ] Context menu appears on right-click with appropriate options
- [ ] Multi-select works (Shift+click and box select)
- [ ] All operations push to undo stack

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 3 is complete:

1. Enter edit mode — verify node palette appears
2. Drag a Task from palette to canvas — verify node created in correct lane
3. Drag from task port to another task port — verify connection created
4. Try to connect start-event to end-event — verify blocked with red highlight
5. Delete a node — verify node and its connections removed
6. Select a connection, press Delete — verify removed
7. Click a task node — verify property panel shows task-specific fields
8. Edit name in property panel — verify label updates on canvas
9. Right-click node — verify context menu appears
10. Shift+click two nodes — verify both selected (blue outlines)
11. Ctrl+Z — verify last operation undone
```
