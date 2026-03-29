/**
 * renderer.js — SVG defs injection, dimension setup, lane rendering, and node shape rendering.
 *
 * Implements:
 *   svgEl(tag, attrs)                    — create SVG element with namespace + attributes
 *   injectDefs(layout, graph)            — populate #svg-defs with filters, gradients, pattern
 *   setSvgDimensions(layout)             — apply viewBox/width/height to #diagram-svg
 *   renderLanes(graph, layout)           — draw background, grid, header, lane bands, labels
 *   nodeClasses(node)                    — return CSS class string for a node <g>
 *   renderTextLines(g, label, cx, cy, fontSize, fill) — multi-line centered SVG text
 *   createNodeGroup(node, bounds)        — dispatch to the correct shape renderer
 *   renderStartEvent(g, node, bounds)    — thin circle start event
 *   renderEndEvent(g, node, bounds)      — thick circle end event
 *   renderTask(g, node, bounds)          — rounded rect task
 *   renderSubprocess(g, node, bounds)    — task rect + [+] expansion marker
 *   renderGateway(g, node, bounds)       — diamond decision gateway
 *   renderAnnotation(g, node, bounds)    — dashed callout annotation
 *   renderIntermediateEvent(g, node, bounds) — double-ring intermediate event
 *   renderMerge(g, node, bounds)            — small circle merge node
 *   renderProcessGroup(g, node, bounds)     — container with header + collapse/expand
 *   renderDiffOverlay(node, bounds, overlaysLayer) — NEW/REMOVED chips + state badges
 *   renderNodes(graph, layout, viewMode) — exported: clear layers and draw all visible nodes
 */

import { state, dom } from './state.js';
import { LANE_COLORS, DIFF_COLORS, STATE_ICONS, NODE_FILL, PORT_DEFS, LANE_TYPES, ICON_PATHS } from './constants.js';
import { NODE_DIMS, computeLayout, getPortPosition, autoResizeLanes } from './layout.js';
import { isVisible } from './data.js';
import { normalizePhases, isVisibleAtPhase, getDiffStatus } from './phase.js';
import { renderConnections } from './routing.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Post-render hooks ───────────────────────────────────────────────────────
const _postRenderCallbacks = [];

/**
 * Register a callback to be invoked at the end of every renderAll().
 * Used by validation-ui.js to refresh warning badges after re-render.
 */
