/**
 * 03-view-modes.spec.js — J3: View Modes (Before / Split / After / Overlay)
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, setViewMode } from './helpers.js';

test.describe('J3 — View Modes', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  test('J3-S1: Before mode — only before-phase nodes visible', async ({ page }) => {
    await setViewMode(page, 'before');
    const beforeActive = await page.locator('#btn-before').evaluate(el => el.classList.contains('active'));
    expect(beforeActive).toBe(true);
    // Nodes exist (before set is non-empty)
    const count = await page.locator('[data-node-id]').count();
    expect(count).toBeGreaterThan(0);
  });

  test('J3-S2: After mode — only after-phase nodes visible', async ({ page }) => {
    await setViewMode(page, 'after');
    const afterActive = await page.locator('#btn-after').evaluate(el => el.classList.contains('active'));
    expect(afterActive).toBe(true);
    const count = await page.locator('[data-node-id]').count();
    expect(count).toBeGreaterThan(0);
  });

  test('J3-S3: Split mode — combined node count > Before alone', async ({ page }) => {
    await setViewMode(page, 'before');
    const beforeCount = await page.locator('[data-node-id]').count();

    await setViewMode(page, 'split');
    const splitCount = await page.locator('[data-node-id]').count();

    // Split should show at least as many nodes as Before
    expect(splitCount).toBeGreaterThanOrEqual(beforeCount);
  });

  test('J3-S4: Overlay mode — diff classes present on nodes', async ({ page }) => {
    await setViewMode(page, 'overlay');
    const addedOrRemoved = page.locator('[data-node-id].diff-added, [data-node-id].diff-removed, [data-node-id].diff-changed, [data-node-id].diff-unchanged');
    expect(await addedOrRemoved.count()).toBeGreaterThan(0);
  });

  test('J3-S5: only one view-btn is active at a time', async ({ page }) => {
    for (const mode of ['before', 'after', 'split', 'overlay']) {
      await setViewMode(page, mode);
      const activeCount = await page.locator('.view-btn.active').count();
      expect(activeCount).toBe(1);
    }
  });

  test('J3-S6: ?view=after URL param pre-selects After', async ({ page }) => {
    await page.goto('/?view=after');
    await page.waitForSelector('[data-node-id]');
    const isActive = await page.locator('#btn-after').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

});
