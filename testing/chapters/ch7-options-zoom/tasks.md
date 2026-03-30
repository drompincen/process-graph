# CH-T7 — Options, Theme & Zoom
**Agents:** H1 (options + theme), H2 (zoom presets) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T28 | Run 12-options.spec.js — full pass | H1 | ⬜ | J12: 8 stories |
| T29 | Fix any options/theme failures | H1 | ⬜ | Needs T28 |
| T30 | Run 13-zoom.spec.js — full pass | H2 | ⬜ | J13: 7 stories |
| T31 | Fix any zoom/viewBox failures | H2 | ⬜ | Needs T30 |

---

## Agent H1 — Options & Theme (T28 + T29)

### T28 — Run 12-options.spec.js

```bash
cd testing
npx playwright test tests/12-options.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J12-S1 | Options button click → menu visible | `#options-menu` visible |
| J12-S2 | Click outside → menu closes | `#options-menu` hidden |
| J12-S3 | Light Theme checkbox → `body.light-theme` | class present |
| J12-S4 | Uncheck Light Theme → class removed | class absent |
| J12-S5 | Notes checkbox toggles `#notebook` | shows then hides |
| J12-S6 | JSON Editor checkbox toggles `#editor-pane` | shows then hides |
| J12-S7 | A+/A− font buttons update font-scale var | scale increases / decreases |
| J12-S8 | Light theme changes SVG background | computed bg-color differs from dark |

**Progress reporting:**
```
[T28 ▶ 0:00] Clicking options button…
[T28 ▶ 0:10] J12-S1 PASS (menu visible). Clicking outside…
[T28 ▶ 0:15] J12-S2 PASS (menu hidden). Testing light theme…
[T28 ▶ 0:25] J12-S3 PASS (light-theme class). J12-S4 PASS (removed).
[T28 ▶ 0:35] J12-S5 PASS (notebook toggles). J12-S6 PASS (editor toggles).
[T28 ✓ 0:50] J12-S7 PASS. J12-S8 PASS. 8/8. T28 → ✅
```

### T29 — Fix failures from T28

| Failure | Root cause | Fix |
|---------|-----------|-----|
| J12-S1: menu not showing | `#btn-options` click handler not wired | Check `initOptionsMenu()` in interactions.js — toggles `optionsMenu.style.display` |
| J12-S2: menu not closing on outside click | Document click listener not checking target | Verify `document.addEventListener('click', ...)` checks `!optionsMenu.contains(e.target)` |
| J12-S3: `light-theme` not added | `#chk-light-mode` change handler missing | Check interactions.js `initOptionsMenu` — `document.body.classList.toggle('light-theme', chkLight.checked)` |
| J12-S5: notebook not showing | `#chk-show-notes` not wired to `#notebook` | Check initOptionsMenu — `chkNotes.addEventListener('change', () => notebook.style.display = chkNotes.checked ? '' : 'none')` |
| J12-S7: font-scale var not updating | Font buttons wired but no `setProperty` | Check btn-font-larger handler — `document.documentElement.style.setProperty('--narrative-font-scale', state.fontScale)` |

**Note on J12-S7:** The test checks `document.documentElement.style.getPropertyValue('--narrative-font-scale')`.
This only works if the property is set via `style.setProperty` not via a CSS rule. Verify the implementation
uses inline style on `documentElement`, not a class-based approach.

**Progress reporting:**
```
[T29 ▶ 0:00] J12-S7 failing: CSS var not set. Checking font-larger handler…
[T29 ▶ 0:10] Handler calls state.fontScale++ but not setProperty. Adding setProperty…
[T29 ✓ 0:20] 8/8 passing. T29 → ✅
```

---

## Agent H2 — Zoom Presets (T30 + T31)

### T30 — Run 13-zoom.spec.js

```bash
cd testing
npx playwright test tests/13-zoom.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J13-S1 | Fit active by default | `#btn-zoom-fit.active` on load |
| J13-S2 | Click HD → SVG viewBox width = 1920 | viewBox `0 0 1920 H` |
| J13-S3 | Click 4K → SVG viewBox width = 3840 | viewBox `0 0 3840 H` |
| J13-S4 | 4K mode → container scrolls horizontally | `scrollWidth > clientWidth` |
| J13-S5 | Click Fit → viewBox width ≤ 1920 | `#btn-zoom-fit.active` |
| J13-S6 | Zoom persists across diagram switch | HD zoom keeps 1920 after changing diagram |
| J13-S7 | Only one zoom button active at a time | `.zoom-btn.active` count = 1 |

