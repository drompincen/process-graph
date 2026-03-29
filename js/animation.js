/**
 * animation.js — Token animation, playback controls, log pane, popup toasts, pane resizer,
 * time-based simulation (7.5), and agent-based simulation (7.6)
 * T15+T16 (merged)
 *
 * Exports: initAnimation, parseDuration
 */

import { state, dom } from './state.js';

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  ready:   'READY',
  wip:     'IN PROGRESS',
  default: 'STEP',
};

const POPUP_ICONS = {
  alert:   '⚠',
  issue:   '🚨',
  amplify: '✅',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Internal state ─────────────────────────────────────────────────────────

/** The live token <circle> element, or null when not playing. */
let _token = null;

/** Active requestAnimationFrame handle for the current step tween. */
let _rafHandle = null;

// ── Token helpers ──────────────────────────────────────────────────────────

/**
 * createToken()
 * Creates and appends the token SVG element to #token-layer.
 * Returns the element.
 */
function createToken() {
  if (_token) _token.remove();

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'anim-token');
  circle.setAttribute('r', '7');
  circle.setAttribute('cx', '0');
  circle.setAttribute('cy', '0');
  circle.setAttribute('fill', '#60a5fa');
  circle.setAttribute('filter', 'url(#token-glow)');

  dom.tokenLayer.appendChild(circle);
  _token = circle;
  return circle;
}

/**
 * moveToken(cx, cy)
 * Teleports the token to the given SVG coordinates instantly.
 */
function moveToken(cx, cy) {
  if (!_token) return;
  _token.setAttribute('cx', String(cx));
  _token.setAttribute('cy', String(cy));
}

// ── Node position helper ───────────────────────────────────────────────────

/**
 * Returns { x, y } center coords for a node from state.layout.
 * Falls back to { x: 0, y: 0 } if layout is missing.
 */
function getNodeCenter(nodeId) {
  if (!state.layout || !state.layout.nodes) return { x: 0, y: 0 };
  const n = state.layout.nodes[nodeId];
  if (!n) {
    console.warn(`[animation] No layout entry for node: ${nodeId}`);
    return { x: 0, y: 0 };
  }
  // layout.nodes stores { x, y, width, height } — use center
  const cx = (n.x != null ? n.x : 0) + (n.width  != null ? n.width  / 2 : 0);
  const cy = (n.y != null ? n.y : 0) + (n.height != null ? n.height / 2 : 0);
  return { x: cx, y: cy };
}

// ── Step badge helpers ─────────────────────────────────────────────────────

/**
 * Adds a small numbered badge SVG group on top of a node.
 * Badges accumulate across steps (they are cleared in clearAnimation).
 */
function addStepBadge(nodeId, stepNumber) {
  if (!dom.tokenLayer) return;
  const { x, y } = getNodeCenter(nodeId);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'step-badge');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(x + 14));
  circle.setAttribute('cy', String(y - 14));
  circle.setAttribute('r', '9');
  circle.setAttribute('fill', '#3b82f6');
  circle.setAttribute('stroke', '#1e40af');
  circle.setAttribute('stroke-width', '1.5');

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(x + 14));
  text.setAttribute('y', String(y - 10));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('fill', '#fff');
  text.setAttribute('font-size', '9');
  text.setAttribute('font-weight', '700');
  text.textContent = String(stepNumber);

  g.appendChild(circle);
  g.appendChild(text);
  dom.tokenLayer.appendChild(g);
}

// ── Log pane ───────────────────────────────────────────────────────────────

/**
 * addLogEntry(step, stepIndex)
 * Appends a styled log row to #log-entries and auto-scrolls to bottom.
 */
function addLogEntry(step, stepIndex) {
  if (!dom.logEntries) return;

  const status = step.status || 'default';
  const labelKey = Object.prototype.hasOwnProperty.call(STATUS_LABEL, status) ? status : 'default';
  const label = STATUS_LABEL[labelKey];

  const entry = document.createElement('div');
  entry.className = `log-entry log-${status}`;

  const spanStep   = document.createElement('span');
  spanStep.className = 'log-step';
  spanStep.textContent = String(stepIndex + 1);

  const spanStatus = document.createElement('span');
  spanStatus.className = 'log-status';
  spanStatus.textContent = label;

  const spanText   = document.createElement('span');
  spanText.className = 'log-text';
  spanText.textContent = step.text || '';

  entry.appendChild(spanStep);
  entry.appendChild(spanStatus);
  entry.appendChild(spanText);
  dom.logEntries.appendChild(entry);

  // Auto-scroll to bottom
  const pane = dom.logPane;
  if (pane) pane.scrollTop = pane.scrollHeight;
}

