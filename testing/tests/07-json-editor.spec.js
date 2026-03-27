/**
 * 07-json-editor.spec.js — J7: JSON Editor
 * Live edit, validation, upload, download.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, openOptions } from './helpers.js';
import path from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';

test.describe('J7 — JSON Editor', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  async function showEditor(page) {
    await openOptions(page);
    const chk = page.locator('#chk-show-editor');
    if (!(await chk.isChecked())) await chk.click();
    await page.locator('#editor-pane').waitFor({ state: 'visible' });
  }

  test('J7-S1: enabling JSON Editor makes editor pane visible', async ({ page }) => {
    await showEditor(page);
    await expect(page.locator('#editor-pane')).toBeVisible();
  });

  test('J7-S2: textarea contains valid JSON', async ({ page }) => {
    await showEditor(page);
    const value = await page.locator('#json-editor').inputValue();
    expect(() => JSON.parse(value)).not.toThrow();
  });

  test('J7-S3: editing title and clicking Update re-renders diagram', async ({ page }) => {
    await showEditor(page);
    const value = await page.locator('#json-editor').inputValue();
    const graph = JSON.parse(value);
    graph.title = 'TEST_TITLE_UPDATED';

    await page.locator('#json-editor').fill(JSON.stringify(graph, null, 2));
    await page.click('#btn-update');
    await page.waitForTimeout(600);

    // The SVG header text should contain the new title
    const headerTexts = await page.locator('#lanes-layer text, #background-layer text').allTextContents();
    const found = headerTexts.some(t => t.includes('TEST_TITLE_UPDATED'));
    expect(found).toBe(true);
  });

  test('J7-S4: invalid JSON shows error message', async ({ page }) => {
    await showEditor(page);
    await page.locator('#json-editor').fill('{ invalid json %%%');
    await page.click('#btn-update');
    await page.waitForTimeout(300);
    const errText = await page.locator('#editor-error').textContent();
    expect(errText.trim().length).toBeGreaterThan(0);
  });

  test('J7-S5: Download JSON triggers a download', async ({ page }) => {
    await openOptions(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-download-json'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('J7-S6: uploading a JSON file re-renders diagram', async ({ page }) => {
    // Write a minimal valid JSON to a temp file
    const tmpFile = path.join(tmpdir(), 'pg-test-upload.json');
    const minimal = {
      title: 'Uploaded Test',
      lanes: [{ id: 'l1', label: 'Lane A', height: 100 }],
      nodes: [
        { id: 'n1', type: 'start-event', lane: 'l1', x: 80, laneY: 50, label: 'Start' },
        { id: 'n2', type: 'end-event',   lane: 'l1', x: 300, laneY: 50, label: 'End' },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2' }],
    };
    writeFileSync(tmpFile, JSON.stringify(minimal));

    await openOptions(page);
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#btn-upload-json');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tmpFile);

    await page.waitForSelector('[data-node-id]', { timeout: 5_000 });
    const count = await page.locator('[data-node-id]').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

});
