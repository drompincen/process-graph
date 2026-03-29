/**
 * 03-phase-integrity.spec.js — Every phase is a proper diagram
 * For each of the 4 phases: no orphan nodes, no dangling arrows.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram } from './helpers.js';
import { getAllNodeBBoxes, getAllConnections } from './geo-helpers.js';

async function setPhase(page, phaseIndex) {
  const slider = page.locator('#phase-slider');
  if (await slider.count() > 0) {
    await slider.fill(String(phaseIndex));
    await page.waitForTimeout(400);
  }
}

for (let phase = 0; phase <= 3; phase++) {

  test.describe(`Phase ${phase} Integrity`, () => {

    test.beforeEach(async ({ page }) => {
      await loadApp(page);
      await selectDiagram(page, 'car-loan.json');
      await setPhase(page, phase);
    });

    test(`phase ${phase}: all visible nodes have at least one connection (no orphans)`, async ({ page }) => {
      const boxes = await getAllNodeBBoxes(page);
      const conns = await getAllConnections(page);

      const connectedIds = new Set();
      for (const c of conns) {
        connectedIds.add(c.from);
        connectedIds.add(c.to);
      }

      const orphans = boxes
        .map(b => b.id)
        .filter(id => !connectedIds.has(id));

      expect(orphans).toEqual([]);
    });

    test(`phase ${phase}: all connections have both endpoints visible (no dangling arrows)`, async ({ page }) => {
      const boxes = await getAllNodeBBoxes(page);
      const conns = await getAllConnections(page);

      const visibleIds = new Set(boxes.map(b => b.id));
      const dangling = conns.filter(
        c => !visibleIds.has(c.from) || !visibleIds.has(c.to)
      );

      expect(dangling.map(d => d.id)).toEqual([]);
    });

  });

}
