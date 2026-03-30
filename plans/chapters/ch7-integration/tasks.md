# CH7 — Integration: process-graph as a seamless feature of archviz

## Strategy

**archviz is the host. process-graph is an embedded mode.**

```
┌─────────────────────────────────────────────────────────┐
│  ARCHVIZ HEADER  [Architecture] [Process]  ⚙ Options   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Architecture mode (existing):  canvas/zones/nodes     │
│   ─────────────────────────────────────────────────     │
│   Process mode (new):  SVG swimlanes, before/after      │
│                                                         │
└─────────────────────────────────────────────────────────┘
              ▲ one Spring Boot server, one URL
```

**Single backend** — ArchViz.java serves both frontends.
**Single header** — mode toggle button switches canvas sections.
**Single diagram dropdown** — shows architecture diagrams in arch mode, process diagrams in process mode.
**Shared theme** — process-graph CSS vars remapped to archviz's palette.
**URL deep-linking** — `?mode=process&diagram=order-approval.json`

---

## Execution Windows (max parallelism)

```
Window 1 (sequential):
  T30 ─── Backend: ArchViz.java extension

Window 2 (3 agents in parallel, all unblock on T30):
  T31 ─── archviz HTML: mode switcher + process panel shell
  T32 ─── process-graph: embedded mode (headless variant)
  T33 ─── CSS bridge: theme alignment

Window 3 (3 agents in parallel, unblock on T31+T32+T33):
  T34 ─── JS bridge: archviz data-loading.js switches to PG modules
  T35 ─── Diagram selector: unified dropdown per mode
  T36 ─── URL routing: ?mode=process&diagram=X deep links

Window 4 (sequential):
  T37 ─── Integration polish + acceptance tests
```

---

## Task Table

| ID  | Task | Agent | Status | Blocked by |
|-----|------|-------|--------|------------|
| T30 | ArchViz.java — serve PG assets + `/api/process-diagrams` | H1 | ⬜ | — |
| T31 | archviz HTML — mode switcher + process canvas mount point | H2 | ⬜ | T30 |
| T32 | process-graph — embedded/headless mode (`?embedded=true`) | H3 | ⬜ | T30 |
| T33 | CSS bridge — remap PG vars to archviz theme | H4 | ⬜ | T30 |
| T34 | JS bridge — archviz loader initialises PG modules on mode switch | H2 | ⬜ | T31+T32 |
| T35 | Diagram selector — unified dropdown, mode-aware | H3 | ⬜ | T31+T32 |
| T36 | URL routing — `?mode=` deep links in archviz | H5 | ⬜ | T31+T32 |
| T37 | Integration polish — transitions, smoke tests, final README | H1 | ⬜ | T34+T35+T36 |

**Total: 8 tasks, 5 agents, 4 windows**

---

## T30 — ArchViz.java: serve process-graph assets + API

**File:** `/mnt/c/Users/drom/IdeaProjects/archviz/ArchViz.java`

**Static serving — add process-graph as a path prefix:**

Change the `main()` static-locations to also serve process-graph's files under `/process/`:

```java
// Serve archviz's own static files + process-graph's files under /process/
System.setProperty("spring.web.resources.static-locations",
    "file:src/main/resources/static/," +
    "classpath:/static/");
```

Add a new MVC resource handler for `/process/**` pointing to the process-graph directory:

```java
@Bean
public WebMvcConfigurer processGraphStaticResources() {
    return new WebMvcConfigurer() {
        @Override
        public void addResourceHandlers(ResourceHandlerRegistry registry) {
            // Serve process-graph frontend at /process/
            registry.addResourceHandler("/process/**")
                    .addResourceLocations("file:../process-graph/");
        }
    };
}
```

This means:
- `http://localhost:8080/process/index.html` → process-graph's index.html
- `http://localhost:8080/process/js/main.js` → process-graph's js/main.js
- `http://localhost:8080/process/sample/order-approval.json` → process-graph's samples

**New endpoint — `/api/process-diagrams`:**

