/**
 * global-teardown.js — Kill the JBang backend after all tests complete.
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';

const PID_FILE = '/tmp/pg-backend.pid';

export default async function globalTeardown() {
  const pidStr = process.env.PG_BACKEND_PID
    || (existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf8').trim() : null);

  if (!pidStr) {
    console.warn('[teardown] No backend PID found — skipping kill');
    return;
  }

  const pid = parseInt(pidStr, 10);
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[teardown] Sent SIGTERM to backend (pid ${pid})`);
  } catch (err) {
    if (err.code !== 'ESRCH') console.warn(`[teardown] kill(${pid}) failed:`, err.message);
  }

  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
}
