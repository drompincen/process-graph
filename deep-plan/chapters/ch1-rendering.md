# Chapter 1 — Rendering: New Node Types & Ports

> **Depends on:** Chapter 0 (data model)
> **Parallel Agents:** 2
> **Files:** `js/renderer.js`, `js/routing.js`, `js/layout.js`, `css/diagram.css`

---

## Goal
Render Merge nodes, Process Group containers, visible port anchors, and
enforce distinct decision node port geometry per rules.txt.txt.

---

## Agent 1-A: New Shape Rendering

### Tasks

#### 1.1 Render Merge Node
- Shape: small filled circle (r=15) or horizontal bar (w=40, h=8)
- Color: neutral gray with subtle gradient matching theme
- Label: optional, rendered below shape
- SVG: `<circle cx="0" cy="0" r="15" class="node-merge"/>` or `<rect>`
- Must support multiple incoming arrows (top, left, right ports)
- Single outgoing arrow (bottom port)

Add to `renderer.js` in the node rendering switch:
```js
case 'merge':
  // render small circle with merge icon
  break;
```

Add CSS class `.node-merge` in `diagram.css`.

#### 1.2 Render Process Group Container
- Shape: rounded rectangle with colored header bar (36px)
- Header shows group name, collapse toggle icon (▼/▶)
- Body area contains child nodes (rendered inside the group's `<g>`)
- Border: 2px dashed when expanded, solid when collapsed
- When collapsed: show as compact node (like subprocess) hiding children
  but preserving external connections

Implementation approach:
1. Render the group `<g>` first (before contained nodes)
2. Use `transform` to position children relative to group origin
3. Store expand/collapse state in `state.js`

#### 1.7 Process Group Collapse/Expand
- Click toggle icon in header to collapse/expand
- Collapsed: hide all children `<g>` elements, resize group to compact
- Expanded: show children, auto-size group to fit content
- External connections re-route to group boundary when collapsed
- Animation: 200ms height transition

---

## Agent 1-B: Port Visuals & Decision Geometry

### Tasks

#### 1.3 Render Visible Port Anchors on Hover/Select
When a node is hovered or selected, show port indicators:
- Small circles (r=4) at each valid port position
- Color: blue for available ports, gray for occupied ports
- Only show on nodes that have connectable ports (not persona/system/agent)
- Hide when node is deselected

Implementation:
```js
function renderPortIndicators(nodeG, nodeType, existingConnections) {
  const ports = PORT_DEFS[nodeType];
  // for each port direction, compute position and render circle
}
```

Add to `renderer.js`, called on mouseenter/selection.

#### 1.4 Decision Node Distinct Port Geometry
Update gateway rendering to show explicit port positions:
- **Top center:** incoming port (single)
- **Left midpoint:** outgoing port 1 (typically "No")
- **Right midpoint:** outgoing port 2 (typically "Yes")
- **Bottom center:** outgoing port 3 (for 3+ branches)
- **Bottom-left, bottom-right:** ports 4-5 (for 4-5 branches)

Compute port positions from diamond geometry:
```js
function getGatewayPortPosition(portIndex, nodeWidth, nodeHeight) {
  const positions = {
    'in-top':     { x: 0, y: -h/2 },
    'out-left':   { x: -w/2, y: 0 },
    'out-right':  { x: w/2, y: 0 },
    'out-bottom': { x: 0, y: h/2 },
    'out-bl':     { x: -w/4, y: h/4 },
    'out-br':     { x: w/4, y: h/4 },
  };
}
```

#### 1.5 Port Anchor Visual Indicators
When decision node is selected or in connect mode:
- Show port circles at all 5 potential outgoing positions
- Filled blue = available, filled gray = occupied
- Tooltip on hover: "Yes branch", "No branch", etc.
- Animate port pulse when dragging a connection nearby

#### 1.6 Angular Separation for Decision Outgoing Arrows
Modify `routing.js` arrow path generation for gateway nodes:
- Ensure outgoing arrows leave at distinct angles
- Minimum 20° angular separation between any two branches
- If branches are nearly collinear, offset with small curve
- Arrows from left port go left then route, from right port go right then route

---

## Acceptance Criteria
- [ ] Merge nodes render as small circles with proper ports
- [ ] Process Groups render as containers with header + body
- [ ] Process Groups collapse/expand with toggle
- [ ] Port anchors visible on hover for all connectable node types
- [ ] Gateway shows 5 distinct port positions
- [ ] Outgoing decision arrows maintain 20° minimum separation
- [ ] All existing node types still render correctly (regression)
- [ ] Dark and light themes both work for new elements

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 1 is complete:

1. Load a sample JSON with merge nodes — verify they render as circles
2. Load a sample JSON with process groups — verify container with header
3. Click collapse toggle on process group — verify children hide
4. Hover over a task node — verify port circles appear
5. Hover over a gateway — verify 5 port positions shown
6. Check two outgoing gateway arrows — verify they leave at different angles
7. Load all existing sample JSONs — verify no visual regressions
8. Toggle dark/light theme — verify new elements theme correctly
```
