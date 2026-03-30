# Chapter 2 — Connection System & Arrow Rules

> **Depends on:** Chapter 0 (data model), Chapter 1 (port rendering)
> **Parallel Agents:** 3
> **Files:** `js/routing.js`, `js/interactions.js`, `js/data.js`, `js/constants.js`, `css/diagram.css`

---

## Goal
Implement the full connection rule system from rules.txt.txt: connection matrix
enforcement, port-based snapping, cardinality limits, invalid connection
feedback, and cross-lane handoff annotations.

---

## Agent 2-A: Connection Matrix Engine

### Tasks

#### 2.1 Implement Connection Matrix Validation Engine
Create validation function using `CONNECTION_MATRIX` from Chapter 0:

```js
// In data.js or new connections.js
function canConnect(sourceNode, targetNode, existingConnections) {
  const matrix = CONNECTION_MATRIX;

  // 1. Check type compatibility
  if (!matrix[sourceNode.type]?.includes(targetNode.type)) {
    return { valid: false, reason: `${sourceNode.type} cannot connect to ${targetNode.type}` };
  }

  // 2. Check self-connection
  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'Cannot connect a node to itself' };
  }

  // 3. Check source port availability (maxOut)
  const outCount = existingConnections.filter(c => c.from === sourceNode.id).length;
  if (outCount >= PORT_DEFS[sourceNode.type].maxOut) {
    return { valid: false, reason: `Maximum outgoing connections reached (${PORT_DEFS[sourceNode.type].maxOut})` };
  }

  // 4. Check target port availability (maxIn)
  const inCount = existingConnections.filter(c => c.to === targetNode.id).length;
  if (inCount >= PORT_DEFS[targetNode.type].maxIn) {
    return { valid: false, reason: `Maximum incoming connections reached` };
  }

  // 5. Check decision-to-decision (configurable)
  if (sourceNode.type === 'gateway' && targetNode.type === 'gateway' && !ALLOW_DECISION_TO_DECISION) {
    return { valid: false, reason: 'Decision cannot connect directly to another Decision (configurable)' };
  }

  return { valid: true };
}
```

#### 2.4 Block Invalid Connections with Red Highlight + Tooltip
When user attempts an invalid connection (during drag-to-connect from Ch3):
- Target node gets CSS class `connection-invalid` (red border glow)
- Show floating tooltip near cursor with the rejection reason
- Drop is prevented; arrow snaps back to source
- Valid targets get CSS class `connection-valid` (green border glow)

CSS in `diagram.css`:
```css
.connection-invalid { filter: drop-shadow(0 0 6px #ef4444); }
.connection-valid   { filter: drop-shadow(0 0 6px #22c55e); }
.connection-tooltip {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid #ef4444;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1000;
}
```

#### 2.7 No Self-Connections Enforcement
In `canConnect()` (above), reject `sourceNode.id === targetNode.id`.
Also in `data.js` `validateGraph()`, scan existing connections and flag any
where `from === to` as an error.

---

## Agent 2-B: Port Snapping & Cardinality

### Tasks

#### 2.2 Port-to-Port Snapping
Replace current edge-midpoint connection anchoring with explicit port positions:

```js
function getPortPosition(node, portId, laneMap) {
  const abs = getAbsoluteNodePosition(node, laneMap);
  const dims = NODE_DIMS[node.type];
  const portOffsets = computePortOffsets(node.type, dims);
  const offset = portOffsets[portId];
  return { x: abs.x + offset.x, y: abs.y + offset.y };
}
```

Update `routing.js` to:
1. Look up source port and target port for each connection
2. Start arrow path at exact port pixel position
3. End arrow path at exact target port position
4. Store `sourcePort` and `targetPort` on connection objects

#### 2.3 Enforce Decision Port Cardinality
For gateway nodes:
- Minimum 2 outgoing connections (validated in Ch5, but warn during editing)
- Maximum 5 outgoing connections (hard block)
- Each outgoing arrow must use a distinct port (left, right, bottom, bl, br)
- Auto-assign next available port when creating new connection
- If all ports occupied, block further outgoing connections

