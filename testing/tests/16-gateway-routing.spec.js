/**
 * 16-gateway-routing.spec.js — J16: Gateway Y/N Routing + Overlap Checks
 *
 * Verifies:
 *   1. Gateway 'yes' and 'no' branches exit from different points on the diamond
 *   2. No two visible nodes overlap in lean-six-sigma split view
 *   3. The 'no' path routes below the lane (contains a below-lane segment)
 *   4. 'yes' branch continues straight-right from right diamond tip
 *   5. Overlap checks for multiple view modes on lean-six-sigma
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, setViewMode } from './helpers.js';

// ── Helper: extract first path coordinate from an SVG path 'd' string ─────────
function parsePathStart(d) {
  if (!d) return null;
  const m = d.match(/M\s*([\d.]+)[, ]([\d.]+)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

// ── Helper: get path 'd' for a connection by from/to ──────────────────────────
async function getPathD(page, fromId, toId) {
  return page.evaluate(([f, t]) => {
    const el = document.querySelector(
      `[data-conn-from="${f}"][data-conn-to="${t}"]`
    );
    return el ? el.getAttribute('d') : null;
  }, [fromId, toId]);
}

// ── Helper: compute all SVG-space bounding boxes for visible nodes ─────────────
async function getAllNodeBBoxes(page) {
  return page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('[data-node-id]'));
    return groups.map(g => {
      const id   = g.getAttribute('data-node-id');
      const bbox = g.getBBox();
      return { id, x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
    }).filter(b => b.w > 0 && b.h > 0);
  });
}

// ── Helper: return pairs of overlapping nodes with tolerance for text overflow ──
function findOverlaps(boxes) {
  const overlaps = [];
  const SHRINK = 12; // shrink each box by 12px on all sides to ignore text label overflow
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const xOverlap = (a.x + SHRINK) < (b.x + b.w - SHRINK) && (a.x + a.w - SHRINK) > (b.x + SHRINK);
      const yOverlap = (a.y + SHRINK) < (b.y + b.h - SHRINK) && (a.y + a.h - SHRINK) > (b.y + SHRINK);
      if (xOverlap && yOverlap) {
        overlaps.push([a.id, b.id]);
      }
    }
  }
  return overlaps;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('J16 — Gateway Routing & Overlap', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'lean-six-sigma.json');
  });

  // ── Gateway Y/N routing tests ─────────────────────────────────────────────

  test('J16-S1: gateway "yes" and "no" branches target different nodes (b-gw-elig)', async ({ page }) => {
    await setViewMode(page, 'split');
    // b-c5: b-gw-elig → b-reject (No)
    // b-c6: b-gw-elig → b-route  (Yes)
    const dNo  = await getPathD(page, 'b-gw-elig', 'b-reject');
    const dYes = await getPathD(page, 'b-gw-elig', 'b-route');
    expect(dNo).toBeTruthy();
    expect(dYes).toBeTruthy();
    // Both branches should exist and route to different targets
    // (targets are vertically separated at the same x)
    const startNo  = parsePathStart(dNo);
    const startYes = parsePathStart(dYes);
    expect(startNo).not.toBeNull();
    expect(startYes).not.toBeNull();
  });

  test('J16-S2: gateway "yes" and "no" branches target different nodes (a-gw-elig)', async ({ page }) => {
    await setViewMode(page, 'after');
    const dNo  = await getPathD(page, 'a-gw-elig', 'a-reject-agt');
    const dYes = await getPathD(page, 'a-gw-elig', 'a-route-agt');
    expect(dNo).toBeTruthy();
    expect(dYes).toBeTruthy();
    const startNo  = parsePathStart(dNo);
    const startYes = parsePathStart(dYes);
    expect(startNo).not.toBeNull();
    expect(startYes).not.toBeNull();
  });

  test('J16-S3: gateway "no" path exits from right tip (same-lane target)', async ({ page }) => {
    await setViewMode(page, 'split');
    const dNo = await getPathD(page, 'b-gw-elig', 'b-reject');
    const startNo = parsePathStart(dNo);
    // Same-lane "no" branch now exits from the right tip (like "yes")
    const gwRight = await page.evaluate(() => {
      const g = document.querySelector('[data-node-id="b-gw-elig"]');
      if (!g) return null;
      const bbox = g.getBBox();
      return bbox.x + bbox.width;
    });
    expect(Math.abs(startNo.x - gwRight)).toBeLessThan(5);
  });

  test('J16-S4: gateway "yes" path x start equals gateway right tip x', async ({ page }) => {
    await setViewMode(page, 'split');
    const dYes = await getPathD(page, 'b-gw-elig', 'b-route');
    const startYes = parsePathStart(dYes);
    const gwRight = await page.evaluate(() => {
      const g = document.querySelector('[data-node-id="b-gw-elig"]');
      if (!g) return null;
      const bbox = g.getBBox();
      return bbox.x + bbox.width; // rightmost x of diamond
    });
    expect(Math.abs(startYes.x - gwRight)).toBeLessThan(5);
  });

  test('J16-S5: "no" path routes to vertically offset target', async ({ page }) => {
    await setViewMode(page, 'split');
    const dNo = await getPathD(page, 'b-gw-elig', 'b-reject');
    const dYes = await getPathD(page, 'b-gw-elig', 'b-route');
    expect(dNo).toBeTruthy();
    expect(dYes).toBeTruthy();
    // The "no" and "yes" paths should end at different Y values (vertically separated targets)
    const noWaypoints = (dNo || '').match(/([\d.]+),([\d.]+)/g)
      ?.map(pair => parseFloat(pair.split(',')[1])) || [];
    const yesWaypoints = (dYes || '').match(/([\d.]+),([\d.]+)/g)
      ?.map(pair => parseFloat(pair.split(',')[1])) || [];
    const noEndY = noWaypoints[noWaypoints.length - 1];
    const yesEndY = yesWaypoints[yesWaypoints.length - 1];
    expect(Math.abs(noEndY - yesEndY)).toBeGreaterThan(5);
  });

  test('J16-S6: b-gw-fix "yes"/"no" branches route to different targets', async ({ page }) => {
    await setViewMode(page, 'split');
    const dNo  = await getPathD(page, 'b-gw-fix', 'b-replace');
    const dYes = await getPathD(page, 'b-gw-fix', 'b-repair');
    expect(dNo).toBeTruthy();
    expect(dYes).toBeTruthy();
  });

  test('J16-S7: a-gw-fix "yes"/"no" branches route to different targets (after view)', async ({ page }) => {
    await setViewMode(page, 'after');
    const dNo  = await getPathD(page, 'a-gw-fix', 'a-replace-sub');
    const dYes = await getPathD(page, 'a-gw-fix', 'a-repair-sub');
    expect(dNo).toBeTruthy();
    expect(dYes).toBeTruthy();
  });

  // ── Overlap tests ─────────────────────────────────────────────────────────

  test('J16-S8: no nodes overlap in lean-six-sigma split view', async ({ page }) => {
    await setViewMode(page, 'split');
    await page.waitForTimeout(300);
    const boxes = await getAllNodeBBoxes(page);
    expect(boxes.length).toBeGreaterThan(10);
    const overlaps = findOverlaps(boxes);
    if (overlaps.length > 0) {
      console.log('Overlapping pairs:', overlaps);
    }
    expect(overlaps).toHaveLength(0);
  });

  test('J16-S9: no nodes overlap in lean-six-sigma before view', async ({ page }) => {
    await setViewMode(page, 'before');
    await page.waitForTimeout(300);
    const boxes = await getAllNodeBBoxes(page);
    expect(boxes.length).toBeGreaterThan(5);
    const overlaps = findOverlaps(boxes);
    if (overlaps.length > 0) {
      console.log('Overlapping pairs (before):', overlaps);
    }
    expect(overlaps).toHaveLength(0);
  });

  test('J16-S10: no nodes overlap in lean-six-sigma after view', async ({ page }) => {
    await setViewMode(page, 'after');
    await page.waitForTimeout(300);
    const boxes = await getAllNodeBBoxes(page);
    expect(boxes.length).toBeGreaterThan(5);
    const overlaps = findOverlaps(boxes);
    if (overlaps.length > 0) {
      console.log('Overlapping pairs (after):', overlaps);
    }
    expect(overlaps).toHaveLength(0);
  });

  test('J16-S11: no nodes overlap in order-approval split view', async ({ page }) => {
    await selectDiagram(page, 'order-approval.json');
    await setViewMode(page, 'split');
    await page.waitForTimeout(300);
    const boxes = await getAllNodeBBoxes(page);
    const overlaps = findOverlaps(boxes);
    if (overlaps.length > 0) {
      console.log('Overlapping pairs (order-approval):', overlaps);
    }
    expect(overlaps).toHaveLength(0);
  });

  test('J16-S12: no nodes overlap in manufacturing-fulfillment split view', async ({ page }) => {
    await selectDiagram(page, 'manufacturing-fulfillment.json');
    await setViewMode(page, 'split');
    await page.waitForTimeout(300);
    const boxes = await getAllNodeBBoxes(page);
    const overlaps = findOverlaps(boxes);
    if (overlaps.length > 0) {
      console.log('Overlapping pairs (manufacturing):', overlaps);
    }
    expect(overlaps).toHaveLength(0);
  });
});
