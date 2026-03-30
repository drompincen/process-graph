# Agent Prompts — Copy-Paste for Multi-Agent Execution

> Each chapter has 2-3 agents that can run in parallel within the chapter.
> Chapters must run in dependency order (see README.md).

---

## PHASE 1: Foundation

### Agent 0-A: Node Types & Port Model
```
You are implementing Chapter 0 tasks 0.1, 0.2, 0.3, 0.7 for the process-graph project at /mnt/c/Users/drom/IdeaProjects/process-graph/.

Read deep-plan/chapters/ch0-data-model.md for full specs.

Your tasks:
1. Add PORT_DEFS to js/constants.js defining port configurations for all 10 node types
2. Add Merge node type (w:30, h:30) to NODE_DIMS in constants.js
3. Add Process Group node type (w:300, h:200, headerH:36) with children array support
4. Update js/data.js validateGraph to accept merge and process-group types
5. Create sample/decision-flow.json exercising gateway+merge+process-group+cross-lane

Read existing files before modifying. Maintain backward compatibility with existing samples.
```

### Agent 0-B: Connection Matrix & Schema
```
You are implementing Chapter 0 tasks 0.4, 0.5, 0.6 for the process-graph project at /mnt/c/Users/drom/IdeaProjects/process-graph/.

Read deep-plan/chapters/ch0-data-model.md for full specs.

Your tasks:
1. Add CONNECTION_MATRIX object to js/constants.js defining valid from→to type pairs
2. Add ALLOW_DECISION_TO_DECISION config flag (default false)
3. Add isValidConnection(fromType, toType) function to js/data.js
4. Add swimlane 'type' field support (persona/system/agent/department) in data.js validation
5. Create deep-plan/schema.json — JSON Schema draft-07 for the graph data model

Read existing files before modifying. Do not break existing functionality.
```

---

## PHASE 2: Rendering + Connections (parallel)

### Agent 1-A: New Shape Rendering
```
You are implementing Chapter 1 tasks 1.1, 1.2, 1.7 for the process-graph project.

Read deep-plan/chapters/ch1-rendering.md for full specs. Read js/renderer.js to understand existing patterns.

Your tasks:
1. Add merge node rendering (small circle r=15) to renderer.js
2. Add process-group container rendering (header bar + collapsible body) to renderer.js
3. Add collapse/expand toggle for process groups
4. Add CSS classes for new shapes in css/diagram.css

Follow existing renderer.js patterns for SVG element creation and styling.
```

### Agent 1-B: Port Visuals & Decision Geometry
```
You are implementing Chapter 1 tasks 1.3, 1.4, 1.5, 1.6 for the process-graph project.

Read deep-plan/chapters/ch1-rendering.md for full specs. Read js/renderer.js and js/routing.js.

Your tasks:
1. Render port anchor circles on hover/select for all connectable node types
2. Implement distinct port geometry for gateway (top=in, L/R/bottom=out)
3. Add visible port indicators (r=4 circles, blue=available, gray=occupied)
4. Enforce 20° minimum angular separation for gateway outgoing arrows in routing.js

Use PORT_DEFS from constants.js (added in Ch0) for port positions.
```

### Agent 2-A: Connection Matrix Engine
```
You are implementing Chapter 2 tasks 2.1, 2.4, 2.7 for the process-graph project.

Read deep-plan/chapters/ch2-connections.md for full specs.

Your tasks:
1. Implement canConnect(sourceNode, targetNode, existingConnections) in data.js
2. Add invalid connection visual feedback (red highlight + tooltip CSS)
3. Enforce no self-connections in canConnect and validateGraph
4. Add connection-invalid/connection-valid CSS classes to diagram.css

Use CONNECTION_MATRIX and PORT_DEFS from constants.js.
```

### Agent 2-B: Port Snapping & Cardinality
```
You are implementing Chapter 2 tasks 2.2, 2.3, 2.8 for the process-graph project.

Read deep-plan/chapters/ch2-connections.md. Read js/routing.js and js/layout.js.

Your tasks:
1. Replace edge-midpoint anchoring with explicit port-to-port snapping
2. Add getPortPosition(node, portId, laneMap) function
3. Enforce gateway port cardinality (0-1 arrow per port, max 5 total)
4. Add assignGatewayPort() auto-assignment function
5. Prevent arrow paths from crossing swimlane headers
```

### Agent 2-C: Labels & Handoffs
```
You are implementing Chapter 2 tasks 2.5, 2.6, 2.9 for the process-graph project.

Read deep-plan/chapters/ch2-connections.md. Read js/routing.js.

Your tasks:
1. Improve arrow label positioning to geometric path midpoint
2. Add cross-lane handoff auto-annotation (detect lane crossing, render indicator)
3. Enforce minimum 8-12px padding from node edges on all arrow segments
```

---

## PHASE 3: Editor + Validation (parallel)

### Agent 3-A: Node Palette & Creation
```
You are implementing Chapter 3 tasks 3.1, 3.8 for the process-graph project.

Read deep-plan/chapters/ch3-editor.md. Read index.html and js/interactions.js.

Your tasks:
1. Add collapsible node palette sidebar to index.html with all node types
2. Implement drag-from-palette-to-canvas node creation
3. Ghost preview during drag, lane detection on drop, 10px grid snap
4. Auto-generate node ID and default label
5. Implement multi-select (Shift+click and box select)
```

### Agent 3-B: Drag-to-Connect
```
You are implementing Chapter 3 tasks 3.2, 3.3 for the process-graph project.

Read deep-plan/chapters/ch3-editor.md. Read js/interactions.js.

Your tasks:
1. Implement drag-to-connect from port to port (mousedown on port circle)
2. Render temporary arrow during drag (lighter opacity)
3. Highlight valid target ports (green) and dim invalid nodes
4. On drop: create connection, auto-assign gateway port, prompt for label
5. Cancel on invalid drop
```