```js
function assignGatewayPort(gatewayNode, existingConnections) {
  const usedPorts = existingConnections
    .filter(c => c.from === gatewayNode.id)
    .map(c => c.sourcePort);
  const available = ['out-right', 'out-left', 'out-bottom', 'out-br', 'out-bl']
    .filter(p => !usedPorts.includes(p));
  return available[0] || null; // null = all ports full
}
```

#### 2.8 No Arrows Crossing Swimlane Headers
When routing arrows, add constraint:
- Arrow paths must not intersect the lane header rectangles
- If a path would cross a header, reroute around it (add extra waypoint)
- Lane headers are at the left edge (y=laneTop, height=headerH)

---

## Agent 2-C: Labels & Handoffs

### Tasks

#### 2.5 Arrow Label Anchoring at Midpoint
Improve label positioning in `routing.js`:
- Compute the geometric midpoint of the arrow path (not just segment midpoint)
- For orthogonal paths: midpoint of the longest horizontal segment
- Label background pill must not overlap the arrow line
- When arrow reroutes (node drag), label repositions automatically
- For decision branches: label appears near source node (first segment)

```js
function computeLabelPosition(pathSegments) {
  const totalLength = pathSegments.reduce((sum, s) => sum + s.length, 0);
  let target = totalLength / 2;
  // walk segments to find midpoint position
  // offset perpendicular to path direction for readability
}
```

#### 2.6 Cross-Lane Handoff Auto-Annotation
When an arrow crosses from one swimlane to another:
- Auto-add `handoff: true` metadata to the connection
- Render a small handoff indicator at the lane boundary crossing point
- Indicator: dashed circle with arrow icon, or label badge "Handoff"
- Optionally show handoff type metadata (human review, system call, etc.)
- Style: subtle, not overpowering the main arrow

#### 2.9 Minimum 8-12px Padding Enforcement
Update `routing.js` path generation:
- All arrow segments must maintain ≥ 10px (midpoint of 8-12) from any node edge
- When computing waypoints, add padding buffer around node bounding boxes
- Check all intermediate segments, not just start/end

```js
const ARROW_PADDING = 10; // px from node edges
function addPaddingToWaypoints(waypoints, nodeRects) {
  return waypoints.map(wp => {
    for (const rect of nodeRects) {
      // push waypoint outside rect + padding if it falls inside
    }
    return wp;
  });
}
```

---

## Acceptance Criteria
- [ ] `canConnect()` correctly validates all entries in the connection matrix
- [ ] Self-connections are blocked
- [ ] Gateway-to-gateway blocked by default, allowed via config flag
- [ ] Invalid connection attempt shows red highlight + tooltip
- [ ] Valid targets highlighted green during drag-to-connect
- [ ] Arrows snap to specific port positions, not arbitrary edge points
- [ ] Gateway outgoing arrows use distinct ports (no shared origin)
- [ ] Gateway limited to 5 outgoing connections
- [ ] Arrow labels anchor at path midpoint, reposition on drag
- [ ] Cross-lane arrows show handoff annotation
- [ ] No arrow path comes within 10px of a non-connected node edge
- [ ] No arrow crosses a swimlane header

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 2 is complete:

1. Attempt to connect start-event → end-event — expect BLOCKED
2. Attempt to connect task → task — expect ALLOWED
3. Attempt to connect gateway → gateway — expect BLOCKED (default config)
4. Attempt to connect a node to itself — expect BLOCKED
5. Add 6 outgoing arrows from a gateway — expect 6th BLOCKED (max 5)
6. Verify all gateway outgoing arrows originate from different port positions
7. Check an arrow crossing lanes — verify handoff annotation present
8. Measure arrow-to-node distances — verify ≥ 8px padding
9. Move a node with labeled arrow — verify label repositions
10. Check that no arrow path crosses a lane header
```
