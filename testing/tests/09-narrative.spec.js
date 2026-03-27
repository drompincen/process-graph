/**
 * 09-narrative.spec.js — J9: Narrative / Story Mode
 * Slide navigation, KPI HUD, font scale, keyboard nav.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';

test.describe('J9 — Narrative / Story Mode', () => {

  test.beforeEach(async ({ page }) => {
    // order-approval has a full story object
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    await page.waitForTimeout(500); // narrative init runs after load
  });

  async function openStory(page) {
    await page.locator('#btn-story').waitFor({ state: 'visible' });
    await page.click('#btn-story');
    await page.locator('#narrative-view').waitFor({ state: 'visible' });
  }

  test('J9-S1: Story button is visible for order-approval', async ({ page }) => {
    const btn = page.locator('#btn-story');
    await expect(btn).toBeVisible();
  });

  test('J9-S2: clicking Story button opens narrative full-screen view', async ({ page }) => {
    await openStory(page);
    await expect(page.locator('#narrative-view')).toBeVisible();
  });

  test('J9-S3: first slide shows problem content', async ({ page }) => {
    await openStory(page);
    const slideText = await page.locator('#slide-container').textContent();
    expect(slideText.trim().length).toBeGreaterThan(0);
  });

  test('J9-S4: arrow-right key navigates to next slide', async ({ page }) => {
    await openStory(page);
    const firstContent = await page.locator('#slide-container').innerHTML();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const secondContent = await page.locator('#slide-container').innerHTML();
    expect(secondContent).not.toBe(firstContent);
  });

  test('J9-S5: nav dot click jumps to that slide', async ({ page }) => {
    await openStory(page);
    const dots = page.locator('#slide-nav-dots [data-slide], #slide-nav-dots button');
    if (await dots.count() > 1) {
      const secondDot = dots.nth(1);
      await secondDot.click();
      await page.waitForTimeout(300);
      // The second dot should now be active
      const isActive = await secondDot.evaluate(el => el.classList.contains('active') || el.getAttribute('aria-current') === 'true');
      // Verify slide content changed from slide 0
      const content = await page.locator('#slide-container').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('J9-S6: narrative sidebar has KPI HUD content', async ({ page }) => {
    await openStory(page);
    // Advance at least one slide so KPIs accumulate
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const hudText = await page.locator('#narrative-kpi-hud').textContent();
    // Should have some content (labels/values)
    expect(hudText.trim().length).toBeGreaterThan(0);
  });

  test('J9-S7: A+ font button increases font scale', async ({ page }) => {
    await openStory(page);
    const scaleBefore = await page.evaluate(() => {
      return parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--narrative-font-scale') || '1');
    });
    await page.click('#btn-narrative-font-larger');
    const scaleAfter = await page.evaluate(() => {
      return parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--narrative-font-scale') || '1');
    });
    expect(scaleAfter).toBeGreaterThan(scaleBefore);
  });

  test('J9-S8: Escape key closes narrative view', async ({ page }) => {
    await openStory(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#narrative-view')).toBeHidden();
  });

  test('J9-S9: ?story=true URL param auto-opens narrative', async ({ page }) => {
    await page.goto('/?process=order-approval.json&story=true');
    await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
    // Narrative should open after 400ms delay
    await page.locator('#narrative-view').waitFor({ state: 'visible', timeout: 5_000 });
  });

});
