# Chapter 11 — Options Panel & Light Theme Fixes

> **Priority:** HIGH — light theme broken, options features untested
> **Parallel Agents:** 2 (11-T test first, then 11-A fix)
> **Source:** User report: light theme not changing dark background on SVG elements
> **Approach:** TEST-FIRST (same as Ch10)

---

## Goal
Fix the light theme so ALL visual elements properly switch from dark to light,
and add comprehensive tests for EVERY option in the Options dropdown menu.

---

## Issue Analysis

### Light Theme Problems
The `body.light-theme` class is toggled correctly (J12-S3 passes), but the
actual visual appearance doesn't change properly because:
- SVG node fills still use dark theme colors (not overridden)
- Lane background rectangles retain dark fills
- SVG canvas background may not update
- Arrow/connection colors may not adapt
- Grid dot pattern retains dark coloring
- Panel backgrounds may not switch
- Node accent bars, shadows, port buttons retain dark styling

### Options Panel — Features with ZERO test coverage

Every checkbox in the options menu needs functional testing:

| Option | ID | Tested? | What to verify |
|--------|-----|---------|----------------|
| Edit Mode | `chk-edit-mode` | Partial (J6) | Toolbar visible, palette, drag cursor |
| JSON Editor | `chk-show-editor` | Yes (J12-S6) | Panel visible/hidden |
| Notes | `chk-show-notes` | Yes (J12-S5) | Notebook visible/hidden |
| Metrics Panel | `chk-show-metrics` | Partial (J10) | Panel appears, has content |
| KPI HUD | `chk-show-kpis` | **NO** | KPI overlay on nodes toggles |
| Benefits | `chk-show-benefits` | Partial (J10) | Panel appears, has content |
| Sequence View | `chk-sequence-view` | Partial (J8) | View switches, SVG changes |
| Pause / Step | `chk-pause-step` | Partial (J5) | Simulation controls appear |
| Light Theme | `chk-light-mode` | Weak (J12) | Only checks class, not visual |
| Flow Animation | `chk-flow-animation` | **NO** | Animated dots on arrows |

---

## PHASE 1: Agent 11-T — Test Infrastructure

### Tasks

#### 11.T1 Create Options Comprehensive Test (`testing/tests/20-options-comprehensive.spec.js`)

Test EVERY option toggle with proper visual/functional assertions:

**Edit Mode (`chk-edit-mode`):**
- Toggle ON → `body.is-editing` class, node palette visible, cursor=grab on nodes
- Toggle OFF → class removed, palette hidden, normal cursor
- Verify drag handles appear/disappear on nodes

**JSON Editor (`chk-show-editor`):**
- Toggle ON → `#editor-pane` visible, contains valid JSON textarea
- Toggle OFF → hidden
- Verify it doesn't overlap the diagram

**Notes (`chk-show-notes`):**
- Toggle ON → `#notebook` visible
- Toggle OFF → hidden

**Metrics Panel (`chk-show-metrics`):**
- Toggle ON → metrics panel visible, has rows with labels and values
- Toggle OFF → panel hidden
- Verify panel doesn't overlap diagram nodes

**KPI HUD (`chk-show-kpis`):**
- Toggle ON → KPI overlays appear on nodes (count > 0)
- Toggle OFF → overlays removed (count = 0)
- Verify overlay text is readable (not zero-size, not clipped)

**Benefits (`chk-show-benefits`):**
- Toggle ON → benefits panel visible, has benefit cards
- Toggle OFF → panel hidden

**Sequence View (`chk-sequence-view`):**
- Toggle ON → sequence container visible, main diagram hidden/changed
- Toggle OFF → back to normal diagram view
- Verify lifelines and messages render

**Pause / Step (`chk-pause-step`):**
- Toggle ON → simulation controls bar visible (pause/step/restart buttons)
- Toggle OFF → controls hidden

**Flow Animation (`chk-flow-animation`):**
- Toggle ON → animated dot elements appear on connection paths
- Toggle OFF → dot elements removed
- Verify dots are positioned ON the path (not floating elsewhere)

#### 11.T2 Create Light Theme Visual Test (`testing/tests/21-light-theme.spec.js`)

Verify every visual element switches properly in light theme:

**Background & Canvas:**
- `body` background color is light (not dark)
- `#diagram-svg` background is light
- Grid dots are dark-on-light (not light-on-dark)

**Nodes:**
- Task node `rect` fill is light/white (not dark navy)
- Decision diamond `polygon` fill is light
- Terminal node fill is light
- Node label `text` fill is dark (readable on light background)
- Node accent bar colors still visible
- Node shadow contrast appropriate for light bg

**Lanes:**
- Lane background `rect` fill is light-tinted (not dark)
- Lane header background is light
- Lane label text is dark
- Lane divider lines visible on light background

**Connections:**
- Arrow `path` stroke is dark (visible on light bg)
- Arrowhead markers are dark
- Decision labels (Yes/No) are readable on light bg
- Message/dashed arrows visible on light bg