export function onPostRender(cb) {
  if (typeof cb === 'function') _postRenderCallbacks.push(cb);
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Create an SVG element in the SVG namespace and set all provided attributes.
 * @param {string} tag     — SVG tag name (e.g. 'rect', 'filter', 'linearGradient')
 * @param {Object} attrs   — key/value pairs of SVG attributes
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

// ─── Defs injection ───────────────────────────────────────────────────────────

/**
 * Inject all reusable SVG defs (filters, gradients, pattern) into #svg-defs.
 * Clears any previously injected defs first so repeated calls are safe.
 *
 * @param {Object} layout — computed layout object from layout.js
 * @param {Object} graph  — parsed graph JSON (used for lane colours)
 */
export function injectDefs(layout, graph) {
  const defsEl = document.getElementById('svg-defs');
  defsEl.innerHTML = '';

  // ── Drop-shadow filter ───────────────────────────────────────────────────
  const fShadow = svgEl('filter', {
    id: 'sh',
    x: '-20%',
    y: '-20%',
    width: '140%',
    height: '140%',
  });
  fShadow.appendChild(svgEl('feDropShadow', {
    dx: '0',
    dy: '3',
    stdDeviation: '5',
    'flood-color': '#000',
    'flood-opacity': '0.5',
  }));
  defsEl.appendChild(fShadow);

  // ── 9.1 — Card-style node shadow (subtle, for task/subprocess/process-group)
  const fNodeShadow = svgEl('filter', {
    id: 'node-shadow',
    x: '-10%',
    y: '-10%',
    width: '130%',
    height: '140%',
  });
  fNodeShadow.appendChild(svgEl('feDropShadow', {
    dx: '0',
    dy: '3',
    stdDeviation: '2',
    'flood-color': '#000',
    'flood-opacity': '0.15',
  }));
  defsEl.appendChild(fNodeShadow);

  // ── Diff glow filters ────────────────────────────────────────────────────
  const glowDefs = [
    { id: 'glow-green', color: '#22c55e', opacity: '0.6', std: '8' },
    { id: 'glow-red',   color: '#ef4444', opacity: '0.5', std: '8' },
    { id: 'glow-amber', color: '#f59e0b', opacity: '0.5', std: '8' },
  ];
  for (const gd of glowDefs) {
    const f = svgEl('filter', {
      id: gd.id,
      x: '-50%',
      y: '-50%',
      width: '200%',
      height: '200%',
    });
    f.appendChild(svgEl('feDropShadow', {
      dx: '0',
      dy: '0',
      stdDeviation: gd.std,
      'flood-color': gd.color,
      'flood-opacity': gd.opacity,
    }));
    defsEl.appendChild(f);
  }

  // ── Token glow filter ────────────────────────────────────────────────────
  const fToken = svgEl('filter', {
    id: 'token-glow',
    x: '-50%',
    y: '-50%',
    width: '200%',
    height: '200%',
  });
  fToken.appendChild(svgEl('feDropShadow', {
    dx: '0',
    dy: '0',
    stdDeviation: '4',
    'flood-color': '#60a5fa',
    'flood-opacity': '0.8',
  }));
  defsEl.appendChild(fToken);

  // ── Lane gradients (one per lane) ────────────────────────────────────────
  const lanes = (layout && layout.lanes) ? layout.lanes : (graph ? graph.lanes : []);
  lanes.forEach((lane, i) => {
    // Resolve the lane colour: prefer layout.lanes[i].color, fall back to
    // graph.lanes[i].color, then the LANE_COLORS palette.
    const color = lane.color || LANE_COLORS[i % LANE_COLORS.length];

    const grad = svgEl('linearGradient', {
      id: `lg${i}`,
      x1: '0',
      y1: '0',
      x2: '1',
      y2: '0',
    });
    const stop0 = svgEl('stop', { offset: '0%' });
    stop0.setAttribute('stop-color', color);
    stop0.setAttribute('stop-opacity', '0.55');

    const stop1 = svgEl('stop', { offset: '100%' });
    stop1.setAttribute('stop-color', '#0f172a');
    stop1.setAttribute('stop-opacity', '0.1');

    grad.appendChild(stop0);
    grad.appendChild(stop1);
    defsEl.appendChild(grad);
  });

  // ── Node fill gradients ──────────────────────────────────────────────────
  const nodeFills = [
    // id          top       bottom     orientation (x1 y1 x2 y2 = top→bottom)
    { id: 'nf-task',    top: '#2d3a52', bot: '#1e2a3e' },
    { id: 'nf-term',    top: '#232d40', bot: '#161b27' },
    { id: 'nf-dec',     top: '#3a3020', bot: '#2a2215' },
    { id: 'nf-added',   top: '#1a3a26', bot: '#102a1a' },
    { id: 'nf-removed', top: '#3a1e1e', bot: '#2a1515' },
    { id: 'nf-persona', top: '#2a3f5c', bot: '#1c2e46' },
    { id: 'nf-agent',   top: '#1a3a3a', bot: '#102828' },
    { id: 'nf-system',  top: '#2a2a1a', bot: '#1a1a10' },
    { id: 'nf-merge',   top: '#3a3f4a', bot: '#2a2f3a' },
    { id: 'nf-group',   top: '#2a3348', bot: '#1e2638' },
    { id: 'nf-group-header', top: '#334766', bot: '#263550' },
  ];
  for (const nf of nodeFills) {
    const grad = svgEl('linearGradient', {
      id: nf.id,
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '1',
    });
    const s0 = svgEl('stop', { offset: '0%' });
    s0.setAttribute('stop-color', nf.top);

    const s1 = svgEl('stop', { offset: '100%' });
    s1.setAttribute('stop-color', nf.bot);

    grad.appendChild(s0);
    grad.appendChild(s1);
    defsEl.appendChild(grad);
  }

  // ── Grid dot pattern (9.9 — refined: 1px radius, 0.12 opacity) ──────────
  const pattern = svgEl('pattern', {
    id: 'grid',
    width: '10',
    height: '10',
    patternUnits: 'userSpaceOnUse',
  });
  pattern.appendChild(svgEl('circle', {
    cx: '5',
    cy: '5',
    r: '1',
    fill: 'rgba(255,255,255,0.12)',
  }));
  defsEl.appendChild(pattern);

  // ── Crosshair grid lines at 100px intervals (9.9) ──────────────────────
  const crossPattern = svgEl('pattern', {
    id: 'grid-crosshair',
    width: '100',
    height: '100',
    patternUnits: 'userSpaceOnUse',
  });
  crossPattern.appendChild(svgEl('line', {
    x1: '0', y1: '0', x2: '100', y2: '0',
    stroke: 'rgba(255,255,255,0.05)',
    'stroke-width': '0.5',
  }));
  crossPattern.appendChild(svgEl('line', {
    x1: '0', y1: '0', x2: '0', y2: '100',
    stroke: 'rgba(255,255,255,0.05)',
    'stroke-width': '0.5',
  }));
  defsEl.appendChild(crossPattern);
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

/**
 * Set the viewBox, width, and height attributes on #diagram-svg to match the
 * computed layout dimensions.
 *
 * @param {Object} layout — { svgWidth, svgHeight }
 */
export function setSvgDimensions(layout) {
  const svg = document.getElementById('diagram-svg');
  const w = layout.svgWidth;
  const h = layout.svgHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('height', h);
  if (state.zoomPreset === 'fit') {
    svg.style.width = '100%';
    svg.removeAttribute('width');
  } else {
    svg.style.width = w + 'px';
    svg.setAttribute('width', w);
  }
}

// ─── Lane rendering ───────────────────────────────────────────────────────────

/**
 * Render the background fill, grid pattern, header bar, and all swimlane bands
 * (gradient fills, border lines, rotated labels) into their respective layers.
 *
 * Clears #background-layer and #lanes-layer before drawing.
 *
 * @param {Object} graph  — parsed graph JSON
 * @param {Object} layout — computed layout object from layout.js
 */
export function renderLanes(graph, layout) {
  const bgLayer    = document.getElementById('background-layer');
  const lanesLayer = document.getElementById('lanes-layer');

  bgLayer.innerHTML    = '';
  lanesLayer.innerHTML = '';

  const w = layout.svgWidth;
  const h = layout.svgHeight;

  // ── Background: solid base + grid dots + crosshair lines (9.9) ─────────
  bgLayer.appendChild(svgEl('rect', {
    x: '0',
    y: '0',
    width: w,
    height: h,
    fill: '#0f172a',
  }));
  bgLayer.appendChild(svgEl('rect', {
    x: '0',
    y: '0',
    width: w,
    height: h,
    fill: 'url(#grid)',
  }));
  bgLayer.appendChild(svgEl('rect', {
    x: '0',
    y: '0',
    width: w,
    height: h,
    fill: 'url(#grid-crosshair)',
  }));

  // ── Header bar ───────────────────────────────────────────────────────────
  lanesLayer.appendChild(svgEl('rect', {
    x: '0',
    y: '0',
    width: w,
    height: layout.headerH || 48,
    fill: '#0b1222',
  }));

  // ── Diagram title in header ───────────────────────────────────────────────
  if (graph.title) {
    const titleEl = svgEl('text', {
      x: String(w / 2),
      y: '28',
      'text-anchor': 'middle',
      fill: '#e2e8f0',
      'font-size': '14',
      'font-weight': '600',
      'font-family': "'Segoe UI', system-ui, sans-serif",
    });
    titleEl.textContent = graph.title;
    lanesLayer.appendChild(titleEl);
  }

  // ── Lane type icon map ──────────────────────────────────────────────────
  const LANE_TYPE_ICONS = {
    persona:    '\u{1F464}',   // 👤
    system:     '\u{1F5A5}',   // 🖥
    agent:      '\u26A1',      // ⚡
    department: '\u{1F3E2}',   // 🏢
  };

  // ── Lane bands ───────────────────────────────────────────────────────────
  layout.lanes.forEach((lane, i) => {
    // Find the matching graph lane to get the type
    const graphLane = (graph.lanes || [])[i];
    const laneType = (graphLane && graphLane.type) || 'department';
    const laneColor = lane.color || LANE_COLORS[i % LANE_COLORS.length];

    // 8.11 — Alternate lane background darkness for visual grouping
    const isEvenLane = i % 2 === 0;
    const bandOpacity = isEvenLane ? '0.08' : '0.04';

    // Gradient band
    lanesLayer.appendChild(svgEl('rect', {
      x: '0',
      y: lane.y,
      width: w,
      height: lane.height,
      fill: `url(#lg${i})`,
    }));

    // 8.11 — Even/odd alternating overlay for visual grouping
    if (isEvenLane) {
      lanesLayer.appendChild(svgEl('rect', {
        x: '0',
        y: lane.y,
        width: w,
        height: lane.height,
        fill: 'rgba(255,255,255,0.03)',
        'pointer-events': 'none',
      }));
    }

    // 8.11 — Divider line between adjacent lanes (subtle white line)
    if (i > 0) {
      lanesLayer.appendChild(svgEl('line', {
        x1: '0',
        y1: lane.y,
        x2: w,
        y2: lane.y,
        stroke: 'rgba(255,255,255,0.2)',
        'stroke-width': '1',
      }));
    }

    // Top border line for first lane
    if (i === 0) {
      lanesLayer.appendChild(svgEl('line', {
        x1: '0',
        y1: lane.y,
        x2: w,
        y2: lane.y,
        stroke: '#1e2535',
        'stroke-width': '1',
      }));
    }

    // Bottom border only after the last lane
    if (i === layout.lanes.length - 1) {
      const bottomY = lane.y + lane.height;
      lanesLayer.appendChild(svgEl('line', {
        x1: '0',
        y1: bottomY,
        x2: w,
        y2: bottomY,
        stroke: '#1e2535',
        'stroke-width': '1',
      }));
    }

    // 8.10 — Label column separator (solid, subtle)
    const labelColX = layout.labelColW || 52;
    lanesLayer.appendChild(svgEl('line', {
      x1: labelColX,
      y1: lane.y,
      x2: labelColX,
      y2: lane.y + lane.height,
      stroke: 'rgba(255,255,255,0.12)',
      'stroke-width': '1',
    }));

    // Lane header group — wraps icon + label for event targeting
    const headerG = svgEl('g', { 'data-lane-id': lane.id, class: 'lane-header' });

    // 8.10 — Header background: lane color at 60% opacity for clear visibility
    headerG.appendChild(svgEl('rect', {
      x: '0',
      y: lane.y,
      width: labelColX,
      height: lane.height,
      fill: laneColor,
      opacity: '0.6',
      rx: '0',
    }));

    // Hit area for the lane header (full label column width)
    headerG.appendChild(svgEl('rect', {
      x: '0',
      y: lane.y,
      width: labelColX,
      height: lane.height,
      fill: 'transparent',
      'pointer-events': 'all',
    }));

    // 8.9 — Type icon — small, positioned above the rotated lane name
    const typeIcon = LANE_TYPE_ICONS[laneType] || LANE_TYPE_ICONS.department;
    const iconEl = svgEl('text', {
      x: String(labelColX / 2),
      y: String(lane.y + 18),
      'text-anchor': 'middle',
      'font-size': '14',
      opacity: '0.85',
      'pointer-events': 'none',
    });
    iconEl.textContent = typeIcon;
    headerG.appendChild(iconEl);

    // 8.9 — Rotated lane label — prominent, bold, white, 13px
    const lx = Math.round(labelColX / 2);
    // Center the label vertically, but offset down a bit to leave room for the icon
    const iconSpace = 14;
    const ly = Math.round((lane.y + iconSpace + lane.y + lane.height) / 2);
    const text = svgEl('text', {
      transform: `rotate(-90 ${lx} ${ly})`,
      x: String(lx),
      y: String(ly),
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: '#ffffff',
      'font-size': '13',
      'letter-spacing': '0.08em',
      'font-weight': '700',
      opacity: '0.95',
      class: 'lane-label-text',
      'pointer-events': 'none',
    });
    text.textContent = lane.label.toUpperCase();
    headerG.appendChild(text);

    lanesLayer.appendChild(headerG);
  });

  // ── "Add Lane" button (edit mode only) ────────────────────────────────
  if (state.isEditing && layout.lanes.length > 0) {
    const lastLane = layout.lanes[layout.lanes.length - 1];
    const btnY = lastLane.y + lastLane.height + 6;
    const btnG = svgEl('g', { class: 'add-lane-btn', 'data-action': 'add-lane' });
    btnG.style.cursor = 'pointer';

    const addLabelColX = layout.labelColW || 52;
    btnG.appendChild(svgEl('rect', {
      x: '4',
      y: btnY,
      width: String(addLabelColX - 8),
      height: '20',
      rx: '4',
      fill: '#1e2535',
      stroke: '#3b82f6',
      'stroke-width': '1',
      'stroke-dasharray': '3,2',
      opacity: '0.7',
    }));

    const plusText = svgEl('text', {
      x: String(addLabelColX / 2),
      y: String(btnY + 14),
      'text-anchor': 'middle',
      fill: '#3b82f6',
      'font-size': '13',
      'font-weight': '700',
      'pointer-events': 'none',
    });
    plusText.textContent = '+';
    btnG.appendChild(plusText);

    lanesLayer.appendChild(btnG);
  }
}

// ─── Node class helper ────────────────────────────────────────────────────────

/**
 * Return a space-separated CSS class string for a node's <g> element.
 *
 * Always includes:  'node node-{type}'
 * With _diff:       'diff-{node._diff}'
 * With state:       'state-{node.state}'
 *
 * @param {Object} node — graph node object
 * @returns {string}
 */
function nodeClasses(node) {
  const parts = ['node', `node-${node.type}`];
  // Only apply diff CSS classes in overlay mode
  if (state.viewMode === 'overlay') {
    if (node._diff)  parts.push(`diff-${node._diff}`);
    if (node.diff)   parts.push(`diff-${node.diff}`);
  }
  if (node.state)  parts.push(`state-${node.state}`);
  return parts.join(' ');
}

// ─── Multi-line text helper ───────────────────────────────────────────────────

/**
 * Append a <text> element with one <tspan> per line of label to the given group.
 * Lines are split on '\n'. The block is vertically centered around cy.
 *
 * @param {SVGElement} g        — parent group element
 * @param {string}     label    — label string (may contain \n)
 * @param {number}     cx       — horizontal center x
 * @param {number}     cy       — vertical center y of the full text block
 * @param {number}     fontSize — font size in px
 * @param {string}     fill     — text fill colour
 */
function renderTextLines(g, label, cx, cy, fontSize, fill) {
  if (!label) return;

  const lines    = label.split('\\n').join('\n').split('\n');
  const lineH    = fontSize * 1.35;
  const totalH   = lines.length * lineH;
  // Top of first baseline: shift up by half total block, then down by half first lineH
  const startY   = cy - totalH / 2 + lineH * 0.75;

  const textEl = svgEl('text', {
    'text-anchor': 'middle',
    'font-family': "'Segoe UI', system-ui, sans-serif",
    'font-size': String(fontSize),
    fill,
    'font-weight': '500',
  });

  lines.forEach((line, i) => {
    const tspan = svgEl('tspan', {
      x: String(cx),
      y: String(Math.round(startY + i * lineH)),
    });
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });

  g.appendChild(textEl);
}

// ─── 9.2 Node type icon helper ────────────────────────────────────────────────

/**
 * Render a small SVG path icon at the top-left of a node.
 * Icon is 14x14, fill white at 40% opacity. Only called for task/subprocess.
 *
 * @param {SVGElement} g      — parent group element
 * @param {string}     type   — node type (e.g. 'task', 'subprocess')
 * @param {number}     left   — left edge of node rect
 * @param {number}     top    — top edge of node rect
 */
function renderNodeIcon(g, type, left, top) {
  const pathData = ICON_PATHS[type];
  if (!pathData) return;

  // Position icon at top-left of node, offset 8px from edges
  const ix = left + 8;
  const iy = top + 8;

  const iconG = svgEl('g', {
    transform: `translate(${ix},${iy}) scale(${14 / 16})`,
    opacity: '0.4',
  });
  iconG.appendChild(svgEl('path', {
    d: pathData,
    fill: '#ffffff',
  }));
  g.appendChild(iconG);
}

// ─── 9.3 Node subtitle helper ────────────────────────────────────────────────

/**
 * Render an optional subtitle line below the main label.
 * Shows description (first 30 chars), duration, or owner if present.
 *
 * @param {SVGElement} g      — parent group element
 * @param {Object}     node   — graph node object
 * @param {number}     cx     — horizontal center x
 * @param {number}     bottom — bottom edge of node rect
 */
function renderSubtitle(g, node, cx, bottom) {
  let subtitle = null;

  if (node.description) {
    subtitle = node.description.length > 30
      ? node.description.slice(0, 30) + '\u2026'
      : node.description;
  } else if (node.duration) {
    subtitle = `Duration: ${node.duration}`;
  } else if (node.owner) {
    subtitle = `Owner: ${node.owner}`;
  }

  if (!subtitle) return;

  const textEl = svgEl('text', {
    x: String(cx),
    y: String(bottom + 12),
    'text-anchor': 'middle',
    'font-family': "'Segoe UI', system-ui, sans-serif",
    'font-size': '10',
    fill: '#94a3b8',
    'font-weight': '400',
  });
  textEl.textContent = subtitle;
  g.appendChild(textEl);
}

// ─── Shape renderers ──────────────────────────────────────────────────────────

/**
 * Render a start event: thin-border circle with inner dot.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds — { x, y, left, right, top, bottom, width, height }
 * @returns {SVGElement} g
 */
function renderStartEvent(g, node, bounds) {
  const { x: cx, y: cy } = bounds;

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '12',
    fill: 'url(#nf-term)',
    stroke: '#334155',
    'stroke-width': '2',
    filter: 'url(#sh)',
  }));

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '4',
    fill: '#64748b',
  }));

  return g;
}

