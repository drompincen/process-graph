/**
 * 11-export.spec.js — J11: Export (SVG, PNG, PDF)
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, openOptions } from './helpers.js';

test.describe('J11 — Export', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  test('J11-S1: Export SVG triggers download', async ({ page }) => {
    await openOptions(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-svg'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/i);
  });

  test('J11-S2: Export PNG triggers download', async ({ page }) => {
    await openOptions(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-png'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
  });

  test('J11-S3: Export PDF opens modal', async ({ page }) => {
    await openOptions(page);
    await page.click('#btn-export-pdf');
    await page.locator('#modal-export-pdf').waitFor({ state: 'visible' });
    await expect(page.locator('#modal-export-pdf')).toBeVisible();
  });

  test('J11-S4: PDF modal Cancel closes modal', async ({ page }) => {
    await openOptions(page);
    await page.click('#btn-export-pdf');
    await page.locator('#modal-export-pdf').waitFor({ state: 'visible' });
    await page.click('#btn-pdf-cancel');
    await page.waitForTimeout(200);
    await expect(page.locator('#modal-export-pdf')).toBeHidden();
  });

  test('J11-S5: PDF modal Confirm triggers download', async ({ page }) => {
    await openOptions(page);
    await page.click('#btn-export-pdf');
    await page.locator('#modal-export-pdf').waitFor({ state: 'visible' });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-pdf-confirm'),
    ]);
    expect(download).toBeTruthy();
  });

  test('J11-S6: PDF modal radio options are selectable', async ({ page }) => {
    await openOptions(page);
    await page.click('#btn-export-pdf');
    await page.locator('#modal-export-pdf').waitFor({ state: 'visible' });

    for (const value of ['diagram', 'sequence', 'both']) {
      await page.locator(`input[name="pdf-mode"][value="${value}"]`).check();
      const checked = await page.locator(`input[name="pdf-mode"][value="${value}"]`).isChecked();
      expect(checked).toBe(true);
    }
    // Cancel to clean up
    await page.click('#btn-pdf-cancel');
  });

});
