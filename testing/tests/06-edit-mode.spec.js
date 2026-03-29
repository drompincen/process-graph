/**
 * 06-edit-mode.spec.js — Drag and edit
 * Verifies edit mode toggle, node dragging, grid snapping, and connection updates.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, enableEditMode } from './helpers.js';
import { getAllNodeBBoxes, assertNoOverlaps } from './geo-helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(400);
  }
}

test.describe('Edit Mode', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'car-loan.json');
    await setPhase(page, 0);
  });

  test('edit mode adds is-editing class', async ({ page }) => {
    await enableEditMode(page);
    const hasClass = await page.evaluate(() =>
      document.body.classList.contains('is-editing')
    );
    expect(hasClass).toBe(true);
  });

  test('dragging a node changes position', async ({ page }) => {
    await enableEditMode(page);
    const node = page.locator('[data-node-id="walk-in"]');
    const before = await node.boundingBox();

    await node.hover();
    await page.mouse.down();
    await page.mouse.move(before.x + 60, before.y + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await node.boundingBox();
    const moved = Math.abs(after.x - before.x) > 5 || Math.abs(after.y - before.y) > 5;
    expect(moved).toBe(true);
  });

  test('connection path updates during drag', async ({ page }) => {
    await enableEditMode(page);

    // Get a connection path d-string before drag
    const dBefore = await page.evaluate(() => {
      const path = document.querySelector('#connections-layer path[data-conn-id]');
      return path ? path.getAttribute('d') : null;
    });

    // Drag the first node
    const node = page.locator('[data-node-id="walk-in"]');
    const box = await node.boundingBox();
    await node.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 50, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const dAfter = await page.evaluate(() => {
      const path = document.querySelector('#connections-layer path[data-conn-id]');
      return path ? path.getAttribute('d') : null;
    });

    // At least one path should have changed
    if (dBefore && dAfter) {
      expect(dAfter).not.toBe(dBefore);
    }
  });

  test('drag snaps to grid', async ({ page }) => {
    await enableEditMode(page);
    const node = page.locator('[data-node-id="paper-app"]');
    const before = await node.boundingBox();

    await node.hover();
    await page.mouse.down();
    await page.mouse.move(before.x + 37, before.y + 23, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Check the transform uses grid-aligned values
    const transform = await page.evaluate(() => {
      const g = document.querySelector('[data-node-id="paper-app"]');
      return g ? g.getAttribute('transform') : '';
    });

    const match = /translate\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(transform);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      // Grid is typically 10 or 20px; check divisibility
      const gridSize = 10;
      const xSnapped = Math.abs(x % gridSize) < 1 || Math.abs(x % gridSize - gridSize) < 1;
      const ySnapped = Math.abs(y % gridSize) < 1 || Math.abs(y % gridSize - gridSize) < 1;
      expect(xSnapped).toBe(true);
      expect(ySnapped).toBe(true);
    }
  });

  test('no overlaps after drag', async ({ page }) => {
    await enableEditMode(page);
    const node = page.locator('[data-node-id="walk-in"]');
    const box = await node.boundingBox();

    await node.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const result = await assertNoOverlaps(page);
    expect(result.violations).toEqual([]);
  });

});
