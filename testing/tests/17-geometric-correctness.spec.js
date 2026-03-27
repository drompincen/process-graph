/**
 * 17-geometric-correctness.spec.js — Visual/geometric assertions across all diagrams.
 *
 * Tests ACTUAL rendered positions, bounding boxes, and arrow paths — not just DOM state.
 * Uses getCTM()-corrected SVG coordinates for accurate overlap and containment checks.
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, setViewMode } from './helpers.js';
import {
  assertNoOverlaps,
  assertWithinLane,
  assertOrthogonalArrows,
  assertArrowsAvoidNodes,
  assertLabelsAttached,
  assertNoDuplicateIds,
} from './geo-helpers.js';

const ALL_DIAGRAMS = [
  'order-approval.json',
  'lean-six-sigma.json',
  'manufacturing-fulfillment.json',
  'expense-claim.json',
  'incident-response.json',
  'onboarding.json',
  'ticket-triage.json',
];

const VIEW_MODES = ['before', 'after'];

for (const diagram of ALL_DIAGRAMS) {
  for (const mode of VIEW_MODES) {
    test.describe(`Geometric: ${diagram} — ${mode}`, () => {

      test.beforeEach(async ({ page }) => {
        await loadApp(page);
        await selectDiagram(page, diagram);
        await setViewMode(page, mode);
        await page.waitForTimeout(400);
      });

      test('no node overlaps', async ({ page }) => {
        const result = await assertNoOverlaps(page);
        if (!result.pass) {
          console.log(`OVERLAPS [${diagram}/${mode}]:`, JSON.stringify(result.violations.slice(0, 5)));
        }
        expect(result.violations,
          `${result.violations.length} overlapping node pairs in ${diagram}/${mode}: ${result.violations.slice(0, 3).map(v => v.pair.join('<->')).join(', ')}`
        ).toHaveLength(0);
      });

      test('all nodes within their lane', async ({ page }) => {
        const result = await assertWithinLane(page);
        if (!result.pass) {
          console.log(`LANE ESCAPE [${diagram}/${mode}]:`, JSON.stringify(result.violations.slice(0, 5)));
        }
        expect(result.violations,
          `${result.violations.length} nodes outside their lane in ${diagram}/${mode}: ${result.violations.slice(0, 3).map(v => v.nodeId).join(', ')}`
        ).toHaveLength(0);
      });

      test('all arrows are orthogonal', async ({ page }) => {
        const result = await assertOrthogonalArrows(page);
        if (!result.pass) {
          console.log(`DIAGONAL [${diagram}/${mode}]:`, JSON.stringify(result.violations.slice(0, 5)));
        }
        expect(result.violations,
          `${result.violations.length} diagonal arrows in ${diagram}/${mode}: ${result.violations.slice(0, 3).map(v => `${v.connId}(${v.angle}°)`).join(', ')}`
        ).toHaveLength(0);
      });

      test('arrows avoid node bodies', async ({ page }) => {
        const result = await assertArrowsAvoidNodes(page);
        if (!result.pass) {
          console.log(`ARROW-NODE [${diagram}/${mode}]:`, JSON.stringify(result.violations.slice(0, 5)));
        }
        expect(result.violations,
          `${result.violations.length} arrows through nodes in ${diagram}/${mode}: ${result.violations.slice(0, 3).map(v => `${v.connId} through ${v.intersectedNode}`).join(', ')}`
        ).toHaveLength(0);
      });

      test('no duplicate node IDs', async ({ page }) => {
        const result = await assertNoDuplicateIds(page);
        expect(result.violations,
          `Duplicate IDs in ${diagram}/${mode}: ${result.violations.join(', ')}`
        ).toHaveLength(0);
      });
    });
  }
}
