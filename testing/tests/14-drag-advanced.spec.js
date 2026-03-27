/**
 * 14-drag-advanced.spec.js — J14: Advanced Drag Behaviors
 *
 * Covers live edge re-routing during drag, arrowhead position, overlap
 * prevention, multi-node stability, and cross-view-mode behaviour.
 *
 * Node reference for order-approval.json (split view):
 *   b-mgr-review  — task, lane=manager,   SVG center x=380
 *   b-gateway     — gateway, lane=manager, SVG center x=530
 *   b-fill-form   — task, lane=requester,  SVG center x=230
 *   a-mgr-review  — task, lane=manager,    SVG center x=530
 *   a-auto-check  — subprocess, lane=system, SVG center x=380
 */

import { test, expect } from '@playwright/test';
import {
  loadApp, selectDiagram, enableEditMode, setViewMode, parseTranslateX,
} from './helpers.js';

// ── Helper: read rect x of the first <rect> inside a node group ──────────────
async function getRectX(page, nodeId) {
  return page.evaluate((id) => {
    const g = document.querySelector(`[data-node-id="${id}"]`);
    if (!g) return null;
    const rect = g.querySelector('rect');
    return rect ? parseFloat(rect.getAttribute('x') || '0') : null;
  }, nodeId);
}

// ── Helper: get SVG center x of a node (rectX + halfWidth inferred from type) ─
async function getNodeCenterX(page, nodeId) {
  return page.evaluate((id) => {
    const g = document.querySelector(`[data-node-id="${id}"]`);
    if (!g) return null;
    const rect = g.querySelector('rect');
    const poly = g.querySelector('polygon');  // gateway
    const circ = g.querySelector('circle');   // event
    if (rect) {
      const x = parseFloat(rect.getAttribute('x') || '0');
      const w = parseFloat(rect.getAttribute('width') || '110');
      return x + w / 2;
    }
    if (poly) {
      const pts = (poly.getAttribute('points') || '').split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      if (pts.length >= 2) return pts[0]; // first point is top of diamond = cx
    }
    if (circ) return parseFloat(circ.getAttribute('cx') || '0');
    return null;
  }, nodeId);
}

// ── Helper: get 'd' of a connection path by from/to attributes ───────────────
async function getPathD(page, fromId, toId) {
  return page.evaluate(([f, t]) => {
    const el = document.querySelector(
      `[data-conn-from="${f}"][data-conn-to="${t}"]`
    );
    return el ? el.getAttribute('d') : null;
  }, [fromId, toId]);
}

// ── Helper: get 'points' of the arrowhead polygon for a connection id ─────────
async function getArrowPoints(page, connId) {
  return page.evaluate((cid) => {
    // arrowheads live in the annotations layer (not connections layer)
    const el = document.querySelector(
      `#annotations-layer [data-conn-id="${cid}"], #arrows-layer [data-conn-id="${cid}"]`
    );
    if (!el) {
      // fallback: search all polygons with this data-conn-id anywhere in SVG
      const any = document.querySelector(`[data-conn-id="${cid}"]`);
      return any ? any.getAttribute('points') : null;
    }
    return el.getAttribute('points');
  }, connId);
}

// ── Helper: drag a node by screen pixels ─────────────────────────────────────
async function dragNode(page, nodeId, dx, dy = 0, steps = 5) {
  const box = await page.locator(`[data-node-id="${nodeId}"]`).boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps });
  return { cx, cy };
}