/**
 * Render an end event: thick-border circle with filled inner circle.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderEndEvent(g, node, bounds) {
  const { x: cx, y: cy } = bounds;

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '14',
    fill: 'url(#nf-term)',
    stroke: '#334155',
    'stroke-width': '3.5',
    filter: 'url(#sh)',
  }));

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '7',
    fill: '#64748b',
  }));

  return g;
}

/**
 * Render a task: rounded rectangle with multi-line label.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderTask(g, node, bounds) {
  const { left, top, width, height, x: cx, y: cy } = bounds;

  // Choose fill gradient — diff-aware
  const diff = node._diff || node.diff;
  let fillId = 'url(#nf-task)';
  if (diff === 'added')   fillId = 'url(#nf-added)';
  if (diff === 'removed') fillId = 'url(#nf-removed)';

  // Choose stroke — diff-aware, with CSS override via class
  let stroke = '#334155';
  if (diff === 'added')   stroke = '#22c55e';
  if (diff === 'removed') stroke = '#ef4444';
  if (diff === 'changed') stroke = '#f59e0b';

  // 9.1 — Use card-style shadow; fall back to diff glow when diff is active
  let filter = 'url(#node-shadow)';
  if (diff === 'added')   filter = 'url(#glow-green)';
  if (diff === 'removed') filter = 'url(#glow-red)';
  if (diff === 'changed') filter = 'url(#glow-amber)';

  g.appendChild(svgEl('rect', {
    x: left,
    y: top,
    width,
    height,
    rx: '10',
    fill: fillId,
    stroke,
    'stroke-width': '1.5',
    filter,
  }));

  // 9.1 — Left accent bar (4px wide, colored by state/diff)
  let accentColor = '#3b82f6'; // default blue
  if (node.state === 'automated') accentColor = '#8b5cf6';
  if (node.state === 'bottleneck') accentColor = '#f59e0b';
  if (diff === 'removed') accentColor = '#ef4444';
  if (diff === 'added')   accentColor = '#22c55e';

  g.appendChild(svgEl('rect', {
    x: left,
    y: top + 4,
    width: '4',
    height: height - 8,
    rx: '2',
    fill: accentColor,
  }));

  const textFill = (diff === 'removed') ? '#fca5a5'
                 : (diff === 'added')   ? '#86efac'
                 : '#cbd5e1';

  if (node.label) {
    renderTextLines(g, node.label, cx, cy, 9.5, textFill);
  }

  // 9.2 — Node type icon at top-left
  renderNodeIcon(g, node.type, left, top);

  // 9.3 — Optional subtitle below label
  renderSubtitle(g, node, cx, top + height);

  return g;
}

/**
 * Render a subprocess: task rect + [+] expansion marker at bottom-center.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderSubprocess(g, node, bounds) {
  // Draw the task base (rect + label)
  renderTask(g, node, bounds);

  const { x: cx, bottom } = bounds;

  // [+] marker box — 18×12 rx=2 centered at bottom edge
  const markerW = 18;
  const markerH = 12;
  const markerX = cx - markerW / 2;
  const markerY = bottom - markerH;   // sit flush with bottom edge

  g.appendChild(svgEl('rect', {
    x: markerX,
    y: markerY,
    width: markerW,
    height: markerH,
    rx: '2',
    fill: '#1a2030',
    stroke: '#334155',
    'stroke-width': '1',
  }));

  // Vertical bar of the cross
  g.appendChild(svgEl('line', {
    x1: cx,
    y1: markerY + 2,
    x2: cx,
    y2: markerY + markerH - 2,
    stroke: '#475569',
    'stroke-width': '1.2',
  }));

  // Horizontal bar of the cross
  const midY = markerY + markerH / 2;
  g.appendChild(svgEl('line', {
    x1: markerX + 3,
    y1: midY,
    x2: markerX + markerW - 3,
    y2: midY,
    stroke: '#475569',
    'stroke-width': '1.2',
  }));

  return g;
}

/**
 * Render a gateway: diamond polygon with label.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderGateway(g, node, bounds) {
  const { x: cx, y: cy, width, height } = bounds;

  const halfW = width / 2;
  const halfH = height / 2;

  // Diamond: top, right, bottom, left midpoints
  const points = [
    `${cx},${cy - halfH}`,   // top
    `${cx + halfW},${cy}`,   // right
    `${cx},${cy + halfH}`,   // bottom
    `${cx - halfW},${cy}`,   // left
  ].join(' ');

  g.appendChild(svgEl('polygon', {
    points,
    fill: 'url(#nf-dec)',
    stroke: '#d97706',
    'stroke-width': '1.8',
    filter: 'url(#sh)',
  }));

  if (node.label) {
    renderTextLines(g, node.label, cx, cy, 9.5, '#fcd34d');
    // Override font-weight on the text element just appended
    const textEl = g.lastChild;
    if (textEl && textEl.tagName === 'text') {
      textEl.setAttribute('font-weight', '600');
    }
  }

  return g;
}

/**
 * Render an annotation: dashed rect with right-pointing callout triangle and text.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderAnnotation(g, node, bounds) {
  const { left, top, width, height, right, x: cx, y: cy } = bounds;

  g.appendChild(svgEl('rect', {
    x: left,
    y: top,
    width,
    height,
    rx: '4',
    fill: '#1c1706',
    stroke: '#854d0e',
    'stroke-width': '1',
    'stroke-dasharray': '4,3',
    opacity: '0.9',
  }));

  // Callout pointer: thin line from annotation edge to target node, or stub left
  if (node.target && state.layout && state.layout.nodes[node.target]) {
    const targetBounds = state.layout.nodes[node.target];
    // Draw line from annotation left edge to target node's right edge
    const startX = left;
    const startY = cy;
    const endX = targetBounds.right;
    const endY = targetBounds.y;
    g.appendChild(svgEl('line', {
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      stroke: '#854d0e',
      'stroke-width': '1',
      opacity: '0.6',
    }));
  } else {
    // No target: draw a small pointer stub to the left
    const stubLen = 14;
    g.appendChild(svgEl('line', {
      x1: left,
      y1: cy,
      x2: left - stubLen,
      y2: cy,
      stroke: '#854d0e',
      'stroke-width': '1',
      opacity: '0.6',
    }));
  }

  if (node.label) {
    renderTextLines(g, node.label, cx, cy, 8.5, '#fbbf24');
    const textEl = g.lastChild;
    if (textEl && textEl.tagName === 'text') {
      textEl.setAttribute('opacity', '0.95');
    }
  }

  return g;
}

/**
 * Render an intermediate event: outer circle + concentric inner ring.
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderIntermediateEvent(g, node, bounds) {
  const { x: cx, y: cy } = bounds;

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '14',
    fill: 'url(#nf-term)',
    stroke: '#334155',
    'stroke-width': '2',
    filter: 'url(#sh)',
  }));

  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '10',
    fill: 'none',
    stroke: '#334155',
    'stroke-width': '1.5',
  }));

  return g;
}

// ─── Participant type renderers ───────────────────────────────────────────────

/**
 * Render a persona node: rounded rect with a head-and-shoulders icon.
 * Represents a named human role (e.g., Manager, Employee, Customer).
 */
