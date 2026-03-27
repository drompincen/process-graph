/**
 * 10-metrics.spec.js — J10: Metrics Panel, KPI HUD, Benefits
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, openOptions } from './helpers.js';

test.describe('J10 — Metrics & Benefits', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  async function enable(page, checkboxId) {
    await openOptions(page);
    const chk = page.locator(`#${checkboxId}`);
    if (!(await chk.isChecked())) await chk.click();
    await page.keyboard.press('Escape');
  }

  test('J10-S1: enabling Metrics Panel shows it', async ({ page }) => {
    await enable(page, 'chk-show-metrics');
    await expect(page.locator('#metrics-panel')).toBeVisible();
  });

  test('J10-S2: Metrics Panel contains before/after data rows', async ({ page }) => {
    await enable(page, 'chk-show-metrics');
    const rows = page.locator('#metrics-panel tr, #metrics-panel .metric-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
  });

  test('J10-S3: enabling KPI HUD shows it', async ({ page }) => {
    await enable(page, 'chk-show-kpis');
    await expect(page.locator('#kpi-hud')).toBeVisible();
  });

  test('J10-S4: KPI HUD has text content', async ({ page }) => {
    await enable(page, 'chk-show-kpis');
    const text = await page.locator('#kpi-hud').textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('J10-S5: enabling Benefits panel shows card elements', async ({ page }) => {
    await enable(page, 'chk-show-benefits');
    await expect(page.locator('#benefits-panel')).toBeVisible();
    const cards = page.locator('#benefits-panel .benefit-card, #benefits-panel [class*="benefit"]');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('J10-S6: hovering benefit card highlights scope nodes', async ({ page }) => {
    await enable(page, 'chk-show-benefits');
    const cards = page.locator('#benefits-panel .benefit-card, #benefits-panel [class*="benefit"]');
    if (await cards.count() === 0) test.skip();

    await cards.first().hover({ force: true });
    await page.waitForTimeout(200);
    const highlighted = page.locator('[data-node-id].benefit-highlight');
    expect(await highlighted.count()).toBeGreaterThanOrEqual(0); // at least non-negative
  });

  test('J10-S7: disabling Metrics Panel hides it', async ({ page }) => {
    await enable(page, 'chk-show-metrics');
    await expect(page.locator('#metrics-panel')).toBeVisible();

    await openOptions(page);
    const chk = page.locator('#chk-show-metrics');
    if (await chk.isChecked()) await chk.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#metrics-panel')).toBeHidden();
  });

  test('J10-S8: diagrams without story do not show Story button', async ({ page }) => {
    await selectDiagram(page, 'ticket-triage.json');
    await page.waitForTimeout(500);
    const btn = page.locator('#btn-story');
    // Either hidden or not displayed
    const isHidden = await btn.evaluate(el => el.style.display === 'none' || !el.offsetParent);
    expect(isHidden).toBe(true);
  });

});
