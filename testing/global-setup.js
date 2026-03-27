/**
 * global-setup.js — Start the JBang Spring Boot backend before any tests run.
 *
 * Waits up to 60s for port 8080 to become reachable, then writes the
 * child-process PID to /tmp/pg-backend.pid so global-teardown.js can kill it.
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PORT = 8080;
const PID_FILE = '/tmp/pg-backend.pid';
const STARTUP_TIMEOUT_MS = 60_000;

/** Poll until TCP port is open or timeout expires. */
function waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('timeout', () => { socket.destroy(); retry(); });
      socket.on('error', () => retry());
      socket.connect(port, '127.0.0.1');
    }

    function retry() {
      if (Date.now() >= deadline) {
        reject(new Error(`Port ${port} not open within ${timeoutMs}ms`));
      } else {
        setTimeout(attempt, 500);
      }
    }

    attempt();
  });
}

export default async function globalSetup() {
  console.log('[setup] Starting JBang backend…');

  const child = spawn('jbang', ['ProcessGraph.java'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout.on('data', d => process.stdout.write('[backend] ' + d));
  child.stderr.on('data', d => process.stderr.write('[backend] ' + d));

  child.on('error', err => {
    throw new Error(`Failed to start jbang: ${err.message}. Is JBang installed and on PATH?`);
  });

  writeFileSync(PID_FILE, String(child.pid));

  // Expose pid via env so teardown can find it even without the file
  process.env.PG_BACKEND_PID = String(child.pid);

  try {
    await waitForPort(PORT, STARTUP_TIMEOUT_MS);
    console.log(`[setup] Backend ready on port ${PORT} (pid ${child.pid})`);
  } catch (err) {
    child.kill();
    throw err;
  }
}