```java
@GetMapping("/api/process-diagrams")
public List<Map<String, String>> listProcessDiagrams() throws IOException {
    List<Map<String, String>> result = new ArrayList<>();
    var resolver = new PathMatchingResourcePatternResolver();

    // Look for JSONs in process-graph's sample/ directory
    for (String pattern : new String[]{
            "file:../process-graph/sample/*.json",
            "file:src/main/resources/static/process-graph/*.json"}) {
        try {
            for (Resource r : resolver.getResources(pattern)) {
                String filename = r.getFilename();
                if (filename == null) continue;
                try (var is = r.getInputStream()) {
                    JsonNode root = objectMapper.readTree(is);
                    String label = root.path("title").asText(filename);
                    result.add(Map.of("file", filename, "label", label));
                } catch (IOException ignored) {}
            }
        } catch (IOException ignored) {}
    }
    log.info("GET /api/process-diagrams → {} diagrams", result.size());
    return result;
}
```

**Update startup banner** to include process-graph URL:
```java
log.info("  Process:  http://localhost:{}/process/index.html", port);
log.info("  Process API: http://localhost:{}/api/process-diagrams", port);
```

**Dependencies needed:** Add `WebMvcConfigurer` import — already in Spring Boot starter, no new deps.

---

## T31 — archviz HTML: mode switcher + process canvas mount

**File:** `/mnt/c/Users/drom/IdeaProjects/archviz/src/main/resources/static/collab-animation.html`

**Add mode toggle buttons to the header** (after existing diagram selector, before playback controls):

```html
<!-- Mode switcher — Architecture vs Process -->
<div id="mode-group" class="mode-group">
  <button id="btn-mode-arch"    class="mode-btn active" data-mode="architecture">⬡ Architecture</button>
  <button id="btn-mode-process" class="mode-btn"         data-mode="process">⬜ Process</button>
</div>
<div class="h-divider"></div>
```

**Add process-graph mount point** (sibling of existing `#center-stage`):

```html
<!-- Process Graph view (hidden until mode switch) -->
<div id="process-view" style="display:none; flex:1; overflow:hidden;">
  <iframe
    id="process-frame"
    src="/process/index.html?embedded=true"
    style="width:100%; height:100%; border:none;"
    title="Process Graph"
  ></iframe>
</div>
```

The iframe approach gives **complete isolation** — process-graph runs its own JS/CSS without any conflict with archviz's globals.

**Mode switch logic** (add to `ui-interactions.js` or inline script):

```javascript
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const archView  = document.getElementById('center-stage');
    const procView  = document.getElementById('process-view');
    const isProcess = mode === 'process';

    archView.style.display  = isProcess ? 'none' : '';
    procView.style.display  = isProcess ? 'flex' : 'none';

    // Sync URL
    const url = new URL(location.href);
    url.searchParams.set('mode', mode);
    history.replaceState({}, '', url);
  });
});

// Restore mode from URL on load
const urlMode = new URLSearchParams(location.search).get('mode');
if (urlMode === 'process') {
  document.getElementById('btn-mode-process')?.click();
}
```

**CSS for mode buttons** (add to archviz `core.css`):

```css
.mode-group { display: flex; gap: 2px; }
.mode-btn {
  background: transparent;
  border-color: var(--border-color, #3e3e42);
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-main, #d4d4d4);
}
.mode-btn.active {
  background: var(--accent-color, #007acc);
  border-color: var(--accent-color, #007acc);
  color: #fff;
}
```

---

## T32 — process-graph: embedded/headless mode

**File:** `/mnt/c/Users/drom/IdeaProjects/process-graph/index.html`
**File:** `/mnt/c/Users/drom/IdeaProjects/process-graph/js/main.js`

When the iframe loads with `?embedded=true`, process-graph hides its own header so archviz's header is the only chrome visible.

**In `index.html`** — add a body class on load:

```html
<script>
  if (new URLSearchParams(location.search).get('embedded') === 'true') {
    document.documentElement.classList.add('embedded');
  }
</script>
```

