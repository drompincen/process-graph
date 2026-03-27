import { test, expect } from '@playwright/test';
import { loadApp, selectDiagram, setViewMode } from './helpers.js';
import { getAllConnections, getAllNodeBBoxes, parsePathToWaypoints, lineIntersectsRect } from './geo-helpers.js';

test('debug b-c8', async ({ page }) => {
  await loadApp(page);
  await selectDiagram(page, 'manufacturing-fulfillment.json');
  await setViewMode(page, 'before');
  await page.waitForTimeout(500);
  const conns = await getAllConnections(page);
  const boxes = await getAllNodeBBoxes(page);
  const boxMap = {};
  for (const b of boxes) boxMap[b.id] = b;
  const conn = conns.find(c => c.id === 'b-c8');
  if (!conn) { console.log('NOT FOUND'); return; }
  console.log('b-c8 path:', conn.d);
  console.log('from:', conn.from, JSON.stringify(boxMap[conn.from]));
  console.log('to:', conn.to, JSON.stringify(boxMap[conn.to]));
  console.log('b-procure:', JSON.stringify(boxMap['b-procure']));
  const wp = parsePathToWaypoints(conn.d);
  const hitBox = boxMap['b-procure'];
  const shrink = 5;
  for (let i = 1; i < wp.length; i++) {
    if (lineIntersectsRect(wp[i-1][0], wp[i-1][1], wp[i][0], wp[i][1],
        hitBox.x + shrink, hitBox.y + shrink, hitBox.x + hitBox.w - shrink, hitBox.y + hitBox.h - shrink)) {
      console.log('HITS seg', i-1, '->', i, JSON.stringify(wp[i-1]), '->', JSON.stringify(wp[i]));
    }
  }
  expect(true).toBe(true);
});
