/**
 * 04-geometric-quality.spec.js — Arrow/node quality per phase
 * For each of 4 phases: no overlaps, orthogonal arrows, no pass-through.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';
import {
  assertNoOverlaps,
  assertOrthogonalArrows,
  assertArrowsAvoidNodes,
} from './geo-helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(400);
  }
}

for (let phase = 0; phase <= 3; phase++) {

  test.describe(`Phase ${phase} Geometric Quality`, () => {

    test.beforeEach(async ({ page }) => {
      await loadApp(page);
      await selectDiagram(page, 'car-loan.json');
      await setPhase(page, phase);
    });

    test(`phase ${phase}: no node overlaps`, async ({ page }) => {
      const result = await assertNoOverlaps(page);
      expect(result.violations).toEqual([]);
    });

    test(`phase ${phase}: all arrows are orthogonal (H or V segments only)`, async ({ page }) => {
      const result = await assertOrthogonalArrows(page);
      expect(result.violations).toEqual([]);
    });

    test(`phase ${phase}: arrows do not pass through non-connected nodes`, async ({ page }) => {
      const result = await assertArrowsAvoidNodes(page);
      expect(result.violations).toEqual([]);
    });

  });

}