**In `core.css`** — hide header in embedded mode:

```css
html.embedded #header { display: none; }
html.embedded body {
  height: 100vh;
  overflow: hidden;
}
html.embedded #app-body {
  height: 100vh;
}
```

**In `main.js`** — when embedded, load diagrams from archviz's API instead of own backend:

```javascript
async function discoverDiagrams() {
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';

  // When embedded in archviz, use archviz's API (reachable via same origin)
  const apiUrl = isEmbedded ? '/api/process-diagrams' : '/api/diagrams';

  const fallback = [
    { file: 'order-approval.json',  label: 'Order Approval Process' },
    { file: 'ticket-triage.json',   label: 'Ticket Triage' },
    { file: 'onboarding.json',      label: 'Employee Onboarding' },
  ];
  // ... rest of discoverDiagrams unchanged
}
```

**Also update `loadDiagramFile`** to use correct path prefix when embedded:

```javascript
export async function loadDiagramFile(filename) {
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';
  const prefix = isEmbedded ? '/process/sample/' : 'sample/';
  const res = await fetch(`${prefix}${filename}`);
  // ...
}
```

---

## T33 — CSS bridge: align process-graph theme to archviz

**New file:** `/mnt/c/Users/drom/IdeaProjects/process-graph/css/archviz-bridge.css`

This file is included **only when embedded** (injected by the `?embedded=true` init script):

```css
/*
 * archviz-bridge.css — Override process-graph CSS vars to match archviz theme.
 * Injected only when running embedded inside archviz (embedded=true).
 */
:root {
  /* Background — archviz uses #1e1e1e (VS Code dark), PG uses #0f1117 */
  --bg-main:    #1e1e1e;
  --bg-surface: #252526;
  --bg-panel:   #252526;
  --bg-elevated:#2d2d2d;

  /* Borders */
  --border-dim: #3e3e42;
  --border-mid: #3e3e42;
  --border-hi:  #555;

  /* Text — archviz uses #d4d4d4 */
  --text-main:  #d4d4d4;
  --text-mid:   #9d9d9d;
  --text-dim:   #6e6e6e;

  /* Accent — archviz uses #007acc (VS Code blue), PG uses #3b82f6 */
  --accent:       #007acc;
  --accent-green: #4ec9b0;   /* VS Code teal */
  --accent-red:   #f14c4c;
  --accent-amber: #ce9178;   /* VS Code orange */

  /* Fonts — archviz uses Segoe UI + Consolas */
  --font-ui:   'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Consolas', 'Courier New', monospace;
}
```

**Inject this stylesheet in `index.html`** when embedded:

```javascript
// In the inline <script> that checks for ?embedded=true:
if (new URLSearchParams(location.search).get('embedded') === 'true') {
  document.documentElement.classList.add('embedded');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/process/css/archviz-bridge.css';
  document.head.appendChild(link);
}
```

---

## T34 — JS bridge: archviz loader initialises process-graph modules on mode switch

**File:** `/mnt/c/Users/drom/IdeaProjects/archviz/src/main/resources/static/js/data-loading.js`

The iframe approach (T31) handles this automatically — the iframe has its own JS context.

However, to allow **message passing** between archviz parent and the process-graph iframe (e.g., sending a diagram to load, receiving events):

```javascript
// In archviz's ui-interactions.js or data-loading.js

// When diagram changes in archviz header while process mode is active:
function notifyProcessFrame(diagram) {
  const frame = document.getElementById('process-frame');
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: 'LOAD_DIAGRAM', filename: diagram.file },
    location.origin
  );
}

// In process-graph's main.js — receive messages from parent:
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === 'LOAD_DIAGRAM') {
    loadDiagramFile(event.data.filename);
  }
});
```

This allows the **shared diagram selector** (T35) to control both views.

---

## T35 — Diagram selector: unified dropdown per mode

**File:** `/mnt/c/Users/drom/IdeaProjects/archviz/src/main/resources/static/js/data-loading.js`