function renderPersona(g, node, bounds) {
  const { left, top, width, height, x: cx, y: cy } = bounds;

  const diff = node._diff || node.diff;
  let fillId = 'url(#nf-persona)';
  let stroke  = '#5b8db8';
  let filter  = 'url(#sh)';
  if (diff === 'added')   { fillId = 'url(#nf-added)';   stroke = '#22c55e'; filter = 'url(#glow-green)'; }
  if (diff === 'removed') { fillId = 'url(#nf-removed)'; stroke = '#ef4444'; filter = 'url(#glow-red)';   }
  if (diff === 'changed') { stroke = '#f59e0b'; filter = 'url(#glow-amber)'; }

  g.appendChild(svgEl('rect', { x: left, y: top, width, height, rx: '6',
    fill: fillId, stroke, 'stroke-width': '1.5', filter }));

  // Person icon (head + shoulders), 14×14 in top-left corner
  const ix = left + 5;
  const iy = top + 4;
  const iconG = svgEl('g', {});
  iconG.appendChild(svgEl('circle', { cx: ix + 7, cy: iy + 4, r: '3', fill: '#5b8db8' }));
  iconG.appendChild(svgEl('path', {
    d: `M${ix + 1},${iy + 13} Q${ix + 1},${iy + 8} ${ix + 7},${iy + 8} Q${ix + 13},${iy + 8} ${ix + 13},${iy + 13}`,
    fill: '#5b8db8',
  }));
  g.appendChild(iconG);

  const textFill = (diff === 'removed') ? '#fca5a5' : (diff === 'added') ? '#86efac' : '#bfd9f2';
  if (node.label) renderTextLines(g, node.label, cx, cy + 3, 9.5, textFill);

  return g;
}

/**
 * Render an agent node: chamfered-corner octagon with a lightning-bolt icon.
 * Represents an automated software agent or AI system performing work.
 */