// ── Popup toasts ───────────────────────────────────────────────────────────

/**
 * showPopup(popup, nodeId, layout)
 * Creates a positioned HTML overlay toast above the given node.
 * Auto-removes after 2500 ms.
 */
function showPopup(popup, nodeId) {
  if (!popup || !dom.stage) return;

  const { x: cx, y: cy } = getNodeCenter(nodeId);

  // Convert SVG coords to stage-relative screen coords via the SVG element's
  // CTM (current transform matrix).
  let screenX = cx;
  let screenY = cy;
  if (dom.diagramSvg) {
    try {
      const svgEl  = dom.diagramSvg;
      const ctm    = svgEl.getScreenCTM();
      const stageRect = dom.stage.getBoundingClientRect();
      if (ctm) {
        screenX = ctm.a * cx + ctm.c * cy + ctm.e - stageRect.left;
        screenY = ctm.b * cx + ctm.d * cy + ctm.f - stageRect.top;
      }
    } catch (_) {
      // Fallback: use raw SVG units
    }
  }

  const type = popup.type || 'alert';
  const icon = POPUP_ICONS[type] || '•';

  const div = document.createElement('div');
  div.className = `popup-toast popup-${type}`;
  div.style.left = `${screenX - 120}px`;
  div.style.top  = `${screenY - 60}px`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'popup-icon';
  iconSpan.textContent = icon;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'popup-msg';
  msgSpan.textContent = popup.msg || '';

  div.appendChild(iconSpan);
  div.appendChild(msgSpan);
  dom.stage.appendChild(div);

  // Fade out then remove after 2500 ms
  setTimeout(() => {
    div.style.transition = 'opacity 0.4s ease';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 400);
  }, 2500);
}

// ── Core animation loop ────────────────────────────────────────────────────

/**
 * animateStep(stepIndex)
 * Moves the token from source node to target node over state.stepDelay ms
 * using requestAnimationFrame linear interpolation.
 * Adds log entry and popup at the start of movement.
 * Calls onStepComplete when done.
 */
function animateStep(stepIndex) {
  const sequence = state.activeSequence;
  if (!sequence || stepIndex >= sequence.length) {
    stopPlayback();
    return;
  }

  state.stepIndex = stepIndex;

  const step = sequence[stepIndex];
  if (!step) { stopPlayback(); return; }

  // Try to find the rendered SVG path for this step's connection so the token
  // travels along the actual edge rather than a straight line.
  const connPath = dom.connectionsLayer
    ? dom.connectionsLayer.querySelector(
        `[data-conn-from="${step.from}"][data-conn-to="${step.to}"]`
      )
    : null;
  const pathLength = connPath ? connPath.getTotalLength() : 0;

  const src = getNodeCenter(step.from);
  const tgt = getNodeCenter(step.to);

  // Place token at source
  if (!_token) createToken();
  moveToken(src.x, src.y);

  // Log entry and popup at step start
  addLogEntry(step, stepIndex);
  if (step.popup) showPopup(step.popup, step.to);

  // Place step badge on the target node
  addStepBadge(step.to, stepIndex + 1);

  const duration = Math.max(50, state.stepDelay);
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (connPath && pathLength > 0) {
      // Follow the SVG path precisely
      const pt = connPath.getPointAtLength(t * pathLength);
      moveToken(pt.x, pt.y);
    } else {
      // Fallback: straight line between centers
      moveToken(
        src.x + (tgt.x - src.x) * t,
        src.y + (tgt.y - src.y) * t
      );
    }

    if (t < 1) {
      _rafHandle = requestAnimationFrame(tick);
    } else {
      _rafHandle = null;
      onStepComplete(stepIndex);
    }
  }

  _rafHandle = requestAnimationFrame(tick);
}

/**
 * onStepComplete(stepIndex)
 * Called when a step finishes animating.
 * Decides whether to pause, advance, or stop.
 */
