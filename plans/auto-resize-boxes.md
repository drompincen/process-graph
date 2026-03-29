# Auto-Resize Boxes When Font Size Changes

## Problem
When the user increases font size via A+, the text inside node boxes can overflow outside the box boundaries. The boxes need to grow to accommodate larger text.

## Implementation Plan

### Step 1: Detect text overflow after font change
After each A+/A- click:
1. Query all `#nodes-layer [data-node-id]` groups
2. For each node group, get the `<text>` element's rendered bbox
3. Get the `<rect>` element's current width/height
4. If text bbox exceeds rect bounds (with padding), the box needs resizing

### Step 2: Resize rect to fit text
```javascript
function resizeNodesToFitText() {
  const PAD_X = 16; // horizontal padding
  const PAD_Y = 12; // vertical padding

  document.querySelectorAll('#nodes-layer [data-node-id]').forEach(g => {
    const rect = g.querySelector('rect');
    const texts = g.querySelectorAll('text');
    if (!rect || texts.length === 0) return;

    // Get combined text bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    texts.forEach(t => {
      const bb = t.getBBox();
      minX = Math.min(minX, bb.x);
      minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.width);
      maxY = Math.max(maxY, bb.y + bb.height);
    });

    const textW = maxX - minX;
    const textH = maxY - minY;
    const newW = Math.max(parseFloat(rect.getAttribute('width')), textW + 2 * PAD_X);
    const newH = Math.max(parseFloat(rect.getAttribute('height')), textH + 2 * PAD_Y);

    rect.setAttribute('width', newW);
    rect.setAttribute('height', newH);
    // Re-center rect around node center
    rect.setAttribute('x', -newW / 2);
    rect.setAttribute('y', -newH / 2);
  });
}
```

### Step 3: Re-route connections after resize
After resizing boxes, connections need to be re-routed because node bounds changed:
```javascript
resizeNodesToFitText();
updateLayoutBounds(); // recalc layout.nodes from new rect sizes
renderConnections();  // re-route all arrows with new bounds
```

### Step 4: Add to font change handler
In the `wireFontControls()` function in index.html, after `adjustFontSize()`:
```javascript
adjustFontSize(delta);
resizeNodesToFitText();
// Trigger re-render of connections
```

### Step 5: QA checks to add
Add to 08-qa-phase-audit.spec.js:
- `checkTextWithinBounds(boxes)` — verify no text extends beyond its node rect
- Test at default font, font+3, font-2

### Step 6: QA closed loop
1. Run audit at default font → should pass
2. Click A+ 3 times → run audit → boxes should have grown
3. Click A- 5 times → run audit → boxes should have shrunk (to minimum)
4. Fix any overflow issues
5. Repeat until clean at all font sizes

## Files to modify
- `index.html` — wireFontControls() + resizeNodesToFitText()
- `js/renderer.js` — export updateLayoutBounds or similar
- `testing/tests/08-qa-phase-audit.spec.js` — add text-overflow check

## Execution
Single agent: implement resize logic → add QA check → run closed loop
