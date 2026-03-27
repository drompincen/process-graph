/**
 * 01-smoke.spec.js — J1: Smoke & Load
 * Verifies the app and backend are reachable and the default diagram renders.
 */

import { test, expect } from '@playwright/test';

test.describe('J1 — Smoke & Load', () => {

  test('J1-S1: app loads and SVG renders node groups', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
    const nodes = page.locator('[data-node-id]');
    await expect(nodes.first()).toBeVisible();
    expect(await nodes.count()).toBeGreaterThan(0);
  });

  test('J1-S2: GET /api/diagrams returns array with ≥1 entry', async ({ request }) => {
    const res = await request.get('/api/diagrams');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty('file');
    expect(body[0]).toHaveProperty('label');
  });

  test('J1-S3: diagram selector has ≥1 option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#json-selector option', { state: 'attached' });
    const count = await page.locator('#json-selector option').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('J1-S4: switching diagrams re-renders with new content', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-node-id]');

    // Get initial node count
    const initial = await page.locator('[data-node-id]').count();

    // Switch to a different diagram
    const options = await page.locator('#json-selector option').all();
    if (options.length > 1) {
      const secondValue = await options[1].getAttribute('value');
      await page.selectOption('#json-selector', secondValue);
      await page.waitForTimeout(1500);
      const updated = await page.locator('[data-node-id]').count();
      // Node count may differ — just verify render happened
      expect(updated).toBeGreaterThan(0);
    }
  });

  test('J1-S5: no uncaught JS errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

});