function onStepComplete(stepIndex) {
  const sequence = state.activeSequence;
  const hasNext  = sequence && (stepIndex + 1 < sequence.length);

  if (state.isPaused || state.pauseEachStep) {
    // Stay at current position; update button icon to show paused
    _updatePlayIcon();
    _setNextButtonEnabled(true);
    return;
  }

  if (hasNext) {
    animateStep(stepIndex + 1);
  } else {
    stopPlayback();
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/**
 * clearAnimation()
 * Cancels any running RAF/timer, removes the token, clears log and toasts.
 */
function clearAnimation() {
  if (_rafHandle != null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
  if (state.animTimer != null) {
    clearTimeout(state.animTimer);
    state.animTimer = null;
  }
  if (_token) {
    _token.remove();
    _token = null;
  }
  // Remove step badges from token-layer
  if (dom.tokenLayer) {
    const badges = dom.tokenLayer.querySelectorAll('.step-badge');
    badges.forEach(b => b.remove());
  }
  // Clear log entries
  if (dom.logEntries) {
    dom.logEntries.innerHTML = '';
  }
  // Remove any lingering popup toasts
  if (dom.stage) {
    dom.stage.querySelectorAll('.popup-toast').forEach(el => el.remove());
  }
}

/**
 * stopPlayback()
 * Fully stops playback and resets state flags.
 */
function stopPlayback() {
  state.isPlaying = false;
  state.isPaused  = false;
  clearAnimation();
  _updatePlayIcon();
  _setNextButtonEnabled(false);
  _setFfButtonEnabled(false);
}

// ── Button state helpers ───────────────────────────────────────────────────

function _updatePlayIcon() {
  if (!dom.btnPlay) return;
  if (state.isPlaying && !state.isPaused) {
    dom.btnPlay.textContent = '⏸ Pause';
  } else {
    dom.btnPlay.textContent = '▶ Simulate';
  }
}

function _setNextButtonEnabled(enabled) {
  if (dom.btnNext) dom.btnNext.disabled = !enabled;
}

function _setFfButtonEnabled(enabled) {
  if (dom.btnFf) dom.btnFf.disabled = !enabled;
}

// ── Pane resizer ───────────────────────────────────────────────────────────

function _initPaneResizer() {
  const resizer = dom.paneResizer;
  const logPane = dom.logPane;
  if (!resizer || !logPane) return;

  let dragging = false;

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newHeight = Math.min(400, Math.max(60, window.innerHeight - e.clientY));
    logPane.style.height = `${newHeight}px`;
    state.logHeight = newHeight;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
}

// ── Duration parsing ────────────────────────────────────────────────────────

/**
 * parseDuration(str)
 * Converts a duration string like "2h", "30m", "1d", "1.5h" to minutes.
 *   h = 60 min, d = 480 min (8-hour day), m = 1 min
 * Defaults to 0 if unparseable.
 *
 * @param {string} str
 * @returns {number} minutes
 */
export function parseDuration(str) {
  if (!str || typeof str !== 'string') return 0;
  const trimmed = str.trim().toLowerCase();
  if (!trimmed) return 0;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(d|h|m)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit  = match[2] || 'm';

  switch (unit) {
    case 'd': return value * 480;
    case 'h': return value * 60;
    case 'm': return value;
    default:  return value;
  }
}

/**
 * formatMinutes(totalMinutes)
 * Formats minutes into a human-readable string: "2d 3h 15m" or "45m".
 */
function formatMinutes(totalMinutes) {
  if (totalMinutes <= 0) return '0m';
  const days  = Math.floor(totalMinutes / 480);
  const rem   = totalMinutes % 480;
  const hours = Math.floor(rem / 60);
  const mins  = Math.round(rem % 60);
  const parts = [];
  if (days  > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins  > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '0m';
}

/**
 * formatClockTime(totalMinutes)
 * Formats a running clock display: "HH:MM" (process hours:minutes).
 */
function formatClockTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Graph traversal helpers for simulation ──────────────────────────────────

/**
 * Find the start-event node in a graph.
 */
function findStart(graph) {
  return graph.nodes.find(n => n.type === 'start-event') || graph.nodes[0];
}

/**
 * Get the next node(s) from a given node. For gateways, returns all outgoing
 * connections with their probabilities.
 * @returns {Array<{nodeId: string, probability: number, connection: object}>}
 */
function getOutgoing(graph, nodeId) {
  const conns = (graph.connections || []).filter(c => c.from === nodeId);
  if (conns.length === 0) return [];

  const node = graph.nodes.find(n => n.id === nodeId);
  const isGateway = node && node.type === 'gateway';

  return conns.map(c => {
    // Support probability field on connections for decision branches
    const prob = (c.probability != null) ? c.probability : null;
    return { nodeId: c.to, probability: prob, connection: c };
  });
}

/**
 * Pick a random outgoing target, respecting probabilities if defined.
 */
function pickNextNode(graph, nodeId) {
  const outs = getOutgoing(graph, nodeId);
  if (outs.length === 0) return null;
  if (outs.length === 1) return outs[0].nodeId;

  // Check if any probabilities are defined
  const hasProbabilities = outs.some(o => o.probability != null);
  if (hasProbabilities) {
    // Normalize probabilities
    let total = 0;
    for (const o of outs) total += (o.probability || 0);
    if (total <= 0) {
      // Fallback to equal
      return outs[Math.floor(Math.random() * outs.length)].nodeId;
    }
    let r = Math.random() * total;
    for (const o of outs) {
      r -= (o.probability || 0);
      if (r <= 0) return o.nodeId;
    }
    return outs[outs.length - 1].nodeId;
  }

  // Equal probability
  return outs[Math.floor(Math.random() * outs.length)].nodeId;
}

// ── Time Simulation (7.5) ──────────────────────────────────────────────────

/** Active time simulation state, or null. */
let _timeSim = null;
let _timeSimSpeed = 2;
let _timeSimRaf = null;

function _updateSimClock(minutes) {
  if (dom.simClock) {
    dom.simClock.textContent = formatClockTime(minutes);
  }
}

function _showSimControls(show) {
  if (dom.simClock)      dom.simClock.style.display      = show ? '' : 'none';
  if (dom.simSpeedGroup) dom.simSpeedGroup.style.display  = show ? '' : 'none';
}

/**
 * Show a summary popup with simulation results.
 */
function showSimulationSummary(data) {
  const overlay = dom.simOverlay;
  if (!overlay) return;

  const card = document.createElement('div');
  card.className = 'sim-summary';
  card.innerHTML = `<h3>${data.title || 'Simulation Complete'}</h3>`;

  const table = document.createElement('table');
  for (const [label, value] of data.rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = label;
    const td2 = document.createElement('td');
    td2.textContent = value;
    tr.appendChild(td1);
    tr.appendChild(td2);
    table.appendChild(tr);
  }
  card.appendChild(table);

  const btn = document.createElement('button');
  btn.className = 'btn-close-sim';
  btn.textContent = 'Close';
  btn.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  });
  card.appendChild(btn);

  overlay.innerHTML = '';
  overlay.appendChild(card);
  overlay.style.display = 'flex';
}

/**
 * Run a time-based simulation:
 *  - Single token follows the process from start to end
 *  - Pauses at each task for (duration / speed) real milliseconds
 *  - Shows running clock and speed controls
 *  - At completion, shows summary with total time, longest path, bottleneck
 */
function runTimedSimulation() {
  const graph = state.graph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) return;
  if (!state.layout || !state.layout.nodes) return;

  // Stop any existing playback
  stopPlayback();
  _stopTimeSim();
  _stopAgentSim();

  const startNode = findStart(graph);
  if (!startNode) return;

  _showSimControls(true);
  _updateSimClock(0);

  const sim = {
    currentNodeId: startNode.id,
    elapsedMinutes: 0,
    path: [],       // { nodeId, arrivedAt, duration }
    running: true,
  };
  _timeSim = sim;

  // Create token
  clearAnimation();
  const token = createToken();

  function step() {
    if (!sim.running) return;

    const node = graph.nodes.find(n => n.id === sim.currentNodeId);
    if (!node) { finishTimeSim(); return; }

    const durationMins = parseDuration(node.duration || '0m');
    sim.path.push({
      nodeId: node.id,
      label: (node.label || node.id).replace(/\\n/g, ' '),
      arrivedAt: sim.elapsedMinutes,
      duration: durationMins,
    });
    sim.elapsedMinutes += durationMins;
    _updateSimClock(sim.elapsedMinutes);

    // Move token to this node
    const pos = getNodeCenter(node.id);
    moveToken(pos.x, pos.y);
    addStepBadge(node.id, sim.path.length);

    // If end event, finish
    if (node.type === 'end-event') {
      finishTimeSim();
      return;
    }

    // Calculate real-time delay for the duration
    // 1 process minute = (1000 / speed) real ms, minimum 50ms per step
    const realMs = Math.max(50, (durationMins * 1000) / _timeSimSpeed);

    // Pause at this node, then move to next
    _timeSimRaf = setTimeout(() => {
      if (!sim.running) return;
      const nextId = pickNextNode(graph, node.id);
      if (!nextId) { finishTimeSim(); return; }

      // Animate movement along edge
      const src = getNodeCenter(node.id);
      const tgt = getNodeCenter(nextId);
      const connPath = dom.connectionsLayer
        ? dom.connectionsLayer.querySelector(
            `[data-conn-from="${node.id}"][data-conn-to="${nextId}"]`
          )
        : null;
      const pathLength = connPath ? connPath.getTotalLength() : 0;

      const moveDuration = Math.max(50, 300 / _timeSimSpeed);
      const moveStart = performance.now();

      function moveTick(now) {
        if (!sim.running) return;
        const elapsed = now - moveStart;
        const t = Math.min(elapsed / moveDuration, 1);

        if (connPath && pathLength > 0) {
          const pt = connPath.getPointAtLength(t * pathLength);
          moveToken(pt.x, pt.y);
        } else {
          moveToken(
            src.x + (tgt.x - src.x) * t,
            src.y + (tgt.y - src.y) * t
          );
        }

        if (t < 1) {
          _timeSimRaf = requestAnimationFrame(moveTick);
        } else {
          sim.currentNodeId = nextId;
          step();
        }
      }

      _timeSimRaf = requestAnimationFrame(moveTick);
    }, realMs);
  }

  function finishTimeSim() {
    sim.running = false;
    _showSimControls(false);

    // Find bottleneck (task with longest duration)
    const tasks = sim.path.filter(p => {
      const n = graph.nodes.find(nn => nn.id === p.nodeId);
      return n && (n.type === 'task' || n.type === 'subprocess');
    });
    const bottleneck = tasks.reduce((max, p) =>
      (p.duration > (max ? max.duration : 0)) ? p : max, null);

    const rows = [
      ['Total process time', formatMinutes(sim.elapsedMinutes)],
      ['Steps traversed', String(sim.path.length)],
    ];
    if (bottleneck) {
      rows.push(['Bottleneck', `${bottleneck.label} (${formatMinutes(bottleneck.duration)})`]);
    }
    // List tasks with their durations
    for (const p of tasks) {
      rows.push([`  ${p.label}`, formatMinutes(p.duration)]);
    }

    showSimulationSummary({
      title: 'Time Simulation Complete',
      rows,
    });
  }

  step();
}

function _stopTimeSim() {
  if (_timeSim) {
    _timeSim.running = false;
    _timeSim = null;
  }
  if (_timeSimRaf != null) {
    clearTimeout(_timeSimRaf);
    cancelAnimationFrame(_timeSimRaf);
    _timeSimRaf = null;
  }
  _showSimControls(false);
}

// ── Agent-Based Simulation (7.6) ───────────────────────────────────────────

/** Agent sim token colors */
const AGENT_COLORS = [
  '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa',
  '#fb923c', '#38bdf8', '#4ade80', '#e879f9', '#f87171',
  '#2dd4bf', '#818cf8', '#facc15', '#fb7185', '#22d3ee',
  '#a3e635', '#c084fc', '#f97316', '#14b8a6', '#ec4899',
];

let _agentSim = null;
let _agentSimTimer = null;

/**
 * Run agent-based simulation with multiple tokens.
 *
 * @param {number} numTokens   - number of tokens (1-100, default 10)
 * @param {number} spawnInterval - ms between spawning tokens (default 500)
 */
function runAgentSimulation(numTokens = 10, spawnInterval = 500) {
  const graph = state.graph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) return;
  if (!state.layout || !state.layout.nodes) return;

  // Stop any existing playback
  stopPlayback();
  _stopTimeSim();
  _stopAgentSim();

  const startNode = findStart(graph);
  if (!startNode) return;

  _showSimControls(true);
  _updateSimClock(0);

  clearAnimation();

  const sim = {
    running: true,
    tokens: [],         // { id, nodeId, circle, color, startTime, endTime, path: [], active }
    completed: [],      // finished tokens
    spawned: 0,
    numTokens,
    spawnInterval,
    startTime: performance.now(),
    elapsedMinutes: 0,
  };
  _agentSim = sim;

  function createAgentToken(index) {
    const color = AGENT_COLORS[index % AGENT_COLORS.length];
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'agent-token');
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', color);
    circle.setAttribute('opacity', '0.85');
    circle.setAttribute('filter', 'url(#token-glow)');
    if (dom.tokenLayer) dom.tokenLayer.appendChild(circle);

    const pos = getNodeCenter(startNode.id);
    circle.setAttribute('cx', String(pos.x));
    circle.setAttribute('cy', String(pos.y));

    return {
      id: `agent-${index}`,
      nodeId: startNode.id,
      circle,
      color,
      startTime: performance.now(),
      endTime: null,
      path: [startNode.id],
      active: true,
      waitUntil: 0,  // timestamp when token can move next
    };
  }

  function moveAgentToken(token, nodeId) {
    const pos = getNodeCenter(nodeId);
    // Add small random offset so overlapping tokens are visible
    const jx = (Math.random() - 0.5) * 10;
    const jy = (Math.random() - 0.5) * 10;
    token.circle.setAttribute('cx', String(pos.x + jx));
    token.circle.setAttribute('cy', String(pos.y + jy));
    token.nodeId = nodeId;
    token.path.push(nodeId);
  }

  function tickSimulation() {
    if (!sim.running) return;

    const now = performance.now();
    sim.elapsedMinutes = ((now - sim.startTime) / 1000) * _timeSimSpeed;
    _updateSimClock(sim.elapsedMinutes);

    // Spawn new tokens at intervals
    if (sim.spawned < sim.numTokens) {
      const shouldHaveSpawned = Math.floor((now - sim.startTime) / sim.spawnInterval) + 1;
      while (sim.spawned < shouldHaveSpawned && sim.spawned < sim.numTokens) {
        const token = createAgentToken(sim.spawned);
        sim.tokens.push(token);
        sim.spawned++;
      }
    }

    // Advance each active token
    for (const token of sim.tokens) {
      if (!token.active) continue;
      if (now < token.waitUntil) continue;

      const node = graph.nodes.find(n => n.id === token.nodeId);
      if (!node) { token.active = false; continue; }

      // If at end, mark complete
      if (node.type === 'end-event') {
        token.active = false;
        token.endTime = now;
        token.circle.setAttribute('opacity', '0.3');
        sim.completed.push(token);
        continue;
      }

      // Get duration and apply wait
      const durationMins = parseDuration(node.duration || '0m');
      const realWaitMs = (durationMins * 1000) / _timeSimSpeed;

      if (token.waitUntil === 0 && realWaitMs > 0) {
        // First visit to this node: start waiting
        token.waitUntil = now + Math.max(50, realWaitMs);
        continue;
      }

      // Move to next node
      const nextId = pickNextNode(graph, token.nodeId);
      if (!nextId) {
        token.active = false;
        token.endTime = now;
        sim.completed.push(token);
        continue;
      }

      token.waitUntil = 0; // Reset wait for next node
      moveAgentToken(token, nextId);
    }

    // Check if all tokens are done
    const allDone = sim.tokens.length >= sim.numTokens &&
      sim.tokens.every(t => !t.active);

    if (allDone) {
      finishAgentSim();
      return;
    }

    _agentSimTimer = requestAnimationFrame(tickSimulation);
  }

  function finishAgentSim() {
    sim.running = false;
    _showSimControls(false);

    // Compute statistics
    const cycleTimes = sim.completed
      .map(t => t.endTime - t.startTime)
      .sort((a, b) => a - b);

    const completions = cycleTimes.length;
    const totalRealMs = sim.completed.length > 0
      ? Math.max(...sim.completed.map(t => t.endTime)) - sim.startTime
      : 0;

    const avg = completions > 0
      ? cycleTimes.reduce((s, v) => s + v, 0) / completions : 0;
    const p50 = completions > 0 ? cycleTimes[Math.floor(completions * 0.50)] : 0;
    const p90 = completions > 0 ? cycleTimes[Math.floor(completions * 0.90)] : 0;
    const p99 = completions > 0 ? cycleTimes[Math.floor(completions * 0.99)] : 0;
    const throughput = totalRealMs > 0
      ? (completions / (totalRealMs / 1000)).toFixed(2) : '0';

    // Scale real ms to process minutes for display
    const scaleFactor = _timeSimSpeed;
    const fmtMs = (ms) => formatMinutes((ms / 1000) * scaleFactor);

    const rows = [
      ['Tokens completed', `${completions} / ${sim.numTokens}`],
      ['Total real time', `${(totalRealMs / 1000).toFixed(1)}s`],
      ['Throughput', `${throughput} completions/sec`],
      ['Average cycle time', fmtMs(avg)],
      ['P50 cycle time', fmtMs(p50)],
      ['P90 cycle time', fmtMs(p90)],
      ['P99 cycle time', fmtMs(p99)],
    ];

    showSimulationSummary({
      title: 'Agent Simulation Complete',
      rows,
    });
  }

  _agentSimTimer = requestAnimationFrame(tickSimulation);
}