function renderAgent(g, node, bounds) {
  const { left, top, right, bottom, x: cx, y: cy } = bounds;
  const cut = 5;

  const diff = node._diff || node.diff;
  let fillId = 'url(#nf-agent)';
  let stroke  = '#2dd4bf';
  let filter  = 'url(#sh)';
  if (diff === 'added')   { fillId = 'url(#nf-added)';   stroke = '#22c55e'; filter = 'url(#glow-green)'; }
  if (diff === 'removed') { fillId = 'url(#nf-removed)'; stroke = '#ef4444'; filter = 'url(#glow-red)';   }
  if (diff === 'changed') { stroke = '#f59e0b'; filter = 'url(#glow-amber)'; }

  const pts = [
    `${left + cut},${top}`,  `${right - cut},${top}`,
    `${right},${top + cut}`, `${right},${bottom - cut}`,
    `${right - cut},${bottom}`, `${left + cut},${bottom}`,
    `${left},${bottom - cut}`, `${left},${top + cut}`,
  ].join(' ');

  g.appendChild(svgEl('polygon', { points: pts, fill: fillId, stroke,
    'stroke-width': '1.5', filter }));

  // Lightning bolt icon in top-left corner
  const ix = left + 5;
  const iy = top + 4;
  g.appendChild(svgEl('polygon', {
    points: `${ix+8},${iy+1} ${ix+4},${iy+8} ${ix+7},${iy+8} ${ix+6},${iy+13} ${ix+10},${iy+6} ${ix+7},${iy+6}`,
    fill: '#2dd4bf',
  }));

  const textFill = (diff === 'removed') ? '#fca5a5' : (diff === 'added') ? '#86efac' : '#99f6e4';
  if (node.label) renderTextLines(g, node.label, cx, cy + 3, 9.5, textFill);

  return g;
}

/**
 * Render a system node: sharp-corner rect with inner bezel and server-rack icon.
 * Represents an external system integration (e.g., ERP, database, email server).
 */
function renderSystem(g, node, bounds) {
  const { left, top, width, height, x: cx, y: cy } = bounds;

  const diff = node._diff || node.diff;
  let fillId = 'url(#nf-system)';
  let stroke  = '#a3a300';
  let filter  = 'url(#sh)';
  if (diff === 'added')   { fillId = 'url(#nf-added)';   stroke = '#22c55e'; filter = 'url(#glow-green)'; }
  if (diff === 'removed') { fillId = 'url(#nf-removed)'; stroke = '#ef4444'; filter = 'url(#glow-red)';   }
  if (diff === 'changed') { stroke = '#f59e0b'; filter = 'url(#glow-amber)'; }

  // Outer sharp rect
  g.appendChild(svgEl('rect', { x: left, y: top, width, height, rx: '0',
    fill: fillId, stroke, 'stroke-width': '2', filter }));
  // Inner inset bezel
  g.appendChild(svgEl('rect', { x: left + 3, y: top + 3, width: width - 6, height: height - 6,
    rx: '0', fill: 'none', stroke: '#a3a300', 'stroke-width': '0.5', opacity: '0.5' }));

  // Server rack icon — three horizontal bars with indicator dots
  const ix = left + 4;
  const iy = top + 3;
  const barColor = '#a3a300';
  const dotColor = '#161b27';
  [[2, 5], [6, 9], [10, 13]].forEach(([yo, yo2]) => {
    void yo2;
    g.appendChild(svgEl('rect', { x: ix + 1, y: iy + yo, width: 12, height: 3, rx: '1', fill: barColor }));
    g.appendChild(svgEl('circle', { cx: ix + 11, cy: iy + yo + 1.5, r: '1', fill: dotColor }));
  });

  const textFill = (diff === 'removed') ? '#fca5a5' : (diff === 'added') ? '#86efac' : '#d4d400';
  if (node.label) renderTextLines(g, node.label, cx, cy + 3, 9.5, textFill);

  return g;
}

// ─── Merge node renderer ──────────────────────────────────────────────────────

/**
 * Render a merge node: small filled circle (r=15) with optional label below.
 * Accepts multiple incoming arrows (top, left, right) and a single outgoing (bottom).
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderMerge(g, node, bounds) {
  const { x: cx, y: cy } = bounds;

  // Outer circle with neutral gray gradient
  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '15',
    fill: 'url(#nf-merge)',
    stroke: '#64748b',
    'stroke-width': '2',
    filter: 'url(#sh)',
  }));

  // Inner filled dot to indicate merge point
  g.appendChild(svgEl('circle', {
    cx,
    cy,
    r: '5',
    fill: '#94a3b8',
  }));

  // Optional label rendered below the circle
  if (node.label) {
    const labelY = cy + 24;
    const textEl = svgEl('text', {
      x: String(cx),
      y: String(labelY),
      'text-anchor': 'middle',
      'font-family': "'Segoe UI', system-ui, sans-serif",
      'font-size': '8',
      fill: '#94a3b8',
      'font-weight': '500',
    });
    textEl.textContent = node.label;
    g.appendChild(textEl);
  }

  return g;
}

// ─── Process Group container renderer ─────────────────────────────────────────

// 9.8 — Section color palette for process groups
const GROUP_SECTION_COLORS = ['#dc2626', '#16a34a', '#2563eb', '#ca8a04', '#9333ea'];
let _groupColorIndex = 0;

/**
 * Render a process-group container: colored section header bar,
 * tinted content area, collapse/expand toggle. (9.8 — section styling)
 * @param {SVGElement} g
 * @param {Object}     node
 * @param {Object}     bounds
 * @returns {SVGElement} g
 */
function renderProcessGroup(g, node, bounds) {
  const { left, top, width, height } = bounds;
  const headerH = NODE_DIMS['process-group'].headerH || 36;
  const isExpanded = state.expandedGroups.has(node.id);

  // 9.8 — Resolve section color: node.sectionColor, or rotate through palette
  const sectionColor = node.sectionColor || GROUP_SECTION_COLORS[_groupColorIndex++ % GROUP_SECTION_COLORS.length];

  // Determine effective height: thin bar when collapsed, full when expanded
  const effectiveH = isExpanded ? height : headerH;

  if (isExpanded) {
    // Content area: subtle tinted background (8% opacity of section color)
    g.appendChild(svgEl('rect', {
      x: left,
      y: top,
      width,
      height: effectiveH,
      rx: '6',
      fill: sectionColor,
      opacity: '0.08',
    }));

    // Thin border around the whole group
    g.appendChild(svgEl('rect', {
      x: left,
      y: top,
      width,
      height: effectiveH,
      rx: '6',
      fill: 'none',
      stroke: sectionColor,
      'stroke-width': '1',
      opacity: '0.25',
    }));
  }

  // Header bar: bold colored section header (full width)
  g.appendChild(svgEl('rect', {
    x: left,
    y: top,
    width,
    height: headerH,
    rx: '6',
    fill: sectionColor,
    opacity: isExpanded ? '1' : '0.85',
  }));
  // Square off bottom corners of header when expanded
  if (isExpanded) {
    g.appendChild(svgEl('rect', {
      x: left,
      y: top + headerH - 6,
      width,
      height: 6,
      fill: sectionColor,
    }));
  }

  // Toggle icon (▼ when expanded, ▶ when collapsed)
  const toggleX = left + 16;
  const toggleY = top + headerH / 2 + 5;
  const toggleEl = svgEl('text', {
    x: String(toggleX),
    y: String(toggleY),
    'text-anchor': 'middle',
    'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    'font-size': '11',
    fill: '#ffffff',
    cursor: 'pointer',
    class: 'process-group-toggle',
    'data-group-id': node.id,
  });
  toggleEl.textContent = isExpanded ? '\u25BC' : '\u25B6';
  g.appendChild(toggleEl);

  // Group name text in header — bold white on colored bar
  const nameX = left + 30;
  const nameY = top + headerH / 2 + 5;
  const nameEl = svgEl('text', {
    x: String(nameX),
    y: String(nameY),
    'text-anchor': 'start',
    'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    'font-size': '13',
    fill: '#ffffff',
    'font-weight': '700',
  });
  nameEl.textContent = node.label || node.id;
  g.appendChild(nameEl);

  // When collapsed, show child count indicator
  if (!isExpanded && node.children) {
    const countX = left + width - 32;
    const countY = nameY;
    const countEl = svgEl('text', {
      x: String(countX),
      y: String(countY),
      'text-anchor': 'middle',
      'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      'font-size': '10',
      fill: 'rgba(255,255,255,0.7)',
      'font-weight': '600',
    });
    countEl.textContent = `(${node.children.length})`;
    g.appendChild(countEl);
  }

  // Body area group for child nodes (only visible when expanded)
  if (isExpanded) {
    const bodyG = svgEl('g', {
      class: 'process-group-body',
      'data-group-id': node.id,
    });
    g.appendChild(bodyG);
  }

  // Attach click handler for toggle
  toggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.expandedGroups.has(node.id)) {
      state.expandedGroups.delete(node.id);
    } else {
      state.expandedGroups.add(node.id);
    }
    // Re-render the entire diagram to reflect the state change
    renderAll(state.graph);
  });

  return g;
}

