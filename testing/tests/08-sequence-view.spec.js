/**
 * 08-sequence-view.spec.js — J8: Sequence View
 * UML sequence diagram rendering via #sequence-svg.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, openOptions } from './helpers.js';

test.describe('J8 — Sequence View', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  async function enableSequenceView(page) {
    await openOptions(page);
    const chk = page.locator('#chk-sequence-view');
    if (!(await chk.isChecked())) await chk.click();
    await page.locator('#sequence-container').waitFor({ state: 'visible' });
  }

  test('J8-S1: enabling Sequence View shows sequence container', async ({ page }) => {
    await enableSequenceView(page);
    await expect(page.locator('#sequence-container')).toBeVisible();
  });

  test('J8-S2: sequence SVG contains line elements (lifelines)', async ({ page }) => {
    await enableSequenceView(page);
    const lines = page.locator('#sequence-svg line');
    expect(await lines.count()).toBeGreaterThan(0);
  });

  test('J8-S3: sequence SVG contains text labels for participants', async ({ page }) => {
    await enableSequenceView(page);
    const texts = page.locator('#sequence-svg text');
    expect(await texts.count()).toBeGreaterThan(0);
  });

  test('J8-S4: disabling Sequence View hides it and shows diagram', async ({ page }) => {
    await enableSequenceView(page);
    // Now disable
    await openOptions(page);
    const chk = page.locator('#chk-sequence-view');
    if (await chk.isChecked()) await chk.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#sequence-container')).toBeHidden();
    await expect(page.locator('#svg-container')).toBeVisible();
  });

  test('J8-S5: sequence SVG has arrow path elements', async ({ page }) => {
    await enableSequenceView(page);
    // Sequence arrows are drawn as path or line elements
    const arrows = page.locator('#sequence-svg path, #sequence-svg polygon');
    expect(await arrows.count()).toBeGreaterThan(0);
  });

});
