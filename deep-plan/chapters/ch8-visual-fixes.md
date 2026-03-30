# Chapter 8 — Visual Fixes & Issues (from issues2, issues3, issues4)

> **Priority:** HIGH — visible bugs and layout problems
> **Parallel Agents:** 3
> **Source:** issues2.png, issues3.png, issues4.png screenshots

---

## Goal
Fix all visual bugs identified in the issue screenshots: broken layout,
poor arrow routing, unreadable swimlane headers, node cramping, and
annotation arrow rendering issues.

---

## Agent 8-A: Layout & Spacing Fixes

### Issues addressed:
- **issues2.png:** Nodes clustered in top-left, massive empty space below
- **issues3.png:** Nodes too close together vertically, misaligned
- **issues4.png:** Nodes crossing lane boundaries

### Tasks

#### 8.1 Fix Vertical Node Distribution
Nodes are cramping into the top of their swimlane instead of distributing
across the available lane height.

- In `layout.js` `computeLayout()`, verify that nodes within a lane are
  vertically centered and spaced with at minimum `NODE_GAP` (60px) between them
- When a lane has only 1-2 nodes, center them vertically in the lane
- When a lane has many nodes, auto-expand lane height and distribute evenly

#### 8.2 Fix Nodes Crossing Lane Boundaries
Some nodes render partly in an adjacent lane.

- In `computeLayout()`, clamp each node's absolute Y so that
  `nodeTop >= laneTop + padding` and `nodeBottom <= laneBottom - padding`
- Use padding of 20px from lane edges
- If a node is too tall for its lane, expand the lane height

#### 8.3 Fix SVG Canvas Size
Massive empty space below diagram (issues2.png).

- In `setSvgDimensions()` or `computeLayout()`, set SVG viewBox height to
  tightly fit the content (total lane heights + small margin), not a fixed
  large value
- Ensure the canvas doesn't extend far beyond the last lane

#### 8.4 Fix Auto-Layout Lane Centering
When `autoLayout()` runs, nodes should be centered within their lanes,
not pushed to the top.

- After coordinate assignment in `autoLayout()`, compute centroid of each
  lane's nodes and shift them to be vertically centered in the lane

---

## Agent 8-B: Arrow Routing Fixes

### Issues addressed:
- **issues3.png:** Vertical dashed arrow cuts straight down through lanes
- **issues3.png:** Decision "No" label positioned awkwardly
- **issues2.png:** Annotation callout arrows look broken

### Tasks

#### 8.5 Fix Cross-Lane Arrow Routing
Arrows crossing multiple lanes should route orthogonally (right then down
then right), not cut straight diagonally or vertically through lane bodies.

- In `routing.js`, when source and target are in different lanes:
  - Route horizontally out of source node first
  - Then route vertically between lanes (in the gap between nodes)
  - Then route horizontally into target node
  - Never route a vertical segment through a lane's node area

#### 8.6 Fix Message/Dashed Arrow Routing
Message-type (dashed) arrows render as straight diagonal lines instead of
proper orthogonal routes.

- Ensure `type: 'message'` connections use the same orthogonal routing
  algorithm as `type: 'sequence'` connections
- Only the dash-pattern should differ, not the routing logic

#### 8.7 Fix Decision Label Positioning
"No" / "Yes" labels on gateway branches are positioned awkwardly — too far,
overlapping other elements, or at wrong angle.

- In `routing.js` label placement for decision branches:
  - Place label on the first segment of the branch arrow
  - Position offset perpendicular to the arrow direction
  - Ensure label doesn't overlap the gateway diamond shape
  - For left-going "No" branch: label goes above the horizontal segment
  - For right-going "Yes" branch: label goes above the horizontal segment

#### 8.8 Fix Annotation Callout Arrows
Annotation nodes have callout pointers that look broken/disconnected.

- In `renderer.js` annotation rendering, verify the callout `<path>` connects
  the annotation dashed rect to its target node cleanly
- The callout should be a thin line from annotation edge to the referenced node
- If no target specified, render callout pointing left (default)

---

## Agent 8-C: Swimlane Header Improvements

### Issues addressed:
- **issues4.png:** "swimlanes are not cleanly named with icons" — headers
  only show a tiny building emoji, no readable lane name

### Tasks

#### 8.9 Fix Swimlane Header Labels
Lane headers must prominently display the lane name, not just an icon.

- In `renderer.js` `renderLanes()`:
  - Lane header should show: type icon (small, 14px) + lane name text (bold, 14px)
  - Text should be vertically centered in the header band
  - Header band height: at least 28px
  - Background: lane color at higher opacity for readability
  - Text color: white or light color for contrast on dark backgrounds

#### 8.10 Swimlane Header Layout
Headers should span the full width of the lane or be clearly visible as
a left sidebar.

- If using left-sidebar style: minimum width 100px, lane name rotated
  vertically or horizontal with wrapping
- If using top-banner style: full-width colored band at top of each lane
- The header must be clearly distinguishable from the lane body

#### 8.11 Swimlane Visual Separation
Lanes need clearer visual separation from each other.

- Add a subtle border/divider line between adjacent lanes (1px, semi-transparent)
- Alternate lane background opacity slightly (even/odd) for visual grouping
- Ensure lane label text never clips behind nodes

---

## Acceptance Criteria
- [ ] Nodes vertically centered in their lanes
- [ ] No nodes crossing lane boundaries
- [ ] SVG canvas tightly fits content (no massive empty space)
- [ ] Cross-lane arrows route orthogonally (no diagonal cuts)
- [ ] Dashed/message arrows use same routing as sequence arrows
- [ ] Decision labels positioned cleanly near source
- [ ] Annotation callout arrows connect properly
- [ ] Lane headers show icon + readable name text
- [ ] Lanes have clear visual separation
- [ ] All existing tests still pass

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 8 is complete:

1. Load order-approval.json — verify nodes centered in lanes
2. Load lean-six-sigma.json in split view — verify no overlaps
3. Check cross-lane arrows — verify orthogonal routing (no diagonals)
4. Check decision labels — verify "Yes"/"No" positioned near gateway
5. Check swimlane headers — verify icon + name text visible
6. Check annotation nodes — verify callout pointers connect cleanly
7. Zoom out to see full diagram — verify no massive empty space below
8. Run all Playwright tests — verify no regressions
```
