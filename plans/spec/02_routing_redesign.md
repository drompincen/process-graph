# Phase 2: Routing Redesign — Pseudocode

## Principle
**Determine the ENTRY DIRECTION first, then route backwards from target to source.**

Current approach: source → intermediate → target (forward routing).
New approach: decide entry edge → set final segment → route intermediate segments.

## Module 1: Entry Direction Resolution

```pseudocode
function resolveEntryDirection(srcBounds, tgtBounds, conn):
    // Gateway sources: entry direction depends on which port was used
    if srcBounds.type == 'gateway':
        port = resolveGatewayOutPort(conn, srcBounds, tgtBounds)
        if port == 'out-right':   return 'LEFT'    // arrow goes right → enters LEFT
        if port == 'out-bottom':  return 'TOP'     // arrow goes down → enters TOP
        if port == 'out-left':    return 'RIGHT'   // arrow goes left → enters RIGHT
        if port == 'out-bl':     return 'LEFT'     // bottom-left → route to LEFT entry
        if port == 'out-br':     return 'LEFT'     // bottom-right → route to LEFT entry

    // Non-gateway: entry direction matches source position relative to target
    dx = srcBounds.x - tgtBounds.x
    dy = srcBounds.y - tgtBounds.y
    absDx = abs(dx)
    absDy = abs(dy)

    if absDy > absDx:
        // Source is primarily above or below
        return 'TOP' if dy < 0 else 'BOTTOM'
    else:
        // Source is primarily left or right
        return 'LEFT' if dx < 0 else 'RIGHT'
```

### TDD Anchor
```
TEST: source above target → entry = TOP
TEST: source below target → entry = BOTTOM
TEST: source left of target → entry = LEFT
TEST: source right of target → entry = RIGHT
TEST: gateway out-bottom → entry = TOP
TEST: gateway out-right → entry = LEFT
```

## Module 2: Target Entry Point Calculation

```pseudocode
function getEntryPoint(tgtBounds, entryDirection):
    switch entryDirection:
        case 'TOP':    return { x: tgtBounds.x, y: tgtBounds.top }
        case 'BOTTOM': return { x: tgtBounds.x, y: tgtBounds.bottom }
        case 'LEFT':   return { x: tgtBounds.left, y: tgtBounds.y }
        case 'RIGHT':  return { x: tgtBounds.right, y: tgtBounds.y }
```

### TDD Anchor
```
TEST: TOP entry → x = center, y = top edge
TEST: LEFT entry → x = left edge, y = center
```

## Module 3: Path Construction (entry-direction-aware)

```pseudocode
function buildPath(sx, sy, entryPoint, entryDirection, conn):
    tx = entryPoint.x
    ty = entryPoint.y

    // Apply arrowhead offset (9px back from entry point)
    switch entryDirection:
        case 'TOP':    ty_path = ty - 9;  arrowDir = 'down'
        case 'BOTTOM': ty_path = ty + 9;  arrowDir = 'up'
        case 'LEFT':   tx_path = tx - 9;  arrowDir = 'right'
        case 'RIGHT':  tx_path = tx + 9;  arrowDir = 'left'

    // Build the intermediate path
    if entryDirection in ('TOP', 'BOTTOM'):
        // Final segment is vertical → intermediate goes horizontal first
        pathD = "M sx,sy L tx,sy L tx,ty_path"
    else:
        // Final segment is horizontal → intermediate goes vertical first
        midY = (sy + ty) / 2
        pathD = "M sx,sy L sx,midY L tx_path,midY L tx_path,ty"
        // Simplify: if same Y, just go horizontal
        if abs(sy - ty) < 1:
            pathD = "M sx,sy L tx_path,ty"

    return { pathD, arrowPoints: arrowPolygon(arrowDir, tx, ty) }
```

### TDD Anchor
```
TEST: TOP entry, different x → path goes H then V (enters from above)
TEST: LEFT entry, different y → path goes V then H (enters from left)
TEST: TOP entry, same x → straight vertical line
TEST: LEFT entry, same y → straight horizontal line
```

## Module 4: Padding with Direction Preservation

```pseudocode
function applyPaddingPreservingDirection(waypoints, nodesMap, fromId, toId):
    // Save the original final segment (last two waypoints)
    origFinalStart = waypoints[length - 2]
    origFinalEnd = waypoints[length - 1]

    // Run padding on ALL segments EXCEPT the final one
    finalSegment = waypoints.pop()  // remove last point
    addPaddingToWaypoints(waypoints, nodesMap, fromId, toId)
    waypoints.push(finalSegment)  // restore last point

    // If padding changed the second-to-last point, insert a corner
    // waypoint to reconnect to the final segment cleanly
    newPrev = waypoints[length - 2]
    if newPrev != origFinalStart:
        // Insert a corner that maintains the final segment direction
        if finalSegment is vertical (same x as origFinalEnd):
            waypoints.splice(length - 1, 0, [origFinalEnd[0], newPrev[1]])
        else:
            waypoints.splice(length - 1, 0, [newPrev[0], origFinalEnd[1]])

    return waypoints
```

### TDD Anchor
```
TEST: padding inserts detour → final segment direction preserved
TEST: no padding needed → path unchanged
TEST: padding shifts intermediate → corner inserted to maintain entry direction
```

## Module 5: Gateway Port Separation

```pseudocode
function resolveGatewayOutPort(conn, srcBounds, tgtBounds):
    if conn.sourcePort: return conn.sourcePort

    if conn.decision == 'yes':    return 'out-right'
    if conn.decision == 'no':     return 'out-bottom'
    if conn.decision:             return 'out-bl'  // escalate, fail, etc.

    // Non-decision: use geometry
    dx = tgtBounds.x - srcBounds.x
    dy = tgtBounds.y - srcBounds.y
    if dx > 20:  return 'out-right'
    if dx < -20: return 'out-left'
    if dy > 0:   return 'out-bottom'
    return 'out-right'
```

### TDD Anchor
```
TEST: yes → out-right
TEST: no → out-bottom
TEST: escalate → out-bl
TEST: no two branches share same port for same gateway
```

## Implementation Order
1. `resolveEntryDirection` — pure function, no side effects
2. `getEntryPoint` — pure function
3. Modify `computeOrthogonalPath` to use entry direction
4. Modify `applyPaddingAndLabels` to preserve final segment
5. Run full 19-check QA
6. Fix remaining JSON placement issues per sample
