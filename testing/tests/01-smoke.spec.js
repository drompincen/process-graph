/**
 * 01-smoke.spec.js — Basic app loading
 * Verifies the app boots, renders SVG, and loads the car-loan sample.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, countNodes } from './helpers.js';

test.describe('Smoke & Load', () => {

  test('app loads and SVG renders node groups', async ({ page }) => {
    await loadApp(page);
    const nodes = page.locator('[data-node-id]');
    await expect(nodes.first()).toBeVisible();
    expect(await nodes.count()).toBeGreaterThan(0);
  });

  test('diagram selector has at least 1 option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#json-selector option', { state: 'attached' });
    const count = await page.locator('#json-selector option').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('switching diagrams re-renders with new content', async ({ page }) => {
    await loadApp(page);
    const options = await page.locator('#json-selector option').all();
    if (options.length > 1) {
      const secondValue = await options[1].getAttribute('value');
      await page.selectOption('#json-selector', secondValue);
      await page.waitForTimeout(1000);
      const updated = await countNodes(page);
      expect(updated).toBeGreaterThan(0);
    }
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await loadApp(page);
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test('car-loan.json renders nodes', async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'car-loan.json');
    const count = await countNodes(page);
    expect(count).toBeGreaterThanOrEqual(3);
  });

});
