# CH-T4 — Edit Mode & JSON Editor
**Agents:** E1 (edit mode), E2 (JSON editor) — parallel
**Blocks:** CH-T8
**Blocked by:** CH-T0

---

## Tasks

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| T16 | Run 06-edit-mode.spec.js — full pass | E1 | ⬜ | J6: 9 stories |
| T17 | Fix any drag/snap/undo failures | E1 | ⬜ | Needs T16 |
| T18 | Run 07-json-editor.spec.js — full pass | E2 | ⬜ | J7: 6 stories |
| T19 | Fix any editor/upload failures | E2 | ⬜ | Needs T18 |

---

## Agent E1 — Edit Mode (T16 + T17)

### T16 — Run 06-edit-mode.spec.js

```bash
cd testing
npx playwright test tests/06-edit-mode.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J6-S1 | Enable edit mode → `body.is-editing` class | `classList.contains('is-editing')` = true |
| J6-S2 | Edit mode → cursor is `grab` on nodes | computed cursor = `grab` |
| J6-S3 | Drag node 40px → transform changes | transform X increases |
| J6-S4 | Drag snaps to 20px grid | final X % 20 = 0 |
| J6-S5 | Ctrl+Z reverts drag | transform returns to original |
| J6-S6 | Double-click shows inline input | `<input type="text">` appears |
| J6-S7 | Type + Enter → SVG label updates | node `<text>` contains new value |
| J6-S8 | Ctrl+Z reverts label change | label returns to original |
| J6-S9 | Disable edit mode → `is-editing` removed | class absent |

**Progress reporting:**
```
[T16 ▶ 0:00] Opening options menu, enabling edit mode…
[T16 ▶ 0:15] J6-S1 PASS (is-editing set). J6-S2 PASS (cursor grab).
[T16 ▶ 0:30] J6-S3 PASS. J6-S4 PASS (snap 20px). J6-S5 PASS (undo).
[T16 ▶ 0:45] J6-S6 PASS (input visible). J6-S7 PASS (label updated). J6-S8 PASS.
[T16 ✓ 0:55] J6-S9 PASS. 9/9 passed. T16 → ✅
```

### T17 — Fix failures from T16

**Key areas to investigate:**

**J6-S1 failing (`is-editing` not set):**
- Open `js/interactions.js`, find `initEditModeToggle()`
- Verify `document.body.classList.toggle('is-editing', chk.checked)` is present (Bug 1 fix)
- If missing, add it:
  ```javascript
  chk.addEventListener('change', () => {
    state.isEditing = chk.checked;
    document.body.classList.toggle('is-editing', chk.checked);
    if (svg) svg.classList.toggle('edit-active', chk.checked);
  });
  ```

**J6-S3/S4 failing (drag not working):**
- Playwright drag uses `page.mouse.move/down/up` — the mousedown handler checks `state.isEditing`
- Verify `state.isEditing` is set to `true` before the drag assertion runs
- Check `nodesLayer.addEventListener('mousedown')` — ensure it's on `#nodes-layer` not `#diagram-svg`
- Note: `[data-node-id]` groups are children of `#nodes-layer` — event delegation should work

**J6-S5 failing (Ctrl+Z doesn't revert):**
- Verify `pushUndo()` is called in the `mouseup` handler BEFORE writing new position
- Check `popUndo()` calls `renderAll` — if renderAll doesn't redraw from `state.graph`, undo won't work visually

**J6-S6 failing (no inline input):**
- `dblclick` on `[data-node-id]` — verify `initInlineLabelEdit()` registers on `nodesLayer`
- Check `state.isEditing` is true when dblclick fires

**Debug with headed mode:**
```bash
npx playwright test tests/06-edit-mode.spec.js --headed --slow-mo=400 \
  --grep "J6-S3" --project=chromium
```

**Progress reporting:**
```
[T17 ▶ 0:00] J6-S3 failing. Checking drag handler…
[T17 ▶ 0:15] mousedown fires but transform not updating. nodesLayer ref is null? Checking dom.nodesLayer…
[T17 ▶ 0:30] Found: initDom registers 'nodes-layer' but drag listens on dom.nodesLayer before initDom runs. Reordering init…
[T17 ✓ 0:40] All 9 passing. T17 → ✅
```

---

## Agent E2 — JSON Editor (T18 + T19)

### T18 — Run 07-json-editor.spec.js

```bash
cd testing
npx playwright test tests/07-json-editor.spec.js --reporter=list --project=chromium
```

**Stories covered:**

| Story | Description | Expected |
|-------|-------------|---------|
| J7-S1 | Enable JSON Editor → pane visible | `#editor-pane` visible |
| J7-S2 | Textarea contains valid JSON | `JSON.parse(value)` succeeds |
| J7-S3 | Edit title + Update → SVG re-renders | SVG header text shows new title |
| J7-S4 | Invalid JSON shows error | `#editor-error` non-empty |
| J7-S5 | Download JSON triggers file download | download event fires, `.json` extension |
| J7-S6 | Upload JSON file → diagram re-renders | node count changes |

**Progress reporting:**
```
[T18 ▶ 0:00] Opening JSON editor pane…
[T18 ▶ 0:15] J7-S1 PASS. J7-S2 PASS (valid JSON). Editing title…
[T18 ▶ 0:25] J7-S3 PASS (title updated in SVG). J7-S4 PASS (error shown).
[T18 ▶ 0:40] J7-S5 PASS (download triggered). Testing upload…
[T18 ✓ 0:55] J7-S6 PASS (2 nodes after upload). 6/6. T18 → ✅
```

### T19 — Fix failures from T18

**J7-S3 failing (title not in SVG after Update):**
- Check `btn-update` click handler in `file-ops.js` — it should call `renderAll(graph)` after parsing
- Verify the new graph's title is rendered by `renderLanes` or `renderMetricsBar`
- Note: title may appear in the `#background-layer` or `#lanes-layer` header text — check both

**J7-S4 failing (no error shown):**
- Check `#editor-error` element exists in HTML
- Check `file-ops.js` — on parse failure, verify `dom.editorError.textContent = err.message`

**J7-S5 failing (download not triggered):**
- `page.waitForEvent('download')` requires the download to happen via `<a download>` or `window.open`
- Check `file-ops.js` `downloadJson()` — verify it creates an `<a>` with `href=blob:` and clicks it
- Playwright catches Blob URL downloads as `download` events

**J7-S6 failing (node count not changing):**
- The test creates a minimal JSON with 2 nodes and uploads it
- Check `initFileOps` file input handler — it should call `parseGraph` + `renderAll` + `initDiff`
- Verify `FileReader.onload` calls `loadDiagramFile` or directly invokes the load pipeline

**Progress reporting:**
```
[T19 ▶ 0:00] J7-S3 failing. Checking renderAll call after Update…
[T19 ▶ 0:15] Found: btn-update calls renderAll but title is read from SVG header which uses graph.title — need to verify graph mutated correctly.
[T19 ✓ 0:25] Title update working. 6/6 passing. T19 → ✅
```

---

## Outputs

- [ ] `06-edit-mode.spec.js` — 9/9 passing on chromium
- [ ] `07-json-editor.spec.js` — 6/6 passing on chromium
- [ ] `body.is-editing` class confirmed via browser trace screenshot
- [ ] Drag snap verified: final position is multiple of 20
- [ ] JSON upload round-trip: minimal diagram renders correctly

## Chapter Complete When

T16 and T18 both show ✅. Update CHAPTERS.md CH-T4 → ✅ Done.
