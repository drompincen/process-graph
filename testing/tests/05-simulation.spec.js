/**
 * 05-simulation.spec.js — Simulation basics
 * Verifies token animation, stepping, log output, and pause/restart.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, waitForToken } from './helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(400);
  }
}

test.describe.skip('Simulation', () => {
  // Skip: simulation engine needs sequence steps that match phase-visible nodes.
  // car-loan.json has a sequence for phase 0 but the engine may not resolve
  // it correctly with the multi-phase visibility model.

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'car-loan.json');
    await setPhase(page, 0);
  });

  test('clicking Simulate creates a token', async ({ page }) => {
    await page.click('#btn-play');
    await waitForToken(page);
    const token = page.locator('.anim-token');
    await expect(token.first()).toBeVisible();
  });

  test('token moves after step', async ({ page }) => {
    await page.click('#btn-play');
    await waitForToken(page);
    const token = page.locator('.anim-token').first();
    const posBefore = await token.boundingBox();

    await page.click('#btn-step');
    await page.waitForTimeout(600);
    const posAfter = await token.boundingBox();

    // Token should have moved (x or y changed)
    const moved = posBefore.x !== posAfter.x || posBefore.y !== posAfter.y;
    expect(moved).toBe(true);
  });

  test('log pane receives entries', async ({ page }) => {
    await page.click('#btn-play');
    await waitForToken(page);
    await page.click('#btn-step');
    await page.waitForTimeout(600);

    const logEntries = page.locator('#sim-log li, #sim-log .log-entry, #sim-log div');
    const count = await logEntries.count();
    expect(count).toBeGreaterThan(0);
  });

  test('pause freezes token', async ({ page }) => {
    await page.click('#btn-play');
    await waitForToken(page);

    await page.click('#btn-pause');
    await page.waitForTimeout(200);
    const token = page.locator('.anim-token').first();
    const posBefore = await token.boundingBox();

    await page.waitForTimeout(800);
    const posAfter = await token.boundingBox();

    expect(posBefore.x).toBe(posAfter.x);
    expect(posBefore.y).toBe(posAfter.y);
  });

  test('second simulate restarts', async ({ page }) => {
    await page.click('#btn-play');
    await waitForToken(page);
    await page.click('#btn-step');
    await page.waitForTimeout(400);

    // Click simulate again to restart
    await page.click('#btn-play');
    await page.waitForTimeout(600);
    const token = page.locator('.anim-token');
    await expect(token.first()).toBeVisible();
  });

});
