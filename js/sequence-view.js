/**
 * sequence-view.js — UML sequence diagram renderer
 * Renders a UML-style sequence diagram in #sequence-svg when the
 * "Sequence View" checkbox is checked.
 */
import { state, dom } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Helper ──────────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

// ─── Status dot colour map ────────────────────────────────────────────────────

function statusColor(status) {
  if (status === 'ready') return '#22c55e';
  if (status === 'wip')   return '#f59e0b';
  return '#60a5fa';
}

// ─── Main renderer ────────────────────────────────────────────────────────────

/**
 * Render a UML sequence diagram into #sequence-svg based on the current graph
 * and active sequence data.
 *
 * @param {Object} graph — parsed diagram JSON
 */
export function renderSequenceView(graph) {
  const svg = dom.sequenceSvg;
  if (!svg) return;

  // Clear previous content
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const lanes = graph.lanes || [];
  if (lanes.length === 0) return;

  // Resolve the sequence steps to display
  const steps =
    (state.activeSequence && state.activeSequence.length > 0)
      ? state.activeSequence
      : (graph.sequence || []);

  // ── Layout constants ──────────────────────────────────────────────────────

  const containerWidth = svg.parentElement
    ? svg.parentElement.clientWidth || 800
    : 800;
  const svgWidth  = Math.max(containerWidth, 800);
  const laneCount = lanes.length;
  const spacing   = svgWidth / (laneCount + 1);

  const HEADER_H    = 50;    // px reserved for lifeline labels
  const STEP_H      = 40;    // px per sequence step row
  const BOTTOM_PAD  = 20;    // px below last step
  const svgHeight   = HEADER_H + steps.length * STEP_H + BOTTOM_PAD;

  svg.setAttribute('width',   svgWidth);
  svg.setAttribute('height',  svgHeight);
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  // Build a quick lookup: laneId → X position
  const laneX = {};
  lanes.forEach((lane, i) => {
    laneX[lane.id] = spacing * (i + 1);
  });

  // Build a quick lookup: nodeId → laneId
  const nodeToLane = {};
  (graph.nodes || []).forEach(n => {
    nodeToLane[n.id] = n.lane;
  });

  // ── Draw lifeline dashed vertical lines ──────────────────────────────────

  lanes.forEach(lane => {
    const x = laneX[lane.id];

    svg.appendChild(svgEl('line', {
      x1: x, y1: HEADER_H,
      x2: x, y2: svgHeight - BOTTOM_PAD,
      stroke: '#2a3a4a',
      'stroke-width': 1,
      'stroke-dasharray': '5,4',
    }));
  });

  // ── Draw lifeline header boxes ────────────────────────────────────────────

  const LABEL_W = Math.min(spacing * 0.75, 100);
  const LABEL_H = 28;

  lanes.forEach(lane => {
    const x = laneX[lane.id];

    // Background rect
    svg.appendChild(svgEl('rect', {
      x:      x - LABEL_W / 2,
      y:      (HEADER_H - LABEL_H) / 2,
      width:  LABEL_W,
      height: LABEL_H,
      rx:     4,
      fill:   lane.color || '#2a3a4a',
    }));

    // Lane label text
    const txt = svgEl('text', {
      x:                x,
      y:                HEADER_H / 2 + 1,
      'text-anchor':    'middle',
      'dominant-baseline': 'middle',
      fill:             '#ffffff',
      'font-size':      11,
      'font-family':    'sans-serif',
      'font-weight':    '600',
    });
    txt.textContent = lane.label || lane.id;
    svg.appendChild(txt);
  });

  // ── Draw sequence step arrows ─────────────────────────────────────────────

  if (steps.length === 0) {
    // No steps — show a placeholder message
    const msg = svgEl('text', {
      x:             svgWidth / 2,
      y:             HEADER_H + 30,
      'text-anchor': 'middle',
      fill:          '#94a3b8',
      'font-size':   12,
      'font-family': 'sans-serif',
    });
    msg.textContent = 'No sequence steps defined.';
    svg.appendChild(msg);
    return;
  }

  const ARROW_HEAD_SIZE = 6;

  steps.forEach((step, idx) => {
    const fromLane = nodeToLane[step.from];
    const toLane   = nodeToLane[step.to];

    // If either node cannot be mapped to a lane, skip this step gracefully
    if (!fromLane || !toLane || laneX[fromLane] === undefined || laneX[toLane] === undefined) {
      return;
    }

    const x1 = laneX[fromLane];
    const x2 = laneX[toLane];
    const y  = HEADER_H + idx * STEP_H + STEP_H / 2;

    const goingRight = x2 >= x1;

    // ── Arrow shaft ────────────────────────────────────────────────────────

    // For self-referencing steps (same lane) draw a small loop indicator
    if (fromLane === toLane) {
      const loopW = spacing * 0.3;
      const loopH = STEP_H * 0.6;

      // Three-segment path: right → down → left back
      const path = svgEl('path', {
        d: [
          `M ${x1} ${y - loopH / 2}`,
          `L ${x1 + loopW} ${y - loopH / 2}`,
          `L ${x1 + loopW} ${y + loopH / 2}`,
          `L ${x1} ${y + loopH / 2}`,
        ].join(' '),
        stroke:       '#94a3b8',
        'stroke-width': 1.5,
        fill:         'none',
      });
      svg.appendChild(path);

      // Arrowhead pointing left at (x1, y + loopH/2)
      const tipX = x1;
      const tipY = y + loopH / 2;
      const arrow = svgEl('polygon', {
        points: `${tipX},${tipY} ${tipX + ARROW_HEAD_SIZE},${tipY - ARROW_HEAD_SIZE / 2} ${tipX + ARROW_HEAD_SIZE},${tipY + ARROW_HEAD_SIZE / 2}`,
        fill: '#94a3b8',
      });
      svg.appendChild(arrow);

      // Label above the loop
      if (step.text) {
        const lbl = svgEl('text', {
          x:             x1 + loopW / 2,
          y:             y - loopH / 2 - 4,
          'text-anchor': 'middle',
          fill:          '#94a3b8',
          'font-size':   10,
          'font-family': 'sans-serif',
        });
        lbl.textContent = step.text;
        svg.appendChild(lbl);
      }

      // Status dot at start
      svg.appendChild(svgEl('circle', {
        cx:   x1,
        cy:   y - loopH / 2,
        r:    4,
        fill: statusColor(step.status),
      }));

      return;
    }

    // Normal arrow between two different lifelines

    // Shaft line
    svg.appendChild(svgEl('line', {
      x1, y1: y,
      x2, y2: y,
      stroke:         '#94a3b8',
      'stroke-width': 1.5,
    }));

    // Arrowhead — filled triangle at the tip (x2 side)
    let arrowPoints;
    if (goingRight) {
      // Arrow pointing right → tip at x2
      arrowPoints = [
        `${x2},${y}`,
        `${x2 - ARROW_HEAD_SIZE},${y - ARROW_HEAD_SIZE / 2}`,
        `${x2 - ARROW_HEAD_SIZE},${y + ARROW_HEAD_SIZE / 2}`,
      ].join(' ');
    } else {
      // Arrow pointing left → tip at x2
      arrowPoints = [
        `${x2},${y}`,
        `${x2 + ARROW_HEAD_SIZE},${y - ARROW_HEAD_SIZE / 2}`,
        `${x2 + ARROW_HEAD_SIZE},${y + ARROW_HEAD_SIZE / 2}`,
      ].join(' ');
    }

    svg.appendChild(svgEl('polygon', {
      points: arrowPoints,
      fill:   '#94a3b8',
    }));

    // ── Label (above the arrow, centred) ──────────────────────────────────

    if (step.text) {
      const midX = (x1 + x2) / 2;
      const lbl  = svgEl('text', {
        x:             midX,
        y:             y - 6,
        'text-anchor': 'middle',
        fill:          '#94a3b8',
        'font-size':   10,
        'font-family': 'sans-serif',
      });
      lbl.textContent = step.text;
      svg.appendChild(lbl);
    }

    // ── Status dot (at the tail / start of arrow) ──────────────────────────

    svg.appendChild(svgEl('circle', {
      cx:   x1,
      cy:   y,
      r:    4,
      fill: statusColor(step.status),
    }));
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Wire the #chk-sequence-view checkbox and set initial hidden state.
 * Call once after the DOM and graph are ready.
 *
 * @param {Object} graph — parsed diagram JSON
 */
export function initSequenceView(graph) {
  // Ensure the container starts hidden
  if (dom.sequenceContainer) {
    dom.sequenceContainer.style.display = 'none';
  }

  const chk = dom.chkSequenceView;
  if (!chk) return;

  chk.addEventListener('change', () => {
    if (chk.checked) {
      if (dom.sequenceContainer) dom.sequenceContainer.style.display = '';
      renderSequenceView(graph);
    } else {
      if (dom.sequenceContainer) dom.sequenceContainer.style.display = 'none';
    }
  });
}
