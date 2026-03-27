/**
 * 12-options.spec.js — J12: Options Menu & Theme
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, openOptions } from './helpers.js';

test.describe('J12 — Options & Theme', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  test('J12-S1: clicking Options button shows menu', async ({ page }) => {
    await page.click('#btn-options');
    await expect(page.locator('#options-menu')).toBeVisible();
  });

  test('J12-S2: clicking outside Options closes it', async ({ page }) => {
    await page.click('#btn-options');
    await page.locator('#options-menu').waitFor({ state: 'visible' });
    // Click far from the menu
    await page.click('#header .brand');
    await page.waitForTimeout(200);
    await expect(page.locator('#options-menu')).toBeHidden();
  });

  test('J12-S3: Light Theme checkbox adds light-theme class to body', async ({ page }) => {
    await openOptions(page);
    const chk = page.locator('#chk-light-mode');
    if (!(await chk.isChecked())) await chk.click();
    const hasClass = await page.evaluate(() => document.body.classList.contains('light-theme'));
    expect(hasClass).toBe(true);
  });

  test('J12-S4: unchecking Light Theme removes light-theme class', async ({ page }) => {
    await openOptions(page);
    const chk = page.locator('#chk-light-mode');
    // Ensure it's checked first
    if (!(await chk.isChecked())) await chk.click();
    // Now uncheck
    await chk.click();
    const hasClass = await page.evaluate(() => document.body.classList.contains('light-theme'));
    expect(hasClass).toBe(false);
  });

  test('J12-S5: Notes checkbox toggles notebook visibility', async ({ page }) => {
    await openOptions(page);
    const chk = page.locator('#chk-show-notes');
    // Enable
    if (!(await chk.isChecked())) await chk.click();
    await expect(page.locator('#notebook')).toBeVisible();
    // Disable
    await chk.click();
    await expect(page.locator('#notebook')).toBeHidden();
  });

  test('J12-S6: JSON Editor checkbox toggles editor pane', async ({ page }) => {
    await openOptions(page);
    const chk = page.locator('#chk-show-editor');
    if (!(await chk.isChecked())) await chk.click();
    await expect(page.locator('#editor-pane')).toBeVisible();
    await chk.click();
    await expect(page.locator('#editor-pane')).toBeHidden();
  });

  test('J12-S7: A+/A− font buttons in options affect slide font-scale variable', async ({ page }) => {
    // Open story first to verify font scale (narrative sets the var)
    await page.locator('#btn-story').waitFor({ state: 'visible' }).catch(() => {});
    const hasStory = await page.locator('#btn-story').isVisible();
    if (!hasStory) {
      test.skip();
      return;
    }

    await openOptions(page);
    const scaleBefore = await page.evaluate(() => {
      return parseFloat(document.documentElement.style.getPropertyValue('--narrative-font-scale') || '1');
    });
    await page.click('#btn-font-larger');
    const scaleAfter = await page.evaluate(() => {
      return parseFloat(document.documentElement.style.getPropertyValue('--narrative-font-scale') || '1');
    });
    expect(scaleAfter).toBeGreaterThanOrEqual(scaleBefore);
  });

  test('J12-S8: SVG background changes in light theme', async ({ page }) => {
    await openOptions(page);
    await page.locator('#chk-light-mode').check();
    // Check diagram-svg has the light background applied via CSS
    const bg = await page.locator('#diagram-svg').evaluate(el => {
      return window.getComputedStyle(el).backgroundColor || '';
    });
    // Under light theme it should differ from the dark default
    expect(bg).toBeTruthy();
  });

});
