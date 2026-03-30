# Agent F — Export + Polish
## SVG Export · PNG Export · PDF Export · Light Theme · Animations · Responsive

**Depends on:** All Phase 2 agents (C1–D3) + Phase 3 agents (E1–E2) complete
**This is the final agent**

---

## Deliverables

| File | Lines est. | Purpose |
|---|---|---|
| `js/export.js` | 180 | SVG serialize, PNG via html2canvas, PDF via jsPDF |
| `css/animations.css` | 60 | Crossfade, diffPulse, slideIn, badge pop-in keyframes |
| (updates to `css/core.css`) | 40 | Light theme overrides, responsive layout, font-size A+/A- |

---

## SVG Export

Self-contained SVG with all CSS inlined into a `<defs><style>` block.
The exported file should render correctly when opened standalone.

```js
export function exportSVG() {
  const svg = dom.diagramSvg.cloneNode(true);

  // Inline all CSS from linked stylesheets into a <style> inside <defs>
  const cssText = [...document.styleSheets]
    .filter(s => { try { return s.cssRules; } catch { return false; } })
    .flatMap(s => [...s.cssRules])
    .map(r => r.cssText)
    .join('\n');

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = cssText;
  svg.querySelector('defs').appendChild(style);

  // Set explicit dimensions and namespace
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', svg.viewBox.baseVal.width);
  svg.setAttribute('height', svg.viewBox.baseVal.height);

  const blob = new Blob(
    ['<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML],
    { type: 'image/svg+xml' }
  );
  triggerDownload(blob, `${state.graph.title || 'process'}.svg`);
}
```

---

## PNG Export

```js
export async function exportPNG() {
  // html2canvas captures the SVG container div at 2× scale for retina
  const canvas = await html2canvas(dom.svgContainer, {
    scale: 2,
    backgroundColor: '#161b27',
    useCORS: true,
    logging: false,
  });
  canvas.toBlob(blob => {
    triggerDownload(blob, `${state.graph.title || 'process'}.png`);
  }, 'image/png');
}
```

---

## PDF Export Modal

Modal with three options (same as archviz):
- **Diagram only** — spatial view (current view mode)
- **Sequence only** — sequence view SVG
- **Both** — diagram + sequence stacked vertically on one PDF

```js
export async function exportPDF(mode) {
  const { jsPDF } = window.jspdf;
  const images = [];

  if (mode === 'diagram' || mode === 'both') {
    const canvas = await html2canvas(dom.svgContainer, { scale: 2, backgroundColor: '#161b27' });
    images.push({ canvas, label: state.graph.title });
  }

  if (mode === 'sequence' || mode === 'both') {
    // Temporarily show sequence view, capture, then restore
    const wasVisible = dom.sequenceContainer.style.display !== 'none';
    dom.sequenceContainer.style.display = 'block';
    const canvas = await html2canvas(dom.sequenceContainer, { scale: 2, backgroundColor: '#161b27' });
    dom.sequenceContainer.style.display = wasVisible ? 'block' : 'none';
    images.push({ canvas, label: 'Sequence View' });
  }

  // Determine orientation and page size
  const totalH = images.reduce((sum, img) => sum + img.canvas.height, 0);
  const orientation = totalH > 1200 ? 'portrait' : 'landscape';
  const pdf = new jsPDF({ orientation, unit: 'px', format: 'a4' });

  let y = 0;
  images.forEach(({ canvas, label }, i) => {
    if (i > 0) { pdf.addPage(); y = 0; }
    const pdfW = pdf.internal.pageSize.getWidth();
    const imgW = canvas.width / 2;   // un-scale
    const imgH = canvas.height / 2;
    const scale = pdfW / imgW;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, y, pdfW, imgH * scale);
    y += imgH * scale + 20;
  });

  pdf.save(`${state.graph.title || 'process'}.pdf`);
}
```

---

## Export Modal HTML (in `index.html`)

```html
<div id="modal-export-pdf" class="modal">
  <div class="modal-card">
    <h3>Export PDF</h3>
    <label><input type="radio" name="pdf-mode" value="diagram" checked> Diagram only</label>
    <label><input type="radio" name="pdf-mode" value="sequence"> Sequence view only</label>
    <label><input type="radio" name="pdf-mode" value="both"> Both (stacked)</label>
    <div class="modal-actions">
      <button id="btn-pdf-cancel">Cancel</button>
      <button id="btn-pdf-confirm">Export</button>
    </div>
  </div>
</div>
```

---

## `css/animations.css`

```css
/* View mode crossfade */
@keyframes crossfadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
#nodes-layer, #connections-layer {
  transition: opacity 0.25s ease;
}
.view-transition #nodes-layer,
.view-transition #connections-layer {
  animation: crossfadeIn 0.25s ease;
}

/* Diff pulse (overlay mode, brief pulse when entering overlay) */
@keyframes diffPulse {
  0%   { opacity: 0.3; }
  50%  { opacity: 1; }
  100% { opacity: 1; }
}
.node.diff-added, .node.diff-removed, .node.diff-changed {
  animation: diffPulse 0.6s ease forwards;
}

/* Badge pop-in (already in animation.css, ensure here too) */
@keyframes popIn {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

/* Slide-in (narrative slides) */
@keyframes slideIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Fade in (log entries) */
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Token glow pulse */
@keyframes tokenPulse {
  0%, 100% { r: 7; opacity: 1; }
  50%       { r: 9; opacity: 0.7; }
}
```