// ─── Node group factory ───────────────────────────────────────────────────────

/**
 * Create the <g> element for a node, apply classes, and dispatch to the
 * correct shape renderer.
 *
 * @param {Object} node   — graph node object
 * @param {Object} bounds — absolute SVG bounds from layout.nodes[node.id]
 * @returns {SVGElement}  — fully-populated <g> element
 */
function createNodeGroup(node, bounds) {
  if (!bounds) return null;

  const g = svgEl('g', {
    'data-node-id': node.id,
    class: nodeClasses(node),
  });

  switch (node.type) {
    case 'start-event':        return renderStartEvent(g, node, bounds);
    case 'end-event':          return renderEndEvent(g, node, bounds);
    case 'task':               return renderTask(g, node, bounds);
    case 'subprocess':         return renderSubprocess(g, node, bounds);
    case 'gateway':            return renderGateway(g, node, bounds);
    case 'annotation':         return renderAnnotation(g, node, bounds);
    case 'intermediate-event': return renderIntermediateEvent(g, node, bounds);
    case 'persona':            return renderPersona(g, node, bounds);
    case 'agent':              return renderAgent(g, node, bounds);
    case 'system':             return renderSystem(g, node, bounds);
    case 'merge':              return renderMerge(g, node, bounds);
    case 'process-group':      return renderProcessGroup(g, node, bounds);
    default:
      // Unknown type — render as plain task so nothing is invisible
      return renderTask(g, node, bounds);
  }
}

// ─── Diff overlay chips ───────────────────────────────────────────────────────

/**
 * Append diff chips and state badges to the overlays layer for a given node.
 *
 * diff === 'added'      → green NEW chip at top-right of bounds
 * diff === 'removed'    → red REMOVED chip at top-right of bounds
 * state === 'bottleneck'→ amber ⚠ badge at top-left
 * state === 'automated' → blue ⚡ badge at top-left
 *
 * @param {Object}     node         — graph node object
 * @param {Object}     bounds       — absolute SVG bounds
 * @param {SVGElement} overlaysLayer — #overlays-layer group element
 */
function renderDiffOverlay(node, bounds, overlaysLayer) {
  if (!bounds) return;

  const diff = node._diff || node.diff;

  if (diff === 'added') {
    // Green NEW chip — top-right corner
    const chipW  = 36;
    const chipH  = 15;
    const chipX  = bounds.right - chipW;
    const chipY  = bounds.top - 8;

    overlaysLayer.appendChild(svgEl('rect', {
      x: chipX,
      y: chipY,
      width: chipW,
      height: chipH,
      rx: '7',
      fill: '#14532d',
    }));

    const chipText = svgEl('text', {
      x: chipX + chipW / 2,
      y: chipY + chipH - 3,
      'text-anchor': 'middle',
      'font-family': "'Segoe UI', system-ui, sans-serif",
      'font-size': '8',
      fill: '#86efac',
      'font-weight': '700',
      'letter-spacing': '0.05em',
    });
    chipText.textContent = 'NEW';
    overlaysLayer.appendChild(chipText);
  }

  if (diff === 'removed') {
    // Red REMOVED chip — top-right corner
    const chipW  = 56;
    const chipH  = 15;
    const chipX  = bounds.right - chipW;
    const chipY  = bounds.top - 8;

    overlaysLayer.appendChild(svgEl('rect', {
      x: chipX,
      y: chipY,
      width: chipW,
      height: chipH,
      rx: '7',
      fill: '#7f1d1d',
    }));

    const chipText = svgEl('text', {
      x: chipX + chipW / 2,
      y: chipY + chipH - 3,
      'text-anchor': 'middle',
      'font-family': "'Segoe UI', system-ui, sans-serif",
      'font-size': '8',
      fill: '#fca5a5',
      'font-weight': '700',
      'letter-spacing': '0.05em',
    });
    chipText.textContent = 'REMOVED';
    overlaysLayer.appendChild(chipText);
  }

  // State badges — top-left corner (⚠ bottleneck, ⚡ automated)
  const stateIcon = STATE_ICONS[node.state];
  if (stateIcon) {
    const badgeW = 18;
    const badgeH = 14;
    const badgeX = bounds.left;
    const badgeY = bounds.top - 9;

    const badgeFill = node.state === 'bottleneck' ? '#78350f' : '#1e3a5f';
    const iconFill  = node.state === 'bottleneck' ? '#fbbf24' : '#60a5fa';

    overlaysLayer.appendChild(svgEl('rect', {
      x: badgeX,
      y: badgeY,
      width: badgeW,
      height: badgeH,
      rx: '6',
      fill: badgeFill,
    }));

    const iconText = svgEl('text', {
      x: badgeX + badgeW / 2,
      y: badgeY + badgeH - 2,
      'text-anchor': 'middle',
      'font-size': '9',
      fill: iconFill,
    });
    iconText.textContent = stateIcon;
    overlaysLayer.appendChild(iconText);
  }
}

// ─── Port indicators ─────────────────────────────────────────────────────────

/** Node types that should NOT show port indicators */
const NO_PORT_TYPES = new Set(['persona', 'system', 'agent', 'annotation']);

/**
 * Build an array of port descriptors with absolute positions for a node.
 * Each entry: { portId, cx, cy, occupied }
 *
 * @param {Object} node  — graph node object
 * @param {Object} bounds — layout bounds (x, y, width, height)
 * @param {Object} graph — full graph object (to check occupied ports)
 * @returns {Array<{portId: string, cx: number, cy: number, occupied: boolean}>}
 */
function computePortDescriptors(node, bounds, graph) {
  const portDef = PORT_DEFS[node.type];
  if (!portDef) return [];

  const ports = [];
  const connections = graph.connections || [];

  // Collect all port directions (both in and out)
  const inDirs  = portDef.in  || [];
  const outDirs = portDef.out || [];

  // Count occupied incoming ports (connections targeting this node)
  const incomingConns = connections.filter(c => c.to === node.id);
  // Count occupied outgoing ports (connections from this node)
  const outgoingConns = connections.filter(c => c.from === node.id);

  // For gateway nodes, enumerate all possible outgoing ports (including bl, br)
  if (node.type === 'gateway') {
    // Incoming: top
    const inPos = getPortPosition('gateway', 'in-top', bounds.width, bounds.height);
    ports.push({
      portId: 'in-top',
      cx: bounds.x + inPos.x,
      cy: bounds.y + inPos.y,
      occupied: incomingConns.length > 0,
    });

    // Outgoing: left, right, bottom, bottom-left, bottom-right
    const outPorts = ['out-left', 'out-right', 'out-bottom', 'out-bl', 'out-br'];
    for (let i = 0; i < outPorts.length; i++) {
      const pos = getPortPosition('gateway', outPorts[i], bounds.width, bounds.height);
      ports.push({
        portId: outPorts[i],
        cx: bounds.x + pos.x,
        cy: bounds.y + pos.y,
        occupied: i < outgoingConns.length,
      });
    }
    return ports;
  }

  // For all other node types, use the directions from PORT_DEFS
  for (const dir of inDirs) {
    const portId = `in-${dir}`;
    const pos = getPortPosition(node.type, portId, bounds.width, bounds.height);
    ports.push({
      portId,
      cx: bounds.x + pos.x,
      cy: bounds.y + pos.y,
      occupied: incomingConns.length > 0,
    });
  }

  for (const dir of outDirs) {
    const portId = `out-${dir}`;
    const pos = getPortPosition(node.type, portId, bounds.width, bounds.height);
    ports.push({
      portId,
      cx: bounds.x + pos.x,
      cy: bounds.y + pos.y,
      occupied: outgoingConns.length > 0,
    });
  }

  return ports;
}