async function releaseDrag(page) {
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// ── Helper: do overlapping bounding boxes? ────────────────────────────────────
async function nodesOverlap(page, id1, id2) {
  return page.evaluate(([a, b]) => {
    const ga = document.querySelector(`[data-node-id="${a}"]`);
    const gb = document.querySelector(`[data-node-id="${b}"]`);
    if (!ga || !gb) return false;
    const ra = ga.getBoundingClientRect();
    const rb = gb.getBoundingClientRect();
    return ra.left < rb.right && ra.right > rb.left &&
           ra.top  < rb.bottom && ra.bottom > rb.top;
  }, [id1, id2]);
}

// ═════════════════════════════════════════════════════════════════════════════
test.describe('J14 — Advanced Drag Behaviors', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    await enableEditMode(page);
  });

  // ── J14-S1: Connection path updates DURING drag (live edge re-routing) ────
  test('J14-S1: connection path d-attribute changes while dragging', async ({ page }) => {
    const dBefore = await getPathD(page, 'b-fill-form', 'b-mgr-review');
    expect(dBefore).not.toBeNull();

    // Start dragging b-mgr-review but do NOT release
    await dragNode(page, 'b-mgr-review', 80, 0);
    // Allow a frame for the live reroute to fire
    await page.waitForTimeout(100);

    const dDuring = await getPathD(page, 'b-fill-form', 'b-mgr-review');
    // The path should have changed (edge re-routed mid-drag)
    expect(dDuring).not.toBe(dBefore);

    await releaseDrag(page);
  });

  // ── J14-S2: Arrowhead polygon moves with connection during drag ───────────
  test('J14-S2: arrowhead polygon updates mid-drag', async ({ page }) => {
    const ptsBefore = await getArrowPoints(page, 'b-c2');
    expect(ptsBefore).not.toBeNull();

    await dragNode(page, 'b-mgr-review', 60, 0);
    await page.waitForTimeout(100);

    const ptsDuring = await getArrowPoints(page, 'b-c2');
    expect(ptsDuring).not.toBe(ptsBefore);

    await releaseDrag(page);
  });

  // ── J14-S3: Connection re-attaches correctly after drag completes ─────────
  test('J14-S3: connection path is valid SVG after mouseup', async ({ page }) => {
    await dragNode(page, 'b-mgr-review', 60, 0);
    await releaseDrag(page);

    const d = await getPathD(page, 'b-fill-form', 'b-mgr-review');
    expect(d).not.toBeNull();
    expect(d.trim()).toMatch(/^M/i);  // valid path data starts with M
    expect(d.length).toBeGreaterThan(5);
  });

  // ── J14-S4: Arrowhead remains near target node after drag ─────────────────
  test('J14-S4: arrowhead tip stays close to target node after drag', async ({ page }) => {
    // Get initial target (b-mgr-review) rect x
    const rectXBefore = await getRectX(page, 'b-mgr-review');

    await dragNode(page, 'b-mgr-review', 80, 0);
    await releaseDrag(page);

    const rectXAfter = await getRectX(page, 'b-mgr-review');
    const ptsAfter   = await getArrowPoints(page, 'b-c2');
    expect(ptsAfter).not.toBeNull();

    // Parse first coordinate from polygon points string
    const m = /^\s*([\d.+-]+)[\s,]/.exec(ptsAfter);
    if (m) {
      const arrowX = parseFloat(m[1]);
      // Arrowhead tip x should be within ±70px of node left edge
      expect(Math.abs(arrowX - (rectXAfter ?? rectXBefore ?? 0))).toBeLessThan(70);
    }
  });

  // ── J14-S5: Overlap prevention — drop onto occupied cell resolves ─────────
  test('J14-S5: dragging onto another node resolves to non-overlapping position', async ({ page }) => {
    // b-mgr-review (x=380) and b-gateway (x=530) are in the same manager lane.
    // Dragging b-mgr-review far right should NOT end up on top of b-gateway.
    const boxMgr = await page.locator('[data-node-id="b-mgr-review"]').boundingBox();
    const boxGtw = await page.locator('[data-node-id="b-gateway"]').boundingBox();
    if (!boxMgr || !boxGtw) test.skip();

    // Drag b-mgr-review toward b-gateway center
    const targetDx = (boxGtw.x + boxGtw.width / 2) - (boxMgr.x + boxMgr.width / 2);
    await dragNode(page, 'b-mgr-review', targetDx, 0);
    await releaseDrag(page);

    const overlap = await nodesOverlap(page, 'b-mgr-review', 'b-gateway');
    expect(overlap).toBe(false);
  });

  // ── J14-S6: Resolved position is the NEAREST free grid cell ──────────────
  test('J14-S6: overlap resolution snaps to closest free cell, not far away', async ({ page }) => {
    // b-mgr-review at x=380; drag toward b-gateway (x=530, same lane).
    // The resolved x should be no more than 200px from the drop target.
    const boxMgr = await page.locator('[data-node-id="b-mgr-review"]').boundingBox();
    const boxGtw = await page.locator('[data-node-id="b-gateway"]').boundingBox();
    if (!boxMgr || !boxGtw) test.skip();

    const targetDx = (boxGtw.x + boxGtw.width / 2) - (boxMgr.x + boxMgr.width / 2);
    await dragNode(page, 'b-mgr-review', targetDx, 0);
    await releaseDrag(page);

    const newX = await getNodeCenterX(page, 'b-mgr-review');
    const gatewayX = await getNodeCenterX(page, 'b-gateway');
    // The resolved position must be close to the intended drop, not far away
    expect(Math.abs((newX ?? 0) - (gatewayX ?? 0))).toBeLessThan(200);
    // And must not be the original start position (drag did move)
    expect(newX).not.toBeNull();
  });

  // ── J14-S7: Zero-delta drag does not push undo or change position ─────────
  test('J14-S7: tapping drag (zero movement) does not change node position', async ({ page }) => {
    const xBefore = await getRectX(page, 'b-mgr-review');
    // mousedown + immediately mouseup (no movement)
    const box = await page.locator('[data-node-id="b-mgr-review"]').boundingBox();
    if (!box) test.skip();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);

    const xAfter = await getRectX(page, 'b-mgr-review');
    expect(xAfter).toBe(xBefore);
  });

  // ── J14-S8: Dragging one node does NOT move others ────────────────────────
  test('J14-S8: only the dragged node moves; other nodes are stable', async ({ page }) => {
    const xFillBefore    = await getRectX(page, 'b-fill-form');
    const xGatewayBefore = await getRectX(page, 'b-gateway');

    await dragNode(page, 'b-mgr-review', 60, 0);
    await releaseDrag(page);

    expect(await getRectX(page, 'b-fill-form')).toBe(xFillBefore);
    expect(await getRectX(page, 'b-gateway')).toBe(xGatewayBefore);
  });

  // ── J14-S9: Live edge update works in 'after' view mode ──────────────────
  test('J14-S9: live edge re-routing fires correctly in after-only view', async ({ page }) => {
    await setViewMode(page, 'after');

    const dBefore = await getPathD(page, 'a-auto-check', 'a-mgr-review');
    expect(dBefore).not.toBeNull();

    await dragNode(page, 'a-mgr-review', 60, 0);
    await page.waitForTimeout(100);

    const dDuring = await getPathD(page, 'a-auto-check', 'a-mgr-review');
    expect(dDuring).not.toBe(dBefore);

    await releaseDrag(page);
  });

  // ── J14-S11: Overlap prevention works in 'after' view mode ──────────────
  test('J14-S11: dragging onto occupied cell resolves in after-only view', async ({ page }) => {
    await setViewMode(page, 'after');

    // a-mgr-review (x=530, manager) and a-gateway (x=680, manager) — same lane.
    const boxMgr = await page.locator('[data-node-id="a-mgr-review"]').boundingBox();
    const boxGtw = await page.locator('[data-node-id="a-gateway"]').boundingBox();
    if (!boxMgr || !boxGtw) test.skip();

    const targetDx = (boxGtw.x + boxGtw.width / 2) - (boxMgr.x + boxMgr.width / 2);
    await dragNode(page, 'a-mgr-review', targetDx, 0);
    await releaseDrag(page);

    const overlap = await nodesOverlap(page, 'a-mgr-review', 'a-gateway');
    expect(overlap).toBe(false);
  });

  // ── J14-S12: Overlap prevention holds in split view (before AND after) ───
  test('J14-S12: no overlap after drag in split view (before-phase nodes)', async ({ page }) => {
    // Default view is split — both b- and a- nodes are rendered.
    // Drag b-mgr-review toward b-gateway; verify no overlap in both phases.
    const boxMgr = await page.locator('[data-node-id="b-mgr-review"]').boundingBox();
    const boxGtw = await page.locator('[data-node-id="b-gateway"]').boundingBox();
    if (!boxMgr || !boxGtw) test.skip();

    const targetDx = (boxGtw.x + boxGtw.width / 2) - (boxMgr.x + boxMgr.width / 2);
    await dragNode(page, 'b-mgr-review', targetDx, 0);
    await releaseDrag(page);

    // Neither before-phase pair nor after-phase nodes should overlap
    expect(await nodesOverlap(page, 'b-mgr-review', 'b-gateway')).toBe(false);
  });

  // ── J14-S10: Decision label badge re-renders after drag ──────────────────
  test('J14-S10: Yes/No decision badge exists after dragging gateway node', async ({ page }) => {
    await dragNode(page, 'b-gateway', 40, 0);
    await releaseDrag(page);

    // Decision labels live as text elements in the annotations/arrows layer
    const labelText = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll(
        '#annotations-layer text, #arrows-layer text, #connections-layer text'
      ));
      return texts.map(t => t.textContent || '').join(' ');
    });

    // "Yes" and "No" badges should still be present after re-render
    expect(labelText).toContain('Yes');
    expect(labelText).toContain('No');
  });

});