### Agent 3-C: Delete, Properties & Context Menu
```
You are implementing Chapter 3 tasks 3.4, 3.5, 3.6, 3.7 for the process-graph project.

Read deep-plan/chapters/ch3-editor.md. Read index.html and js/interactions.js.

Your tasks:
1. Implement node deletion (Delete key) with connection cleanup
2. Implement connection deletion (click arrow + Delete)
3. Build node property editor panel (right sidebar, dynamic fields per node type)
4. Build context menu (right-click) for nodes, connections, and canvas
```

### Agent 5-A: Graph Validation Rules
```
You are implementing Chapter 5 tasks 5.1-5.10, 5.12 for the process-graph project.

Read deep-plan/chapters/ch5-validation.md.

Your tasks:
1. Create js/validation.js with validateGraph(graph) function
2. Implement all 10 validation checks (start, end, dangling, branches, cycles, lanes, orphans, labels, cardinality, ports)
3. Add loop mode toggle to state.js
4. Add <script src="js/validation.js"> to index.html
```

### Agent 5-B: Validation UI Panel
```
You are implementing Chapter 5 task 5.11 for the process-graph project.

Read deep-plan/chapters/ch5-validation.md. Read index.html.

Your tasks:
1. Add "Validate" button to toolbar in index.html
2. Build validation results panel (bottom panel with clickable issues)
3. Click issue → pan to and highlight offending node
4. Add warning badge (⚠️) to nodes with issues in renderer.js
5. Block save when errors exist
```

---

## PHASE 4: Swimlanes + Layout (parallel)

### Agent 4-A: Lane CRUD UI
```
You are implementing Chapter 4 tasks 4.1, 4.2, 4.3, 4.4 for the process-graph project.

Read deep-plan/chapters/ch4-swimlanes.md.

Your tasks:
1. Add "+" button to create new swimlane (name, type, color form)
2. Right-click lane header → "Delete Lane" (only if empty)
3. Double-click lane header → inline rename
4. Lane type selector (persona/system/agent/department) with header icon
```

### Agent 4-B: Cross-Lane Drag & Auto-Resize
```
You are implementing Chapter 4 tasks 4.5, 4.6, 4.7 for the process-graph project.

Read deep-plan/chapters/ch4-swimlanes.md. Read js/interactions.js and js/layout.js.

Your tasks:
1. Allow full 2D drag in edit mode (remove horizontal-only constraint)
2. Detect target lane during drag, highlight with blue overlay
3. On drop: update node.lane, recalculate y, update owner metadata
4. Auto-resize lanes to fit content (min 120px, 40px padding)
5. Lane header drag-to-reorder with insertion indicator
```

### Agent 6-A: Auto-Layout Algorithm
```
You are implementing Chapter 6 tasks 6.1, 6.2, 6.3, 6.4 for the process-graph project.

Read deep-plan/chapters/ch6-layout-minimap.md. Read js/layout.js.

Your tasks:
1. Implement Sugiyama-style layered layout (BFS layers, barycenter ordering, coordinate assignment)
2. Add "Clean Layout" button to toolbar
3. Change GRID constant from 20 to 10
4. Add overlap prevention during drag
```

### Agent 6-B: Mini-Map Widget
```
You are implementing Chapter 6 tasks 6.5, 6.6, 6.7 for the process-graph project.

Read deep-plan/chapters/ch6-layout-minimap.md.

Your tasks:
1. Add mini-map canvas widget (200x150px, bottom-right)
2. Render simplified diagram (colored bands, dots, lines)
3. Show viewport rectangle, update on scroll/zoom
4. Click mini-map to navigate, drag for continuous pan
5. Refine zoom: toward cursor, pinch support, 20-300% range, zoom indicator
```

---

## PHASE 5: Advanced

### Agent 7-A: Versioning & Undo
```
You are implementing Chapter 7 tasks 7.1, 7.2 for the process-graph project.

Read deep-plan/chapters/ch7-advanced.md.

Your tasks:
1. Expand undo/redo to cover all operations (command pattern)
2. Add redo stack (Ctrl+Y / Ctrl+Shift+Z)
3. Create js/versioning.js with save/restore named snapshots
4. Build version panel UI (list, save button, restore button)
```

### Agent 7-B: Comments & KPI Overlays
```
You are implementing Chapter 7 tasks 7.3, 7.4 for the process-graph project.

Read deep-plan/chapters/ch7-advanced.md.

Your tasks:
1. Create js/comments.js with per-node comment threading
2. Add comment badge rendering on nodes
3. Build comment popover UI (thread + input)
4. Implement KPI overlay toggle (pills below nodes with duration/error/cost)
```

### Agent 7-C: Simulation & Remaining Rules
```
You are implementing Chapter 7 tasks 7.5, 7.6, 7.7, 7.8, 7.9 for the process-graph project.

Read deep-plan/chapters/ch7-advanced.md. Read js/animation.js.

Your tasks:
1. Extend animation engine for time-based simulation (duration per task, clock display)
2. Add agent-based simulation (multiple tokens, throughput tracking, P50/P90/P99)
3. Create schema/process-graph.schema.json (JSON Schema draft-07)
4. Add process group nesting depth limit (max 3 levels) in validation
5. Add decision-to-decision config toggle in settings
```

---

## Verification Agents (run after each phase)

Each chapter file ends with a Verification Agent Prompt section.
After completing a phase, copy-paste the verification prompt to run automated checks.
Update PROGRESS.md checkboxes based on results.