The existing `#json-selector` dropdown populates from `/api/diagrams`.
In process mode, it should switch to `/api/process-diagrams`.

```javascript
let currentMode = 'architecture';

async function populateDiagramSelector(mode) {
  const sel = document.getElementById('json-selector');
  sel.innerHTML = '';

  const apiUrl = mode === 'process' ? '/api/process-diagrams' : '/api/diagrams';
  try {
    const diagrams = await fetch(apiUrl).then(r => r.json());
    diagrams.forEach(({ file, label, title, id }) => {
      const opt = document.createElement('option');
      // Support both archviz format ({ id, title }) and PG format ({ file, label })
      opt.value = file || id;
      opt.textContent = label || title || file || id;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('[selector] Failed to load diagrams:', e);
  }
}

// Re-populate when mode switches
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    populateDiagramSelector(currentMode);
  });
});

// On diagram change:
document.getElementById('json-selector')?.addEventListener('change', e => {
  if (currentMode === 'process') {
    // Tell the process-graph iframe to load this diagram
    const frame = document.getElementById('process-frame');
    frame?.contentWindow?.postMessage(
      { type: 'LOAD_DIAGRAM', filename: e.target.value },
      location.origin
    );
  } else {
    // Existing archviz load logic
    loadDiagram(e.target.value);
  }
});
```

---

## T36 — URL routing: `?mode=process&diagram=X` deep links

**File:** `/mnt/c/Users/drom/IdeaProjects/archviz/src/main/resources/static/js/data-loading.js`

Extend the existing URL param handling:

```javascript
function applyUrlParams() {
  const params = new URLSearchParams(location.search);

  const mode     = params.get('mode');      // 'architecture' | 'process'
  const diagram  = params.get('diagram');   // filename
  const view     = params.get('view');      // 'before'|'after'|'split'|'overlay'
  const story    = params.get('story');     // 'true'

  // Switch mode
  if (mode === 'process') {
    document.getElementById('btn-mode-process')?.click();
  }

  // Load diagram (into the right mode)
  if (diagram) {
    if (mode === 'process') {
      // Will be handled after iframe loads
      const frame = document.getElementById('process-frame');
      frame?.addEventListener('load', () => {
        frame.contentWindow?.postMessage(
          { type: 'LOAD_DIAGRAM', filename: diagram },
          location.origin
        );
        // Pass view mode and story flag too
        if (view) frame.contentWindow?.postMessage({ type: 'SET_VIEW', view }, location.origin);
        if (story === 'true') frame.contentWindow?.postMessage({ type: 'OPEN_STORY' }, location.origin);
      }, { once: true });
    } else {
      loadDiagram(diagram);
    }
  }
}
```

**In process-graph `main.js`** — handle the additional message types:

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const { type, filename, view } = event.data || {};

  if (type === 'LOAD_DIAGRAM' && filename)  loadDiagramFile(filename);
  if (type === 'SET_VIEW'     && view)      { state.viewMode = view; renderAll(state.graph); }
  if (type === 'OPEN_STORY'  && state.graph?.story) initNarrative(state.graph, true);
});
```

**Example deep links that work:**

```
# Open archviz in architecture mode with a specific diagram
http://localhost:8080/?diagram=ai-agent-collab.json

# Open process-graph embedded in archviz, split view
http://localhost:8080/?mode=process&diagram=order-approval.json&view=split

# Open process-graph story mode directly
http://localhost:8080/?mode=process&diagram=order-approval.json&story=true
```

---

## T37 — Integration polish + smoke tests

**Files touched:** archviz core.css, collab-animation.html, README

### Visual polish

1. **Mode button placement** — position the `[Architecture] [Process]` toggle immediately after the brand/logo, before diagram selector (it changes what the selector shows)

2. **Iframe loading state** — show a spinner in `#process-view` while iframe loads:
   ```html
   <div id="process-loading" style="display:flex;align-items:center;justify-content:center;height:100%;color:#d4d4d4">
     Loading Process Graph...
   </div>
   ```
   Hide it on `process-frame` `load` event.

