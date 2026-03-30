# Chapter 4 — Swimlane Editing & Reassignment

> **Depends on:** Chapter 3 (editor interactions)
> **Parallel Agents:** 2
> **Files:** `js/interactions.js`, `js/layout.js`, `js/renderer.js`, `js/state.js`, `css/panels.css`

---

## Goal
Make swimlanes fully editable: create, delete, rename, reorder, type-assign,
and support dragging nodes across lanes to reassign ownership.

---

## Agent 4-A: Lane CRUD UI

### Tasks

#### 4.1 Swimlane Creation UI
Add "+" button below the last swimlane or in the toolbar:
- Click opens a mini-form: name, type (dropdown: persona/system/agent/department), color
- Creates new lane object in `state.graph.lanes`
- Re-renders with new empty lane at bottom
- Push to undo stack

```js
function addLane(name, type, color) {
  const lane = {
    id: `lane-${Date.now()}`,
    label: name || 'New Lane',
    type: type || 'department',
    color: color || '#2a4a6c',
    height: 160, // default
  };
  state.graph.lanes.push(lane);
  pushUndo('add-lane', lane);
  renderAll();
}
```

#### 4.2 Swimlane Deletion UI
- Right-click lane header → "Delete Lane"
- Only allowed if lane contains no nodes
- If lane has nodes: show warning "Move or delete N nodes first"
- Remove from `state.graph.lanes`, re-render

#### 4.3 Swimlane Renaming
- Double-click lane header label → inline text edit
- Use `<foreignObject>` with `<input>` overlaying the header text
- On blur/Enter: update `lane.label`, re-render
- Push to undo stack

#### 4.4 Swimlane Type Selection
- In lane header or via right-click → "Set Type"
- Dropdown: Persona, System, Agent, Department
- Updates `lane.type` field
- Optionally change header icon based on type:
  - Persona: 👤 icon
  - System: 🖥 icon
  - Agent: ⚡ icon
  - Department: 🏢 icon

---

## Agent 4-B: Cross-Lane Drag & Auto-Resize

### Tasks

#### 4.5 Drag Node Across Lanes → Update Owner Metadata
Currently nodes are constrained to horizontal movement only. Change to:

1. Allow full 2D drag (both X and Y) during edit mode
2. During drag, detect which lane the node center falls within
3. Highlight target lane with subtle blue overlay
4. On drop:
   - Update `node.lane` to target lane ID
   - Update `node.y` to be relative to new lane
   - If node has an `owner` field, update it to match lane assignment
   - Re-render (arrows auto-reroute)
   - Push to undo stack

```js
function findLaneAtY(absY, laneMap) {
  for (const [laneId, info] of Object.entries(laneMap)) {
    if (absY >= info.top && absY < info.top + info.height) {
      return laneId;
    }
  }
  return null;
}
```

**Key change in `interactions.js`:**
Replace the current horizontal-only drag constraint:
```js
// OLD: node.y stays fixed
// NEW: node.y updates, lane reassignment computed
```

#### 4.6 Swimlane Auto-Resize Based on Content
After any node operation (add, move, delete):
- Compute the bounding box of all nodes in each lane
- Set lane height to: max(minHeight, contentBBox.height + padding)
- Minimum lane height: 120px
- Padding: 40px top + 40px bottom

```js
function autoResizeLanes(graph, laneMap) {
  for (const lane of graph.lanes) {
    const laneNodes = graph.nodes.filter(n => n.lane === lane.id);
    if (laneNodes.length === 0) {
      lane.height = 120; // minimum
      continue;
    }
    const maxY = Math.max(...laneNodes.map(n => n.y + NODE_DIMS[n.type].h));
    lane.height = Math.max(120, maxY + 80); // 40px padding top + bottom
  }
}
```

Call after every drag-drop, node creation, and node deletion.

#### 4.7 Lane Reordering
- Click and drag lane header vertically to reorder
- Show insertion indicator line between lanes
- On drop: reorder `state.graph.lanes` array
- Node Y positions recalculated automatically
- Push to undo stack

Implementation:
- mousedown on lane header starts lane-drag mode
- Track cursor Y vs lane boundaries
- Render blue insertion line at potential drop position
- On mouseup: splice lane array, recalculate all node positions

---

## Acceptance Criteria
- [ ] "Add Lane" button creates a new swimlane with name/type form
- [ ] Empty lanes can be deleted via right-click
- [ ] Non-empty lane deletion shows warning
- [ ] Double-click lane header enables inline rename
- [ ] Lane type can be set (persona/system/agent/department) with icon
- [ ] Nodes can be dragged vertically across lane boundaries
- [ ] Dropping node in different lane updates `node.lane` and metadata
- [ ] Lanes auto-resize to fit their content
- [ ] Lane minimum height is 120px
- [ ] Lanes can be reordered by dragging headers
- [ ] All lane operations push to undo stack
- [ ] Arrows auto-reroute after cross-lane moves

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 4 is complete:

1. Click "Add Lane" — verify new lane appears with form fields
2. Create lane with type "System" — verify system icon in header
3. Double-click lane header — verify inline rename works
4. Right-click empty lane → Delete — verify lane removed
5. Right-click lane with nodes → Delete — verify warning shown
6. Drag a task node from Lane A to Lane B — verify:
   a. node.lane updated to Lane B ID
   b. node renders in Lane B
   c. arrows reroute correctly
7. Add multiple nodes to a lane — verify lane height increases
8. Remove all nodes from a lane — verify lane shrinks to minimum
9. Drag a lane header to reorder — verify lanes swap positions
10. Ctrl+Z after lane operation — verify undo works
```
