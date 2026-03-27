/**
 * 02-diagram-loading.spec.js — J2: Diagram Loading
 * Each sample diagram loads, parses, and renders correctly.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';

test.describe('J2 — Diagram Loading', () => {

  test('J2-S1: order-approval.json renders ≥15 nodes', async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    const count = await page.locator('[data-node-id]').count();
    expect(count).toBeGreaterThanOrEqual(15);
  });

  test('J2-S2: ticket-triage.json renders without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await loadApp(page);
    await selectDiagram(page, 'ticket-triage.json');
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
    expect(await page.locator('[data-node-id]').count()).toBeGreaterThan(0);
  });

  test('J2-S3: onboarding.json renders ≥12 nodes', async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'onboarding.json');
    const count = await page.locator('[data-node-id]').count();
    expect(count).toBeGreaterThanOrEqual(12);
  });

  test('J2-S4: ?process=ticket-triage.json URL param loads diagram', async ({ page }) => {
    await page.goto('/?process=ticket-triage.json');
    await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
    // Verify the selector shows the right value
    const selected = await page.locator('#json-selector').inputValue();
    expect(selected).toBe('ticket-triage.json');
  });

  test('J2-S5: ?view=before URL param sets Before mode', async ({ page }) => {
    await page.goto('/?view=before');
    await page.waitForSelector('[data-node-id]');
    const isActive = await page.locator('#btn-before').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('J2-S6: diagram with notes shows notebook', async ({ page }) => {
    // order-approval has notes
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    // Open options and enable notes
    await page.click('#btn-options');
    await page.waitForSelector('#options-menu', { state: 'visible' });
    const chk = page.locator('#chk-show-notes');
    if (!(await chk.isChecked())) await chk.click();
    const notebook = page.locator('#notebook');
    await expect(notebook).toBeVisible();
    const text = await page.locator('#notebook-text').textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('J2-S7: lane labels are present in SVG', async ({ page }) => {
    await loadApp(page);
    // Lanes layer should have text elements
    const laneTexts = page.locator('#lanes-layer text');
    expect(await laneTexts.count()).toBeGreaterThan(0);
  });

  test('J2-S8: connections layer has path elements', async ({ page }) => {
    await loadApp(page);
    const paths = page.locator('#connections-layer path');
    expect(await paths.count()).toBeGreaterThan(0);
  });

});