3. **Mode persistence** — store last mode in `localStorage`:
   ```javascript
   localStorage.setItem('lastMode', mode);
   // on init:
   const savedMode = localStorage.getItem('lastMode');
   if (savedMode === 'process') document.getElementById('btn-mode-process')?.click();
   ```

4. **Diagram selector label** — update placeholder text based on mode:
   ```javascript
   sel.setAttribute('title', mode === 'process' ? 'Load process diagram' : 'Load architecture diagram');
   ```

### Smoke test checklist

- [ ] `http://localhost:8080/` loads archviz normally
- [ ] Clicking `Process` mode switches canvas, hides archviz canvas
- [ ] Diagram dropdown repopulates with process diagrams
- [ ] Selecting `Order Approval Process` loads it in the iframe
- [ ] `?mode=process&diagram=order-approval.json` deep link works
- [ ] `?mode=process&view=before` opens in Before view
- [ ] `?mode=process&story=true` opens Story mode
- [ ] Clicking `Architecture` mode switches back, archviz canvas visible
- [ ] Page refresh in process mode stays in process mode (localStorage)
- [ ] Light theme checkbox in archviz options — does it affect iframe? (out of scope for now)

### README update (archviz)

Add section:
```markdown
## Process Diagrams

Switch to **Process** mode via the mode toggle in the header to visualize
BPMN-style business process improvements — swimlanes, before/after diff views,
KPI tracking, and story mode.

**Deep links:**
- Architecture mode: `http://localhost:8080/`
- Process mode: `http://localhost:8080/?mode=process`
- Specific process diagram: `http://localhost:8080/?mode=process&diagram=order-approval.json&view=split`
```

---

## Parallel Execution Guide

### Window 1 — 1 agent
```
H1: T30 (ArchViz.java extension)
    → Adds /process/** static serving + /api/process-diagrams endpoint
    → Duration: ~20 min
    → Unblocks: ALL of Window 2
```

### Window 2 — 3 agents simultaneously
```
H2: T31  archviz HTML mode switcher (collab-animation.html + core.css)
H3: T32  process-graph embedded mode (index.html + main.js + core.css)
H4: T33  CSS bridge (new archviz-bridge.css)
    → All 3 can start the moment T30 completes
    → All 3 touch different files — zero conflicts
```

### Window 3 — 3 agents simultaneously
```
H2: T34  JS bridge (data-loading.js postMessage wiring)
H3: T35  Diagram selector unification (data-loading.js selector logic)
H5: T36  URL routing (?mode= params in data-loading.js)
    → Wait for T31+T32 to complete first
    → T34+T35 both touch data-loading.js — merge carefully OR split into separate functions
    → T36 also touches data-loading.js — agent H5 should coordinate with H2/H3
    ⚠️  CONFLICT RISK: T34, T35, T36 all touch data-loading.js
    → Better: assign one agent (H2) to do T34+T35+T36 sequentially in Window 3
            or split into separate JS files (recommended)
```

### Window 3 revised (safer) — 1 agent
```
H2: T34 + T35 + T36 sequentially (all data-loading.js changes together)
    → 3 tasks, 1 agent, no merge conflicts
```

### Window 4 — 1 agent
```
H1: T37  Polish + smoke tests + README
    → After Window 3 completes
```

---

## File Change Map

| File | Task | Owner |
|------|------|-------|
| `archviz/ArchViz.java` | T30 | H1 |
| `archviz/.../collab-animation.html` | T31 | H2 |
| `archviz/.../css/core.css` | T31 | H2 |
| `process-graph/index.html` | T32 | H3 |
| `process-graph/js/main.js` | T32 | H3 |
| `process-graph/css/core.css` | T32 | H3 |
| `process-graph/css/archviz-bridge.css` (NEW) | T33 | H4 |
| `archviz/.../js/data-loading.js` | T34+T35+T36 | H2 |
| `archviz/README.md` | T37 | H1 |
| `process-graph/README.md` | T37 | H1 |