**Panels:**
- Metrics panel bg is light
- Benefits panel bg is light
- KPI HUD bg is light
- JSON editor bg is light
- Notebook bg is light
- Options menu bg is light

**Header & Toolbar:**
- Header bg switches to light
- Button text/icons readable on light bg
- Active view-mode button clearly distinguishable

**Method:** Use `getComputedStyle()` to check actual resolved color values.
For color comparison, convert to RGB and assert luminance:
- Light elements: luminance > 0.5 (light background)
- Dark text: luminance < 0.4 (dark text on light bg)
- Contrast ratio between text and background >= 4.5:1 (WCAG AA)

```javascript
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

#### 11.T3 Create Theme Toggle Persistence & Interaction Test

- Toggle light theme → switch diagrams → theme persists
- Toggle light theme → switch view modes → theme persists
- Toggle light theme → open/close panels → panels render in light theme
- Toggle light theme OFF → all elements revert to dark (no stuck light elements)
- Verify no flash of wrong theme during transitions

---

## PHASE 2: Agent 11-A — Light Theme Fixes

**Files:** `css/core.css`, `css/diagram.css`, `css/panels.css`, `css/widgets.css`, `css/diff.css`

### Tasks

#### 11.1 Fix SVG Canvas & Grid Background in Light Theme
- Override SVG `background` or background `<rect>` fill in light theme
- Override grid dot `<pattern>` fill to dark dots on light background
- Ensure grid crosshair lines are visible on light bg

#### 11.2 Fix Node Fills in Light Theme
- Override ALL node type fills: task, decision, terminal, subprocess,
  merge, process-group, start-event, end-event, intermediate-event
- Ensure node accent bars (left-edge color) remain vivid on light bg
- Ensure node shadows have appropriate opacity for light bg
- Override port button ("+" circles) styling

#### 11.3 Fix Lane Backgrounds in Light Theme
- Override lane `<rect>` fills to light-tinted versions of lane colors
- Ensure lane type icons are visible on light bg
- Override lane header background
- Ensure lane divider lines have sufficient contrast

#### 11.4 Fix Connection Colors in Light Theme
- Override arrow `stroke` to dark color on light bg
- Override arrowhead `marker` fill to dark
- Override decision label text color
- Override message (dashed) and conditional arrow styles
- Ensure animated flow dots are visible on light bg

#### 11.5 Fix Panel & Widget Backgrounds in Light Theme
- Verify all panel CSS uses `var(--bg-*)` variables (not hardcoded colors)
- If any panel uses hardcoded dark colors: switch to CSS variables
- Verify dropdown menus, context menus, tooltips all use theme vars
- Fix validation panel, version panel, comments panel

#### 11.6 Fix Diff Overlay Colors in Light Theme
- Diff-added/removed/changed overlay colors must be visible on light bg
- Override diff overlay opacity if needed (lighter bg needs different opacity)
- Ensure diff strikethrough text is readable on light bg

---

## Execution Order

```
 Phase 1 (Sequential)
 ┌────────────────────────────────────────────────┐
 │ Agent 11-T: Test Infrastructure                 │
 │  T1 → T2 → T3                                  │
 │  Deliverables:                                  │
 │   - testing/tests/20-options-comprehensive.spec │
 │   - testing/tests/21-light-theme.spec.js        │
 └──────────────────────┬─────────────────────────┘
                        │
 Phase 2 (Sequential — themed CSS is interconnected)
 ┌────────────────────────────────────────────────┐
 │ Agent 11-A: Light Theme & Options Fixes         │
 │ 11.1 → 11.2 → 11.3 → 11.4 → 11.5 → 11.6      │
 └────────────────────────────────────────────────┘
```

---

## File Change Map

| File | Agent | Changes |
|------|-------|---------|
| `testing/tests/20-options-comprehensive.spec.js` | 11-T | **NEW** — Full options panel test |
| `testing/tests/21-light-theme.spec.js` | 11-T | **NEW** — Visual theme verification |
| `css/core.css` | 11-A | Light theme var overrides |
| `css/diagram.css` | 11-A | Node, lane, connection light overrides |
| `css/panels.css` | 11-A | Panel light theme fixes |
| `css/widgets.css` | 11-A | Widget light theme fixes |
| `css/diff.css` | 11-A | Diff overlay light theme fixes |
| `js/renderer.js` | 11-A | If any inline styles need light-theme awareness |

---

## Acceptance Criteria

- [ ] `20-options-comprehensive.spec.js`: ALL option toggles tested and passing
- [ ] `21-light-theme.spec.js`: ALL visual element categories pass
- [ ] Light theme: body, SVG canvas, grid, nodes, lanes, arrows, panels all light
- [ ] Dark theme: toggling OFF restores all elements to dark (no stuck light)
- [ ] Theme persists across diagram switches and view mode changes
- [ ] KPI HUD toggle tested (was previously untested)
- [ ] Flow Animation toggle tested (was previously untested)
- [ ] WCAG AA contrast ratio (>= 4.5:1) for text on both themes
- [ ] No regressions in existing J12 tests