/**
 * Render port indicator circles onto a node's <g> element.
 * Shows small circles at each valid port position. Blue for available, gray for occupied.
 * Called when a node is hovered or selected in edit mode.
 *
 * @param {SVGGElement} nodeG  — the node's <g> element
 * @param {Object}      node   — graph node object
 * @param {Object}      bounds — layout bounds for this node
 * @param {Object}      graph  — full graph object (for connection lookup)
 */
export function renderPortIndicators(nodeG, node, bounds, graph) {
  // Remove any existing port indicators on this group
  removePortIndicators(nodeG);

  if (NO_PORT_TYPES.has(node.type)) return;
  if (!bounds) return;

  const descriptors = computePortDescriptors(node, bounds, graph);

  for (const desc of descriptors) {
    // 9.4 — "+" button: circle with plus text inside
    const circle = svgEl('circle', {
      cx: desc.cx,
      cy: desc.cy,
      r: '5',
      class: desc.occupied ? 'port-indicator port-occupied' : 'port-indicator port-available',
      fill: desc.occupied ? '#6b7280' : '#3b82f6',
      stroke: desc.occupied ? '#4b5563' : '#2563eb',
      'stroke-width': '1',
      'data-port-id': desc.portId,
    });
    nodeG.appendChild(circle);

    // Render "+" as two thin SVG lines (cross shape) inside the port circle
    // Using <line> elements avoids polluting [data-node-id] text queries
    const plusSize = 3.5;
    const hLine = svgEl('line', {
      x1: String(desc.cx - plusSize), y1: String(desc.cy),
      x2: String(desc.cx + plusSize), y2: String(desc.cy),
      stroke: '#ffffff', 'stroke-width': '1.5', 'pointer-events': 'none',
      class: 'port-plus-label',
    });
    const vLine = svgEl('line', {
      x1: String(desc.cx), y1: String(desc.cy - plusSize),
      x2: String(desc.cx), y2: String(desc.cy + plusSize),
      stroke: '#ffffff', 'stroke-width': '1.5', 'pointer-events': 'none',
      class: 'port-plus-label',
    });
    nodeG.appendChild(hLine);
    nodeG.appendChild(vLine);
  }
}

/**
 * Remove all port indicator circles from a node group.
 * @param {SVGGElement} nodeG — the node's <g> element
 */
export function removePortIndicators(nodeG) {
  const indicators = nodeG.querySelectorAll('.port-indicator');
  indicators.forEach(el => el.remove());
  // 9.4 — Also remove the "+" text labels
  const plusLabels = nodeG.querySelectorAll('.port-plus-label');
  plusLabels.forEach(el => el.remove());
}

// ─── renderNodes — public export ─────────────────────────────────────────────

/**
 * Clear #nodes-layer and #overlays-layer, then render all nodes visible under
 * the current viewMode and selectedPhase.
 *
 * @param {Object} graph    — parsed graph JSON
 * @param {Object} layout   — computed layout from computeLayout()
 * @param {string} viewMode — 'before' | 'after' | 'split' | 'overlay'
 */
export function renderNodes(graph, layout, viewMode) {
  dom.nodesLayer.innerHTML    = '';
  dom.overlaysLayer.innerHTML = '';

  // 9.8 — Reset group color palette index each render pass
  _groupColorIndex = 0;

  // Build set of node IDs hidden by collapsed process groups
  const hiddenByGroup = new Set();
  for (const node of graph.nodes) {
    if (node.type === 'process-group' && node.children && !state.expandedGroups.has(node.id)) {
      for (const childId of node.children) {
        hiddenByGroup.add(childId);
      }
    }
  }

  // ── Phase-based vs legacy visibility filtering ──────────────────────────────
  const phases = normalizePhases(graph);
  const phaseIndex = state.currentPhaseIndex ?? 0;
  const useMultiPhase = phases.length > 2;

  let visibleNodes;
  if (useMultiPhase) {
    visibleNodes = graph.nodes.filter(
      n => isVisibleAtPhase(n, phaseIndex, phases) && !hiddenByGroup.has(n.id)
    );

    // In diff mode, also include nodes that were just removed (visible at
    // previous phase but not current) so they render as diff-removed ghosts.
    if (state.diffMode && phaseIndex > 0) {
      const removedNodes = graph.nodes.filter(n => {
        if (hiddenByGroup.has(n.id)) return false;
        if (isVisibleAtPhase(n, phaseIndex, phases)) return false; // already included
        // Was visible at previous phase?
        return isVisibleAtPhase(n, phaseIndex - 1, phases);
      });
      visibleNodes = visibleNodes.concat(removedNodes);
    }

    // Compute runtime diff status (_diff) for each visible node
    for (const node of visibleNodes) {
      const diff = getDiffStatus(node, phaseIndex, phases);
      node._diff = diff; // used by renderDiffOverlay
    }
  } else {
    // Legacy before/after path (unchanged)
    visibleNodes = graph.nodes.filter(
      n => isVisible(n, viewMode, state.selectedPhase) && !hiddenByGroup.has(n.id)
    );
  }

  for (const node of visibleNodes) {
    const bounds = layout.nodes[node.id];
    const g = createNodeGroup(node, bounds);
    if (g) {
      // Apply diff CSS class for multi-phase diff highlighting
      if (useMultiPhase && node._diff) {
        g.classList.add(`diff-${node._diff}`);
      }
      dom.nodesLayer.appendChild(g);
      renderDiffOverlay(node, bounds, dom.overlaysLayer);
    }
  }
}

// ─── renderMetricsBar ─────────────────────────────────────────────────────────

/**
 * Draw the before/after comparison metrics bar at the bottom of the SVG.
 * Reads graph.metrics.before and graph.metrics.after.
 * Skipped if neither is present.
 */
