# Chapter 9 — Visual Polish & Inspiration Improvements

> **Priority:** MEDIUM — UX polish inspired by n8n/Railway-style workflow editors
> **Parallel Agents:** 3
> **Source:** inspiration.png, inspiration2.png screenshots

---

## Goal
Elevate the visual quality of the process graph to match modern workflow
editor aesthetics (n8n, Railway, Make.com style) while keeping the BPMN
process semantics. Focus on node cards, port connectors, section groups,
and overall polish.

---

## Inspiration Analysis

### inspiration.png (n8n-style workflow)
- Clean **card-style nodes** with rounded corners and subtle shadows
- **Service/type icons** inside each node (not just text)
- **Subtitle text** below the main label (e.g. "upload: file", "GET: https://...")
- Visible **"+" port buttons** on node edges for quick connection creation
- **Smooth curved arrows** (not harsh orthogonal bends)
- Consistent horizontal spacing between nodes
- Dark background with light node cards (good contrast)
- Nodes have a **color accent** on the left edge or top indicating type

### inspiration2.png (Railway/complex workflow)
- **Colored section groups** with header labels (red, green, blue, yellow sections)
- Named stage headers: "Step 1: Generate Clips", "Step 2: Generate Sounds"
- Compact **icon-rich nodes** — small colored circles with distinct icons per service
- Multiple branching paths clearly laid out
- **Section background colors** that group related steps visually
- Mix of left-to-right and top-to-bottom flow within sections

---

## Agent 9-A: Node Card Styling

### Tasks

#### 9.1 Card-Style Nodes with Shadows
Upgrade task node rendering from flat rectangles to card-style:

- Add subtle drop shadow (2px blur, 4px offset, 15% opacity)
- Slightly increase corner radius (rx=10 instead of rx=8)
- Add a thin left-edge color accent bar (4px wide) based on node state:
  - Normal task: blue accent (#3b82f6)
  - Automated/system task: purple accent (#8b5cf6)
  - Bottleneck: amber accent (#f59e0b)
  - Removed: red accent (#ef4444)
  - Added: green accent (#22c55e)
- Background: slightly lighter than current for better readability

#### 9.2 Node Type Icons
Add contextual icons inside nodes based on their type or metadata:

- Task: clipboard/checkmark icon (small, top-left corner)
- Gateway: question mark or branch icon inside diamond
- Subprocess: nested-squares icon
- Start: play triangle
- End: stop square
- System node: database/server icon
- Agent node: robot/lightning icon
- Persona node: user avatar icon

Use simple SVG path icons (16x16) rendered in the node header area.
Create an `ICON_PATHS` constant in `constants.js` with SVG path data.

#### 9.3 Node Subtitle/Description Line
Add optional subtitle text below the main label:

- If node has `description` field: show first 30 chars as gray subtitle
- If node has `duration` field: show as subtitle (e.g. "Duration: 2h")
- If node has `owner` field: show as subtitle (e.g. "Owner: Operations")
- Subtitle text: 10px, gray/muted color, single line with ellipsis
- Increases node height by ~16px when subtitle present

#### 9.4 Interactive "+" Port Buttons
Replace static port circles with interactive "+" buttons on node edges:

- Show "+" buttons on hover (similar to current port indicators)
- Styled as small circles with "+" text inside
- Clicking "+" initiates connection creation (same as drag-from-port)
- Only show on available ports (not occupied ones)
- Smooth appear/disappear animation (opacity + scale)

---

## Agent 9-B: Arrow & Connection Polish

### Tasks

#### 9.5 Smooth Curved Arrows Option
Add a setting to use smooth bezier curves instead of orthogonal routing:

- New arrow routing mode: 'curved' (alongside existing 'orthogonal')
- Curved mode: cubic bezier from source port to target port
  - Horizontal control points for same-lane connections
  - S-curve for cross-lane connections
- Toggle in Options menu: "Arrow Style: Orthogonal / Curved"
- Default to curved for cleaner visual appearance
- Keep orthogonal as option for more formal BPMN look

#### 9.6 Arrow Hover Effects
Add visual feedback when hovering over arrows:

- Arrow stroke-width increases from 2px to 3px on hover
- Arrow color brightens slightly
- Arrow label becomes more opaque
- Cursor changes to pointer
- Show tooltip with connection metadata (from → to, type, label)

#### 9.7 Connection Animation
Add subtle flow animation on arrows to indicate direction:

- Small animated dots flowing along the arrow path (using SVG `animateMotion`
  or CSS dashes animation)
- Only when "flow animation" is enabled (toggle in options)
- Speed indicates SLA/duration if available
- Disabled by default to avoid distraction

---

## Agent 9-C: Section Groups & Overall Polish

### Tasks

#### 9.8 Process Group Section Styling (from inspiration2.png)
Improve process group containers to match the colored sections style:

- Full-width colored background band for the section
- Section header with bold white text on colored bar
- Configurable section colors (different from lane colors):
  - Default palette: red, green, blue, yellow, purple
- Content area has subtle tinted background (10% opacity of section color)
- Border: none (color band is sufficient visual separator)
- Collapsed state: thin colored bar with arrow + name

#### 9.9 Grid & Background Refinement
Improve the canvas background:

- Dot grid: smaller dots (1px), lighter opacity (0.15 instead of current)
- Add optional crosshair grid lines at 100px intervals (very faint)
- Canvas edge: subtle vignette/fade at edges
- Background color: slightly warmer dark tone (#0f172a instead of pure dark)

#### 9.10 Typography & Readability
Improve text rendering across the diagram:

- Node labels: 13px, font-weight 600 (semi-bold)
- Lane headers: 14px, font-weight 700 (bold), letter-spacing 0.5px
- Decision labels (Yes/No): 11px, font-weight 500, slightly transparent
- Annotation text: 11px, italic, muted color
- Use system font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Ensure all text has adequate contrast ratio (WCAG AA)

#### 9.11 Toolbar & Panel Visual Polish
Refine the editor toolbar and panels:

- Toolbar buttons: consistent sizing (28px height), subtle rounded corners
- Active state: filled background instead of just border
- Icon buttons: use SVG icons instead of unicode characters where possible
- Panel headers: consistent height (36px), semi-bold text
- Smooth panel open/close transitions (150ms)

#### 9.12 Color Theme Refinement
Polish the dark and light themes:

- Dark theme: richer, deeper colors (not just gray)
  - Background: #0f172a (slate-900)
  - Cards: #1e293b (slate-800)
  - Borders: #334155 (slate-700)
  - Text: #e2e8f0 (slate-200)
- Light theme: clean whites with blue accents
  - Background: #f8fafc (slate-50)
  - Cards: #ffffff
  - Borders: #e2e8f0 (slate-200)
  - Text: #1e293b (slate-800)
- Ensure all new elements (ports, badges, overlays) theme correctly

---

## Acceptance Criteria
- [ ] Task nodes render as cards with shadow + accent bar
- [ ] Node type icons visible inside nodes
- [ ] Subtitle text shows description/duration/owner when available
- [ ] "+" port buttons appear on hover for connection creation
- [ ] Curved arrow routing option available and working
- [ ] Arrow hover effects (width, brightness, tooltip)
- [ ] Process groups styled as colored sections
- [ ] Grid background refined (smaller dots, lighter)
- [ ] Typography improved across all text elements
- [ ] Dark/light themes both polished
- [ ] All existing tests still pass

---

## Verification Agent Prompt

```
You are a verification agent. After Chapter 9 is complete:

1. Load any diagram — verify task nodes have card shadow + accent bar
2. Check node icons are visible (clipboard for task, ? for gateway, etc.)
3. Add a node with description — verify subtitle appears
4. Hover a node — verify "+" port buttons appear
5. Toggle Options → Arrow Style → Curved — verify smooth bezier arrows
6. Hover an arrow — verify width increases + tooltip shows
7. Check process groups — verify colored section styling
8. Toggle light theme — verify all elements theme correctly
9. Check text sizes and weights match spec
10. Run all Playwright tests — verify no regressions
```
