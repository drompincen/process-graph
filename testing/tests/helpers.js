/**
 * helpers.js — Shared Playwright helpers for process-graph tests.
 */

/** Navigate to the app root and wait for the diagram SVG to have rendered nodes. */
export async function loadApp(page, params = '') {
  await page.goto('/' + (params ? '?' + params : ''));
  await page.waitForSelector('[data-node-id]', { timeout: 15_000 });
}

/** Open the Options dropdown menu. */
export async function openOptions(page) {
  const menu = page.locator('#options-menu');
  const isVisible = await menu.isVisible();
  if (!isVisible) await page.click('#btn-options');
  await menu.waitFor({ state: 'visible' });
}

/** Close the Options dropdown menu. */
export async function closeOptions(page) {
  await page.keyboard.press('Escape');
  // Fallback: click outside
  const isVisible = await page.locator('#options-menu').isVisible();
  if (isVisible) await page.click('#header', { position: { x: 5, y: 5 } });
}

/** Enable edit mode via the checkbox in Options. */
export async function enableEditMode(page) {
  await openOptions(page);
  const chk = page.locator('#chk-edit-mode');
  if (!(await chk.isChecked())) await chk.click();
  await page.waitForFunction(() => document.body.classList.contains('is-editing'));
}

/** Disable edit mode. */
export async function disableEditMode(page) {
  await openOptions(page);
  const chk = page.locator('#chk-edit-mode');
  if (await chk.isChecked()) await chk.click();
  await page.waitForFunction(() => !document.body.classList.contains('is-editing'));
}

/** Select a diagram by filename from the dropdown. */
export async function selectDiagram(page, filename) {
  await page.selectOption('#json-selector', { value: filename });
  await page.waitForSelector('[data-node-id]', { timeout: 10_000 });
}

/** Click a view-mode button (before/split/after/overlay) and wait for re-render. */
export async function setViewMode(page, mode) {
  await page.click(`[data-mode="${mode}"]`);
  // Wait for at least one node to be present (re-render)
  await page.waitForTimeout(200);
}

/** Count visible SVG node groups. */
export async function countNodes(page) {
  return page.locator('[data-node-id]').count();
}

/** Get the numeric X in a `translate(X,Y)` transform string. */
export function parseTranslateX(transform) {
  const m = /translate\(\s*([\d.+-]+)/.exec(transform || '');
  return m ? parseFloat(m[1]) : 0;
}

/** Wait until simulation token appears. */
export async function waitForToken(page) {
  await page.waitForSelector('.anim-token', { timeout: 8_000 });
}