function renderMetricsBar(graph, layout) {
  const bgLayer = dom.backgroundLayer;
  if (!bgLayer) return;

  // Remove any existing metrics bar group
  const existing = bgLayer.querySelector('.metrics-bar-group');
  if (existing) existing.remove();

  const m = graph.metrics;
  if (!m) return;

  const { svgWidth, metricsY, metricsH } = layout;
  const g = svgEl('g', { class: 'metrics-bar-group' });

  // Background strip
  g.appendChild(svgEl('rect', {
    x: 0, y: metricsY,
    width: svgWidth, height: metricsH,
    fill: '#0d1120',
    stroke: '#1e2a3a',
    'stroke-width': 1,
  }));

  // ── Normalise metrics into a flat column list ─────────────────────────────
  // Supports two formats:
  //   A) Array: [{ label, before, after, positive? }]  ← manufacturing JSON
  //   B) Object: { before: { key: val }, after: { key: val } }  ← order-approval JSON
  let columns = [];  // [{ label, bStr, aStr, improved }]

  const FIELDS = [
    { key: 'stepCount',       label: 'Steps',       unit: '',    higherBetter: false },
    { key: 'mttrMinutes',     label: 'MTTR',        unit: ' min',higherBetter: false },
    { key: 'cycleTimeHours',  label: 'Cycle Time',  unit: 'h',   higherBetter: false },
    { key: 'handoffCount',    label: 'Handoffs',    unit: '',    higherBetter: false },
    { key: 'automationPct',   label: 'Automation',  unit: '%',   higherBetter: true  },
    { key: 'errorRate',       label: 'Error Rate',  unit: '',    higherBetter: false },
    { key: 'falsePositiveRate','label':'False Pos',  unit: '',    higherBetter: false },
    { key: 'costPerCase',     label: 'Cost/Case',   unit: '$',   higherBetter: false },
  ];

  if (Array.isArray(m)) {
    // Format A — array of labelled rows
    columns = m.map(item => {
      const bv   = item.before;
      const av   = item.after;
      const bNum = parseFloat(bv);
      const aNum = parseFloat(av);
      const hasNums = !isNaN(bNum) && !isNaN(aNum);
      const improved = hasNums
        ? (item.positive !== false ? aNum > bNum : aNum < bNum)
        : (item.positive === true);
      return {
        label:    item.label || '',
        bStr:     bv != null ? String(bv) : '—',
        aStr:     av != null ? String(av) : '—',
        improved: bv != null && av != null ? improved : null,
      };
    });
  } else {
    // Format B — { before: {}, after: {} } keyed object
    const activeFields = FIELDS.filter(f =>
      (m.before && m.before[f.key] != null) ||
      (m.after  && m.after[f.key]  != null)
    );
    columns = activeFields.map(f => {
      const bv = m.before?.[f.key];
      const av = m.after?.[f.key];
      const fmt = v => v == null ? '—'
        : f.unit === '$' ? `$${v}` : `${v}${f.unit}`;
      const bNum = parseFloat(bv);
      const aNum = parseFloat(av);
      const hasNums = !isNaN(bNum) && !isNaN(aNum);
      const improved = hasNums ? (f.higherBetter ? aNum > bNum : aNum < bNum) : null;
      return {
        label:    f.label,
        bStr:     fmt(bv),
        aStr:     fmt(av),
        improved: bv != null && av != null ? improved : null,
      };
    });
  }

  if (columns.length === 0) return;

  const colW   = Math.floor(svgWidth / columns.length);
  const labelY = metricsY + 15;
  const valY   = metricsY + 40;

  columns.forEach((col, i) => {
    const cx = i * colW + colW / 2;

    if (i > 0) {
      g.appendChild(svgEl('line', {
        x1: i * colW, y1: metricsY + 6,
        x2: i * colW, y2: metricsY + metricsH - 6,
        stroke: '#1e2a3a', 'stroke-width': 1,
      }));
    }

    // Field label
    g.appendChild(svgEl('text', {
      x: cx, y: labelY,
      'text-anchor': 'middle',
      fill: '#64748b',
      'font-size': 11,
      'font-family': 'var(--font-mono, monospace)',
      'font-weight': '600',
      'letter-spacing': '0.04em',
    })).textContent = col.label.toUpperCase();

    // Value: before → after
    const bColor = col.improved != null ? '#ef4444' : '#94a3b8';
    const aColor = col.improved === true  ? '#22c55e'
                 : col.improved === false ? '#f59e0b'
                 : '#94a3b8';

    const combined = svgEl('text', {
      x: cx, y: valY,
      'text-anchor': 'middle',
      'font-family': 'var(--font-mono, monospace)',
      'font-size': 14,
    });
    const tBefore = svgEl('tspan', { fill: bColor });
    tBefore.textContent = col.bStr;
    const tArrow = svgEl('tspan', { fill: '#475569' });
    tArrow.textContent = ' → ';
    const tAfter = svgEl('tspan', { fill: aColor });
    tAfter.textContent = col.aStr;
    combined.appendChild(tBefore);
    combined.appendChild(tArrow);
    combined.appendChild(tAfter);
    g.appendChild(combined);
  });

  bgLayer.appendChild(g);
}

// ─── renderPhaseDots ──────────────────────────────────────────────────────────

/**
 * Populate the #phase-dots bar with clickable dot buttons, one per phase.
 * Adds an "All" button first. Highlights the selectedPhase.
 */
function renderPhaseDots(graph) {
  const container = dom.phaseDots;
  if (!container) return;
  container.innerHTML = '';

  const phases = graph.phases || [];
  if (phases.length === 0) return;

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'phase-dot-btn' + (state.selectedPhase == null ? ' active' : '');
  allBtn.textContent = 'All';
  allBtn.title = 'Show all phases';
  allBtn.addEventListener('click', () => {
    state.selectedPhase = null;
    renderAll(state.graph);
  });
  container.appendChild(allBtn);

  phases.forEach(ph => {
    const btn = document.createElement('button');
    btn.className = 'phase-dot-btn' + (state.selectedPhase === ph.id ? ' active' : '');
    btn.textContent = ph.label || ph.id;
    btn.title = `Show ${ph.label || ph.id}`;
    btn.dataset.phaseId = ph.id;
    btn.addEventListener('click', () => {
      state.selectedPhase = ph.id;
      renderAll(state.graph);
    });
    container.appendChild(btn);
  });
}

// ─── updateFlowDropdown ───────────────────────────────────────────────────────

/**
 * Populate the #flow-selector <select> element with flow options.
 * First option is always "Default sequence".
 */
function updateFlowDropdown(graph) {
  const sel = dom.flowSelector;
  if (!sel) return;

  sel.innerHTML = '';

  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = 'Default sequence';
  sel.appendChild(defOpt);

  const flows = graph.flows || [];
  flows.forEach(flow => {
    const opt = document.createElement('option');
    opt.value = flow.id;
    opt.textContent = flow.name || flow.id;
    sel.appendChild(opt);
  });

  // Show/hide selector based on whether flows exist
  sel.style.display = flows.length > 0 ? '' : 'none';

  // Wire change handler (idempotent — replaces any previous listener via re-assigning)
  sel.onchange = () => {
    state.selectedFlowId = sel.value || null;
  };
}

// ─── renderAll ────────────────────────────────────────────────────────────────

/**
 * Full render pipeline. Called whenever graph data or view mode changes.
 *
 * Order:
 *  1. computeLayout   — derive all absolute coordinates
 *  2. injectDefs      — SVG filters + gradients (idempotent)
 *  3. setSvgDimensions
 *  4. renderLanes
 *  5. renderNodes
 *  6. renderConnections
 *  7. renderMetricsBar
 *  8. renderPhaseDots
 *  9. updateFlowDropdown
 *
 * @param {Object} graph - Parsed graph object from data.js
 */
// Debounced resize listener — installed once on first renderAll call
let _resizeListenerInstalled = false;
function _installResizeListener() {
  if (_resizeListenerInstalled) return;
  _resizeListenerInstalled = true;
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (state.graph) renderAll(state.graph);
    }, 150);
  });
}

export function renderAll(graph) {
  if (!graph) return;
  _installResizeListener();

  const svgContainer = dom.svgContainer;
  let svgWidth;
  if (state.zoomPreset === '4k') {
    svgWidth = 3840;
  } else if (state.zoomPreset === '1080p') {
    svgWidth = 1920;
  } else {
    svgWidth = svgContainer ? svgContainer.clientWidth || 1200 : 1200;
  }

  // Auto-resize lanes to fit their content before computing layout
  // Skip during drag — lanes should stay fixed when user moves nodes
  if (!state._skipLaneResize) {
    autoResizeLanes(graph);
  }

  const layout = computeLayout(graph, svgWidth);
  state.layout = layout;

  injectDefs(layout, graph);
  setSvgDimensions(layout);
  renderLanes(graph, layout);
  renderNodes(graph, layout, state.viewMode);
  renderConnections(graph, layout, state.viewMode);
  renderMetricsBar(graph, layout);
  renderPhaseDots(graph);
  updateFlowDropdown(graph);

  // Fire post-render hooks (e.g. validation badges)
  for (const cb of _postRenderCallbacks) {
    try { cb(); } catch (e) { console.warn('[renderer] post-render hook error:', e); }
  }
}
