/**
 * 05-animation.spec.js — Flow animation playback tests
 * Verifies that the play/rewind/ff controls animate a token through
 * the flow sequence at each phase.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(600);
  }
}

test.describe('Flow Animation', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'car-loan.json');
    await page.waitForTimeout(500);
  });

  test('play button exists', async ({ page }) => {
    const btn = page.locator('#btn-play-flow');
    expect(await btn.count()).toBe(1);
  });

  test('rewind button exists', async ({ page }) => {
    const btn = page.locator('#btn-rewind');
    expect(await btn.count()).toBe(1);
  });

  test('ff button exists', async ({ page }) => {
    const btn = page.locator('#btn-ff-flow');
    expect(await btn.count()).toBe(1);
  });

  test('clicking play creates a token at phase 0', async ({ page }) => {
    await setPhase(page, 0);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(1500);

    const tokens = await page.locator('.anim-token').count();
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  test('clicking play creates a token at phase 1', async ({ page }) => {
    await setPhase(page, 1);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(1500);

    const tokens = await page.locator('.anim-token').count();
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  test('clicking play creates a token at phase 2', async ({ page }) => {
    await setPhase(page, 2);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(1500);

    const tokens = await page.locator('.anim-token').count();
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  test('clicking play creates a token at phase 3', async ({ page }) => {
    await setPhase(page, 3);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(1500);

    const tokens = await page.locator('.anim-token').count();
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  test('log pane receives entries during animation', async ({ page }) => {
    await setPhase(page, 0);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(2000);

    const logEntries = await page.evaluate(() => {
      const rows = document.querySelectorAll('#log-body tr, .log-entry');
      return rows.length;
    });
    expect(logEntries).toBeGreaterThan(0);
  });

  test('rewind clears animation token', async ({ page }) => {
    await setPhase(page, 0);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(1500);

    await page.locator('#btn-rewind').click();
    await page.waitForTimeout(500);

    const tokens = await page.locator('.anim-token').count();
    expect(tokens).toBe(0);
  });

  test('no JS errors during animation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await setPhase(page, 0);
    await page.locator('#btn-play-flow').click();
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
  });
});