---

## Light Theme (additions to `css/core.css`)

All dark SVG fill values must use CSS vars for the SVG to adapt.
However, since SVG `fill` attributes can't use CSS vars directly, light theme
is achieved by:
1. CSS class overrides on `.light-theme [data-node-id] rect` etc.
2. Re-injecting gradient `<defs>` with lighter colors when theme changes.

```css
/* Light theme overrides */
body.light-theme {
  --bg-main:    #f0f4f8;
  --bg-surface: #ffffff;
  --bg-panel:   #e8edf4;
  --bg-elevated:#dde3ec;
  --border-dim: #cbd5e1;
  --border-mid: #94a3b8;
  --border-hi:  #64748b;
  --text-main:  #1e293b;
  --text-mid:   #475569;
  --text-dim:   #64748b;
}

/* Light theme: SVG node fills */
body.light-theme [data-node-id] rect,
body.light-theme [data-node-id] polygon {
  fill: #e8edf4;
  stroke: #94a3b8;
}
body.light-theme [data-node-id] text { fill: #1e293b; }
body.light-theme #diagram-svg { background: #f0f4f8; }

/* Light theme: connection lines */
body.light-theme #connections-layer line,
body.light-theme #connections-layer path {
  stroke: #94a3b8;
}
```

Theme toggle handler (in `interactions.js`):
```js
dom.chkLightMode.addEventListener('change', e => {
  document.body.classList.toggle('light-theme', e.target.checked);
  // Re-inject lane gradients with lighter colors
  reinjectDefs(state.graph, state.layout);
  renderAll(state.graph);
});
```

---

## Font Size Controls (Narrative Mode)

```js
let fontScale = 1.0;

dom.btnFontLarger.addEventListener('click', () => {
  fontScale = Math.min(1.6, fontScale + 0.1);
  dom.narrativeView.style.fontSize = `${fontScale}rem`;
});
dom.btnFontSmaller.addEventListener('click', () => {
  fontScale = Math.max(0.7, fontScale - 0.1);
  dom.narrativeView.style.fontSize = `${fontScale}rem`;
});
```

---

## Responsive Layout

The SVG diagram uses a fixed `viewBox` but the container is responsive:
```css
#svg-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
#diagram-svg {
  min-width: 800px;   /* minimum usable width */
  width: 100%;
  height: auto;
}
```

SVG width is computed dynamically in `layout.js` from rightmost node + padding,
with a minimum of 900px.

---

## URL Parameter Support

```js
// On load, check URL params
const params = new URLSearchParams(location.search);
const processFile = params.get('process');
const storyMode   = params.get('story') === 'true';
const viewMode    = params.get('view') || 'split';

if (processFile) loadDiagramFromFile(processFile);
if (storyMode)   setTimeout(() => showNarrative(), 500);
if (viewMode)    state.viewMode = viewMode;
```

---

## Final Integration Checklist

All agents must work together for these cross-cutting scenarios:

### Scenario 1: Load → View → Diff
- [ ] Load `order-approval.json` via dropdown
- [ ] Split view renders before/after side by side
- [ ] Overlay view shows green/red/amber diff highlights
- [ ] Metrics bar shows before/after delta badges
- [ ] Floating metrics panel toggled open, shows all 6 KPI rows

### Scenario 2: Simulate
- [ ] ▶ Simulate button plays the default sequence
- [ ] Token travels along orthogonal paths
- [ ] Step badges appear on nodes
- [ ] Log pane populates with step entries
- [ ] Popup toast appears for steps with `popup` key
- [ ] FF button skips to end
- [ ] ↺ Replay resets all badges and log

### Scenario 3: Edit + Undo
- [ ] Edit mode enabled via Options checkbox
- [ ] Drag a node → position updates in JSON editor
- [ ] Double-click label → inline edit, Enter saves
- [ ] Ctrl+Z undoes last drag
- [ ] "Update Diagram" re-renders from edited JSON
- [ ] Invalid JSON shows red border + error message

### Scenario 4: Story Mode
- [ ] 📖 Story button visible (story object in JSON)
- [ ] Click → narrative slides open
- [ ] Problem → Vision → Phase 1 → Phase 2 → Phase 3 navigation
- [ ] Arrow keys and Space navigate slides
- [ ] KPI HUD updates per slide
- [ ] Benefits panel visible in phase slides
- [ ] Escape returns to spatial view

### Scenario 5: Export
- [ ] Export SVG → opens standalone in browser
- [ ] Export PNG → 2× retina quality
- [ ] Export PDF → modal with 3 options, correct file saved
- [ ] Download JSON → valid JSON file, round-trips correctly
- [ ] Upload JSON → renders new diagram

### Scenario 6: Sequence View
- [ ] Sequence View checkbox shows/hides sequence SVG
- [ ] All active sequence participants shown as columns
- [ ] Arrows correctly indicate source → target direction
- [ ] Status icons (✓/⏳) on participant headers

### Scenario 7: Light Theme
- [ ] Light theme toggle changes background/text colors
- [ ] SVG nodes adapt to lighter fills
- [ ] All panels (metrics, benefits, notebook) readable in light theme
- [ ] No hard-coded dark colors visible in light mode