function _stopAgentSim() {
  if (_agentSim) {
    _agentSim.running = false;
    // Remove all agent tokens from SVG
    for (const token of _agentSim.tokens) {
      if (token.circle && token.circle.parentNode) {
        token.circle.remove();
      }
    }
    _agentSim = null;
  }
  if (_agentSimTimer != null) {
    cancelAnimationFrame(_agentSimTimer);
    _agentSimTimer = null;
  }
}

// ── Public initialiser ─────────────────────────────────────────────────────

/**
 * initAnimation()
 * Wire up all playback controls and the pane resizer.
 * Call once after DOMContentLoaded and initDom().
 */
export function initAnimation() {

  // ── Play / Pause button ─────────────────────────────────────────────────
  if (dom.btnPlay) {
    dom.btnPlay.addEventListener('click', () => {
      const sequence = state.activeSequence;
      if (!sequence || sequence.length === 0) return;

      if (!state.isPlaying) {
        // Require a rendered layout before starting
        if (!state.layout || !state.layout.nodes) return;
        // Start playback from the beginning
        state.isPlaying = true;
        state.isPaused  = false;
        state.stepIndex = 0;
        clearAnimation();
        createToken();
        _updatePlayIcon();
        _setNextButtonEnabled(false);
        _setFfButtonEnabled(true);
        animateStep(0);
      } else {
        // Toggle pause
        state.isPaused = !state.isPaused;
        _updatePlayIcon();
        if (!state.isPaused) {
          // Resume from where we left off
          _setNextButtonEnabled(false);
          animateStep(state.stepIndex);
        } else {
          // Cancel any in-progress tween so token freezes immediately
          if (_rafHandle != null) {
            cancelAnimationFrame(_rafHandle);
            _rafHandle = null;
          }
          _setNextButtonEnabled(true);
        }
      }
    });
  }

  // ── Next-step button ────────────────────────────────────────────────────
  if (dom.btnNext) {
    dom.btnNext.addEventListener('click', () => {
      const sequence = state.activeSequence;
      if (!sequence || sequence.length === 0) return;

      // Allow stepping when paused or when not yet playing
      const canStep = state.isPaused || state.pauseEachStep || !state.isPlaying;
      if (!canStep) return;

      // Cancel any in-progress tween first
      if (_rafHandle != null) {
        cancelAnimationFrame(_rafHandle);
        _rafHandle = null;
      }

      const nextIndex = state.isPlaying
        ? state.stepIndex + 1
        : 0;

      if (nextIndex >= sequence.length) {
        stopPlayback();
        return;
      }

      if (!state.isPlaying) {
        state.isPlaying = true;
        state.isPaused  = true;
        clearAnimation();
        createToken();
        _updatePlayIcon();
        _setFfButtonEnabled(true);
      }

      animateStep(nextIndex);
      // Keep next-step available (onStepComplete handles re-enabling when paused)
    });
  }

  // ── Fast-forward button ─────────────────────────────────────────────────
  if (dom.btnFf) {
    dom.btnFf.addEventListener('click', () => {
      state.stepDelay = 200;
      // Update slider / label to reflect the new speed
      if (dom.delaySlider) dom.delaySlider.value = String(0.2);
      if (dom.delayLabel)  dom.delayLabel.textContent = '0.2s';

      // Restart if currently playing so the new delay takes effect
      if (state.isPlaying && !state.isPaused) {
        if (_rafHandle != null) {
          cancelAnimationFrame(_rafHandle);
          _rafHandle = null;
        }
        animateStep(state.stepIndex);
      }
    });
  }

  // ── Delay slider ────────────────────────────────────────────────────────
  if (dom.delaySlider) {
    dom.delaySlider.addEventListener('input', () => {
      const val = parseFloat(dom.delaySlider.value);
      state.stepDelay = val * 1000;
      if (dom.delayLabel) {
        dom.delayLabel.textContent = `${val.toFixed(1)}s`;
      }
    });
  }

  // ── Pause-each-step checkbox ────────────────────────────────────────────
  if (dom.chkPauseStep) {
    dom.chkPauseStep.addEventListener('change', () => {
      state.pauseEachStep = dom.chkPauseStep.checked;
    });
  }

  // ── Pane resizer ────────────────────────────────────────────────────────
  _initPaneResizer();

  // ── Time Simulation button ─────────────────────────────────────────────
  if (dom.btnTimeSim) {
    dom.btnTimeSim.addEventListener('click', () => {
      runTimedSimulation();
    });
  }

  // ── Agent Simulation button ────────────────────────────────────────────
  if (dom.btnAgentSim) {
    dom.btnAgentSim.addEventListener('click', () => {
      // Prompt for number of tokens via a simple approach:
      // Default 10, can be customised by holding Shift for a prompt
      let numTokens = 10;
      runAgentSimulation(numTokens, 500);
    });
  }

  // ── Speed buttons ──────────────────────────────────────────────────────
  if (dom.simSpeedGroup) {
    dom.simSpeedGroup.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _timeSimSpeed = parseInt(btn.dataset.speed, 10) || 2;
        dom.simSpeedGroup.querySelectorAll('.speed-btn').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
      });
    });
  }

  // ── Header playback buttons (flow animation along sequence steps) ──────
  const btnPlayFlow = dom.btnPlayFlow;
  const btnFfFlow   = dom.btnFfFlow;
  const btnRewind   = dom.btnRewind;

  function updateHeaderPlayIcon() {
    if (!btnPlayFlow) return;
    if (state.isPlaying && !state.isPaused) {
      btnPlayFlow.textContent = '⏸';
      btnPlayFlow.title = 'Pause flow animation';
    } else {
      btnPlayFlow.textContent = '▶';
      btnPlayFlow.title = 'Animate flow sequence';
    }
  }

  if (btnRewind) {
    btnRewind.addEventListener('click', () => {
      stopPlayback();
      updateHeaderPlayIcon();
    });
  }

  if (btnPlayFlow) {
    btnPlayFlow.addEventListener('click', () => {
      const sequence = state.activeSequence;
      if (!sequence || sequence.length === 0) return;

      if (!state.isPlaying) {
        if (!state.layout || !state.layout.nodes) return;
        state.isPlaying = true;
        state.isPaused  = false;
        state.stepIndex = 0;
        clearAnimation();
        createToken();
        _updatePlayIcon();
        _setNextButtonEnabled(false);
        _setFfButtonEnabled(true);
        updateHeaderPlayIcon();
        animateStep(0);
      } else {
        state.isPaused = !state.isPaused;
        _updatePlayIcon();
        updateHeaderPlayIcon();
        if (!state.isPaused) {
          _setNextButtonEnabled(false);
          animateStep(state.stepIndex);
        } else {
          if (_rafHandle != null) {
            cancelAnimationFrame(_rafHandle);
            _rafHandle = null;
          }
          _setNextButtonEnabled(true);
        }
      }
    });
  }

  if (btnFfFlow) {
    btnFfFlow.addEventListener('click', () => {
      // Fast-forward: set very short delay and restart from current step
      state.stepDelay = 200;
      if (dom.delaySlider) dom.delaySlider.value = String(0.2);
      if (dom.delayLabel)  dom.delayLabel.textContent = '0.2s';

      const sequence = state.activeSequence;
      if (!sequence || sequence.length === 0) return;

      if (!state.isPlaying) {
        if (!state.layout || !state.layout.nodes) return;
        state.isPlaying = true;
        state.isPaused  = false;
        state.stepIndex = 0;
        clearAnimation();
        createToken();
        _updatePlayIcon();
        updateHeaderPlayIcon();
        animateStep(0);
      } else if (state.isPaused) {
        state.isPaused = false;
        _updatePlayIcon();
        updateHeaderPlayIcon();
        if (_rafHandle != null) {
          cancelAnimationFrame(_rafHandle);
          _rafHandle = null;
        }
        animateStep(state.stepIndex);
      }
    });
  }

  // Listen for flow-rewind custom event (from inline script fallback)
  window.addEventListener('flow-rewind', () => {
    stopPlayback();
    updateHeaderPlayIcon();
  });
}
