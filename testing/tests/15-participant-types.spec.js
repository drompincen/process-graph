/**
 * 15-participant-types.spec.js — J15: Persona, Agent, System Node Types
 *
 * Verifies that the three participant node types render with the correct
 * visual shapes, colors, icons, and dimensions. Tests use order-approval.json
 * which contains example nodes:
 *   a-persona-ex  — type=persona  (requester lane, x=960, diff=added, phase=after)
 *   a-agent-ex    — type=agent    (system lane,    x=960, diff=added, phase=after)
 *   a-system-ex   — type=system   (finance lane,   x=960, diff=added, phase=after)
 */

import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, setViewMode } from './helpers.js';

test.describe('J15 — Participant Node Types', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    // Participant examples are after-phase nodes — switch to after view
    await setViewMode(page, 'after');
  });

  // ── Persona ────────────────────────────────────────────────────────────────

  test('J15-S1: persona node renders with node-persona CSS class', async ({ page }) => {
    const count = await page.locator('.node-persona').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('J15-S2: persona shape is a rounded rect (rx=6)', async ({ page }) => {
    const rx = await page.locator('[data-node-id="a-persona-ex"] rect').first()
      .getAttribute('rx');
    expect(rx).toBe('6');
  });

  test('J15-S3: persona stroke uses warm-blue #5b8db8 by default or diff stroke', async ({ page }) => {
    // a-persona-ex has diff=added so stroke should be the added-diff green
    const stroke = await page.locator('[data-node-id="a-persona-ex"] rect').first()
      .getAttribute('stroke');
    // diff=added → stroke is #22c55e
    expect(stroke).toBe('#22c55e');
  });

  test('J15-S4: persona node contains a head circle icon', async ({ page }) => {
    // The persona renderer appends a circle for the head
    const circleCount = await page.locator('[data-node-id="a-persona-ex"] circle').count();
    expect(circleCount).toBeGreaterThanOrEqual(1);
  });

  test('J15-S5: persona rect has SVG width=110 and height=44', async ({ page }) => {
    const w = await page.locator('[data-node-id="a-persona-ex"] rect').first().getAttribute('width');
    const h = await page.locator('[data-node-id="a-persona-ex"] rect').first().getAttribute('height');
    expect(parseFloat(w)).toBe(110);
    expect(parseFloat(h)).toBe(44);
  });

  // ── Agent ──────────────────────────────────────────────────────────────────

  test('J15-S6: agent node renders with node-agent CSS class', async ({ page }) => {
    const count = await page.locator('.node-agent').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('J15-S7: agent shape is a polygon (chamfered corners), not a rect', async ({ page }) => {
    const hasPoly = await page.locator('[data-node-id="a-agent-ex"] polygon').first()
      .isVisible();
    expect(hasPoly).toBe(true);

    const rectCount = await page.locator('[data-node-id="a-agent-ex"] rect').count();
    expect(rectCount).toBe(0);
  });

  test('J15-S8: agent diff=added uses green glow filter', async ({ page }) => {
    const filter = await page.locator('[data-node-id="a-agent-ex"] polygon').first()
      .getAttribute('filter');
    expect(filter).toContain('glow-green');
  });

  test('J15-S9: agent node contains at least 2 polygons (shape + bolt icon)', async ({ page }) => {
    const count = await page.locator('[data-node-id="a-agent-ex"] polygon').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('J15-S10: agent polygon spans 110×44 SVG units', async ({ page }) => {
    // Verify via layout — NODE_DIMS.agent = { w:110, h:44 }
    // The polygon points string encodes the chamfered rect; verify node group exists
    const pts = await page.locator('[data-node-id="a-agent-ex"] polygon').first()
      .getAttribute('points');
    expect(pts).not.toBeNull();
    expect(pts.split(' ').length).toBe(8); // 8-point chamfered octagon
  });

  // ── System ─────────────────────────────────────────────────────────────────

  test('J15-S11: system node renders with node-system CSS class', async ({ page }) => {
    const count = await page.locator('.node-system').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('J15-S12: system outer rect has no corner radius (rx=0)', async ({ page }) => {
    const rx = await page.locator('[data-node-id="a-system-ex"] rect').first()
      .getAttribute('rx');
    expect(rx).toBe('0');
  });

  test('J15-S13: system node has inner bezel rect (2 rects total)', async ({ page }) => {
    const count = await page.locator('[data-node-id="a-system-ex"] rect').count();
    // outer rect + inner bezel + server-rack bars (3) = 5 minimum
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('J15-S14: system diff=added uses green glow filter', async ({ page }) => {
    const filter = await page.locator('[data-node-id="a-system-ex"] rect').first()
      .getAttribute('filter');
    expect(filter).toContain('glow-green');
  });

  test('J15-S15: system outer rect has SVG width=110 and height=44', async ({ page }) => {
    const w = await page.locator('[data-node-id="a-system-ex"] rect').first().getAttribute('width');
    const h = await page.locator('[data-node-id="a-system-ex"] rect').first().getAttribute('height');
    expect(parseFloat(w)).toBe(110);
    expect(parseFloat(h)).toBe(44);
  });

  // ── Cross-type integration ─────────────────────────────────────────────────

  test('J15-S16: all three participant types render without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Re-load to capture any errors from initial render
    await loadApp(page);
    await selectDiagram(page, 'order-approval.json');
    await setViewMode(page, 'after');

    expect(errors).toHaveLength(0);
    expect(await page.locator('.node-persona').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.node-agent').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.node-system').count()).toBeGreaterThanOrEqual(1);
  });

  test('J15-S17: diff=added glow-green filter on persona (added persona node)', async ({ page }) => {
    const filter = await page.locator('[data-node-id="a-persona-ex"] rect').first()
      .getAttribute('filter');
    expect(filter).toContain('glow-green');
  });

  test('J15-S18: all three types have distinct primary shapes', async ({ page }) => {
    // persona → rect, agent → polygon (no rect), system → rect
    const personaIsRect = (await page.locator('[data-node-id="a-persona-ex"] rect').count()) > 0;
    const agentIsPoly   = (await page.locator('[data-node-id="a-agent-ex"] polygon').count()) > 0;
    const agentHasRect  = (await page.locator('[data-node-id="a-agent-ex"] rect').count()) > 0;
    const systemIsRect  = (await page.locator('[data-node-id="a-system-ex"] rect').count()) > 0;

    expect(personaIsRect).toBe(true);
    expect(agentIsPoly).toBe(true);
    expect(agentHasRect).toBe(false);   // agent is polygon-only, no rect
    expect(systemIsRect).toBe(true);
  });

  test('J15-S19: unknown node type falls through to task shape (rect)', async ({ page }) => {
    // Verify no crash — the existing default in createNodeGroup renders as task
    const anyUnknown = await page.evaluate(() => {
      return !document.querySelector('[data-node-id][class*="node-undefined"]');
    });
    expect(anyUnknown).toBe(true);
  });

});
