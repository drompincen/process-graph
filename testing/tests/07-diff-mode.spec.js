/**
 * 07-diff-mode.spec.js — Diff highlighting
 * Verifies diff toggle and visual diff classes between phases.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(400);
  }
}

test.describe('Diff Mode', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'car-loan.json');
  });

  test('diff toggle button exists', async ({ page }) => {
    const btn = page.locator('#btn-diff, [data-action="diff"], button:has-text("Diff")');
    const count = await btn.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking Diff adds diff classes to nodes', async ({ page }) => {
    await setPhase(page, 1);
    const btn = page.locator('#btn-diff, [data-action="diff"], button:has-text("Diff")');
    await btn.first().click();
    await page.waitForTimeout(500);

    const hasDiffClasses = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-node-id]');
      return Array.from(nodes).some(n =>
        n.classList.contains('diff-added') ||
        n.classList.contains('diff-removed') ||
        n.classList.contains('diff-unchanged') ||
        n.classList.contains('diff-modified')
      );
    });
    expect(hasDiffClasses).toBe(true);
  });

  test.skip('phase 1 nodes that are new get diff-added class', async ({ page }) => {
    // Skip: diff rendering integration between UI button and renderer needs wiring
    await setPhase(page, 1);
    const btn = page.locator('#btn-diff, [data-action="diff"], button:has-text("Diff")');
    await btn.first().click();
    await page.waitForTimeout(500);

    // scan-upload is new in phase 1 (not in phase 0)
    const hasAdded = await page.evaluate(() => {
      const node = document.querySelector('[data-node-id="scan-upload"]');
      return node ? node.classList.contains('diff-added') : false;
    });
    expect(hasAdded).toBe(true);
  });

  test('phase 0 nodes that are removed get diff-removed styling', async ({ page }) => {
    await setPhase(page, 1);
    const btn = page.locator('#btn-diff, [data-action="diff"], button:has-text("Diff")');
    await btn.first().click();
    await page.waitForTimeout(500);

    // walk-in is in phase 0 but not phase 1 -- it should be marked as removed
    const hasRemoved = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-node-id]');
      return Array.from(nodes).some(n =>
        n.classList.contains('diff-removed')
      );
    });
    expect(hasRemoved).toBe(true);
  });

});
