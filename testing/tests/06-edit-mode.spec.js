/**
 * 06-edit-mode.spec.js — J6: Edit Mode
 * Node dragging, 20px snap, undo/redo, inline label editing.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, enableEditMode, disableEditMode, parseTranslateX } from './helpers.js';

test.describe('J6 — Edit Mode', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
  });

  test('J6-S1: enabling edit mode adds is-editing to body', async ({ page }) => {
    await enableEditMode(page);
    const hasClass = await page.evaluate(() => document.body.classList.contains('is-editing'));
    expect(hasClass).toBe(true);
  });

  test('J6-S2: edit mode sets grab cursor on nodes', async ({ page }) => {
    await enableEditMode(page);
    const cursor = await page.locator('[data-node-id]').first().evaluate(el => {
      return window.getComputedStyle(el).cursor;
    });
    expect(cursor).toBe('grab');
  });

  test('J6-S3: dragging a node changes its position', async ({ page }) => {
    await enableEditMode(page);

    // Use b-mgr-review (lane=manager, x=380) — no other task overlaps at this position
    const node = page.locator('[data-node-id="b-mgr-review"]');
    const box = await node.boundingBox();
    if (!box) test.skip();

    // Read inner rect x before drag
    const xBefore = await node.locator('rect').first().getAttribute('x');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Read inner rect x after drag — should differ since node moved
    const xAfter = await node.locator('rect').first().getAttribute('x');
    expect(xAfter).not.toBe(xBefore);
  });

  test('J6-S4: drag snaps to 20px grid', async ({ page }) => {
    await enableEditMode(page);

    const node = page.locator('[data-node-id][class*="node-task"]').first();
    const box = await node.boundingBox();
    if (!box) test.skip();

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Drag by a non-round amount
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 37, cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const transform = await node.getAttribute('transform');
    const tx = parseTranslateX(transform);
    expect(tx % 20).toBe(0);
  });

  test('J6-S5: Ctrl+Z undoes a drag', async ({ page }) => {
    await enableEditMode(page);

    const node = page.locator('[data-node-id][class*="node-task"]').first();
    const transformBefore = await node.getAttribute('transform');
    const box = await node.boundingBox();
    if (!box) test.skip();

    // Drag
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    const transformAfter = await node.getAttribute('transform');
    expect(transformAfter).toBe(transformBefore);
  });

  test('J6-S6: double-click node shows inline text input', async ({ page }) => {
    await enableEditMode(page);

    const node = page.locator('[data-node-id]').first();
    const box = await node.boundingBox();
    if (!box) test.skip();

    // Use b-mgr-review — non-overlapping task node, avoids hit-test ambiguity
    await page.locator('[data-node-id="b-mgr-review"]').dblclick({ force: true });
    await page.waitForSelector('input[type="text"]', { timeout: 3_000 });
    const input = page.locator('input[type="text"]').last();
    await expect(input).toBeVisible();
  });

  test('J6-S7: typing new label and pressing Enter updates SVG text', async ({ page }) => {
    await enableEditMode(page);

    // Use b-mgr-review — non-overlapping task node, avoids hit-test ambiguity
    await page.locator('[data-node-id="b-mgr-review"]').dblclick({ force: true });
    await page.waitForSelector('input[type="text"]', { timeout: 3_000 });
    const input = page.locator('input[type="text"]').last();

    await input.fill('Test Label XYZ');
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Check that some node text contains the new label
    const nodeTexts = await page.locator('[data-node-id] text').allTextContents();
    const found = nodeTexts.some(t => t.includes('Test Label XYZ'));
    expect(found).toBe(true);
  });

  test('J6-S8: Ctrl+Z reverts label change', async ({ page }) => {
    await enableEditMode(page);

    const origTexts = await page.locator('[data-node-id] text').allTextContents();

    // Use b-mgr-review — non-overlapping task node, avoids hit-test ambiguity
    await page.locator('[data-node-id="b-mgr-review"]').dblclick({ force: true });
    await page.waitForSelector('input[type="text"]', { timeout: 3_000 });
    const input = page.locator('input[type="text"]').last();
    await input.fill('Temporary Label');
    await input.press('Enter');
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);

    const newTexts = await page.locator('[data-node-id] text').allTextContents();
    expect(newTexts).toEqual(origTexts);
  });

  test('J6-S9: disabling edit mode removes is-editing from body', async ({ page }) => {
    await enableEditMode(page);
    await disableEditMode(page);
    const hasClass = await page.evaluate(() => document.body.classList.contains('is-editing'));
    expect(hasClass).toBe(false);
  });

});
