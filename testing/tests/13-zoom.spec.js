/**
 * 13-zoom.spec.js — J13: Zoom Presets (Fit / HD / 4K)
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';

test.describe('J13 — Zoom Presets', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  test('J13-S1: Fit button is active by default', async ({ page }) => {
    const isActive = await page.locator('#btn-zoom-fit').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('J13-S2: clicking HD sets SVG viewBox width to 1920', async ({ page }) => {
    await page.click('#btn-zoom-hd');
    await page.waitForTimeout(300);
    const viewBox = await page.locator('#diagram-svg').getAttribute('viewBox');
    // viewBox format: "0 0 W H"
    expect(viewBox).toBeTruthy();
    const parts = viewBox.split(/\s+/);
    const w = parseFloat(parts[2]);
    expect(w).toBe(1920);
  });

  test('J13-S3: clicking 4K sets SVG viewBox width to 3840', async ({ page }) => {
    await page.click('#btn-zoom-4k');
    await page.waitForTimeout(300);
    const viewBox = await page.locator('#diagram-svg').getAttribute('viewBox');
    const parts = (viewBox || '').split(/\s+/);
    const w = parseFloat(parts[2]);
    expect(w).toBe(3840);
  });

  test('J13-S4: 4K mode causes horizontal scroll in container', async ({ page }) => {
    await page.click('#btn-zoom-4k');
    await page.waitForTimeout(400);
    const { scrollWidth, clientWidth } = await page.locator('#svg-container').evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test('J13-S5: clicking Fit returns to container-relative width', async ({ page }) => {
    // Set 4K first
    await page.click('#btn-zoom-4k');
    await page.waitForTimeout(200);

    // Switch back to Fit
    await page.click('#btn-zoom-fit');
    await page.waitForTimeout(400);

    const isActive = await page.locator('#btn-zoom-fit').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);

    const viewBox = await page.locator('#diagram-svg').getAttribute('viewBox');
    const parts = (viewBox || '').split(/\s+/);
    const w = parseFloat(parts[2]);
    // Fit width should be <= 1920 (container)
    expect(w).toBeLessThanOrEqual(1920);
  });

  test('J13-S6: zoom state persists when switching diagrams', async ({ page }) => {
    await page.click('#btn-zoom-hd');
    await page.waitForTimeout(200);

    await selectDiagram(page, 'ticket-triage.json');
    await page.waitForTimeout(500);

    // HD button should still be active
    const isActive = await page.locator('#btn-zoom-hd').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);

    // viewBox should still be 1920 wide
    const viewBox = await page.locator('#diagram-svg').getAttribute('viewBox');
    const parts = (viewBox || '').split(/\s+/);
    const w = parseFloat(parts[2]);
    expect(w).toBe(1920);
  });

  test('J13-S7: only one zoom button is active at a time', async ({ page }) => {
    for (const id of ['btn-zoom-fit', 'btn-zoom-hd', 'btn-zoom-4k']) {
      await page.click(`#${id}`);
      await page.waitForTimeout(200);
      const activeCount = await page.locator('.zoom-btn.active').count();
      expect(activeCount).toBe(1);
    }
  });

});