**Progress reporting:**
```
[T30 ▶ 0:00] Checking default Fit state…
[T30 ▶ 0:10] J13-S1 PASS (Fit active). Clicking HD…
[T30 ▶ 0:20] J13-S2 PASS (viewBox 1920). Clicking 4K…
[T30 ▶ 0:30] J13-S3 PASS (viewBox 3840). J13-S4 PASS (scrollable).
[T30 ▶ 0:40] J13-S5 PASS (Fit restores). J13-S6 PASS (persists). J13-S7 PASS.
[T30 ✓ 0:50] 7/7 passed. T30 → ✅
```

### T31 — Fix failures from T30

**J13-S1: Fit not active by default:**
- Check `index.html` — `#btn-zoom-fit` must have class `active` in HTML
- Check `main.js` — zoom button wiring should not override the default on load

**J13-S2/S3: viewBox width wrong:**
- `renderer.js renderAll` must read `state.zoomPreset`:
  ```javascript
  if (state.zoomPreset === '4k') svgWidth = 3840;
  else if (state.zoomPreset === '1080p') svgWidth = 1920;
  else svgWidth = svgContainer ? svgContainer.clientWidth || 1200 : 1200;
  ```
- Check `setSvgDimensions` — must set `viewBox="0 0 {layout.totalWidth} {layout.totalHeight}"`
- Verify `layout.totalWidth` equals `svgWidth` passed to `computeLayout`

**J13-S4: no horizontal scroll:**
- `#svg-container` CSS must have `overflow: auto` (already set in `diagram.css`)
- SVG must have explicit `width` attribute matching viewBox width, not `width: 100%`
- Check `setSvgDimensions`:
  ```javascript
  svg.setAttribute('width', layout.totalWidth);   // explicit px width
  svg.setAttribute('viewBox', `0 0 ${layout.totalWidth} ${layout.totalHeight}`);
  ```
  If SVG only has viewBox but no explicit width attribute, the browser scales it to fit and no scroll occurs.

**J13-S6: zoom not persisting:**
- Check main.js zoom button handler sets `state.zoomPreset` before diagram reload
- Verify `loadDiagramFile` calls `renderAll(graph)` which reads the current `state.zoomPreset`
- If `discoverDiagrams` resets state, move `state.zoomPreset` init to before that call

**Fix for setSvgDimensions — critical for J13-S4:**
```javascript
// In renderer.js setSvgDimensions:
export function setSvgDimensions(layout) {
  const svg = document.getElementById('diagram-svg');
  if (!svg) return;
  svg.setAttribute('viewBox', `0 0 ${layout.totalWidth} ${layout.totalHeight}`);
  // Set explicit pixel width so fixed-preset modes trigger scroll
  if (state.zoomPreset === 'fit') {
    svg.style.width = '100%';
    svg.removeAttribute('width');
  } else {
    svg.style.width = '';
    svg.setAttribute('width', layout.totalWidth);
  }
  svg.setAttribute('height', layout.totalHeight);
}
```

**Progress reporting:**
```
[T31 ▶ 0:00] J13-S4 failing: no horizontal scroll. Checking SVG width attribute…
[T31 ▶ 0:10] setSvgDimensions sets viewBox but not explicit width attr. Browser scales to fit. Adding setAttribute('width'…)…
[T31 ▶ 0:20] Also need to import state in renderer.js for zoomPreset check. Already imported. Fix applied.
[T31 ✓ 0:30] 7/7 passing. T31 → ✅
```

---

## Outputs

- [ ] `12-options.spec.js` — 8/8 passing on chromium
- [ ] `13-zoom.spec.js` — 7/7 passing on chromium
- [ ] Screenshot at 4K zoom showing full-width SVG with scrollbar
- [ ] Screenshot at HD showing 1920px layout
- [ ] Light theme screenshot confirming `body.light-theme` styling applied

## Chapter Complete When

T28 and T30 both show ✅. Update CHAPTERS.md CH-T7 → ✅ Done.
