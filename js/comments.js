/**
 * comments.js — Comment system for process graph nodes
 *
 * Implements tasks 7.3 and 7.4:
 *   - Data model: graph.comments array
 *   - CRUD: addComment, resolveComment, getCommentsForNode, getUnresolvedCount
 *   - Comment badges on SVG nodes (blue circle with unresolved count)
 *   - Comment popover UI (list + add form)
 *   - KPI overlay toggle + rendering
 */

import { state, dom } from './state.js';
import { svgEl, onPostRender, renderAll } from './renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Comment data model ────────────────────────────────────────────────────────

/**
 * Ensure graph.comments array exists.
 */
function ensureComments() {
  if (!state.graph) return;
  if (!Array.isArray(state.graph.comments)) {
    state.graph.comments = [];
  }
}

/**
 * Add a comment to a node.
 * @param {string} nodeId
 * @param {string} text
 * @param {string} [author='User']
 * @returns {Object} the newly created comment
 */
export function addComment(nodeId, text, author = 'User') {
  ensureComments();
  const comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nodeId,
    author,
    text,
    timestamp: new Date().toISOString(),
    resolved: false,
  };
  state.graph.comments.push(comment);
  return comment;
}

/**
 * Mark a comment as resolved.
 * @param {string} commentId
 */
export function resolveComment(commentId) {
  ensureComments();
  const comment = state.graph.comments.find(c => c.id === commentId);
  if (comment) comment.resolved = true;
}

/**
 * Get all comments for a given node.
 * @param {string} nodeId
 * @returns {Array}
 */
export function getCommentsForNode(nodeId) {
  ensureComments();
  return state.graph.comments.filter(c => c.nodeId === nodeId);
}

/**
 * Get the count of unresolved comments for a node.
 * @param {string} nodeId
 * @returns {number}
 */
export function getUnresolvedCount(nodeId) {
  return getCommentsForNode(nodeId).filter(c => !c.resolved).length;
}


// ── Comment badge rendering (SVG) ────────────────────────────────────────────

const activeCommentBadges = [];

function clearCommentBadges() {
  for (const badge of activeCommentBadges) {
    if (badge.parentNode) badge.parentNode.removeChild(badge);
  }
  activeCommentBadges.length = 0;
}

/**
 * Render comment badges on all nodes that have unresolved comments.
 * Called as a post-render hook after every renderAll().
 */
export function refreshCommentBadges() {
  clearCommentBadges();

  if (!state.graph || !state.showComments) return;
  if (!dom.nodesLayer || !state.layout) return;

  ensureComments();

  // Collect unique nodeIds with unresolved comments
  const countByNode = new Map();
  for (const c of state.graph.comments) {
    if (c.resolved) continue;
    countByNode.set(c.nodeId, (countByNode.get(c.nodeId) || 0) + 1);
  }

  for (const [nodeId, count] of countByNode) {
    const nodeG = dom.nodesLayer.querySelector(`g[data-node-id="${nodeId}"]`);
    const bounds = state.layout.nodes ? state.layout.nodes[nodeId] : null;
    if (!nodeG || !bounds) continue;

    const bx = bounds.left - 4;
    const by = bounds.top - 4;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'comment-badge');
    g.setAttribute('transform', `translate(${bx}, ${by})`);
    g.setAttribute('data-comment-node', nodeId);
    g.style.cursor = 'pointer';

    // Blue circle background
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '8');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('fill', '#3b82f6');
    circle.setAttribute('stroke', '#1d4ed8');
    circle.setAttribute('stroke-width', '1');
    g.appendChild(circle);

    // Count text
    const txt = document.createElementNS(SVG_NS, 'text');
    txt.setAttribute('x', '0');
    txt.setAttribute('y', '3.5');
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '9');
    txt.setAttribute('font-weight', '700');
    txt.setAttribute('fill', '#ffffff');
    txt.setAttribute('font-family', 'system-ui, sans-serif');
    txt.setAttribute('pointer-events', 'none');
    txt.textContent = String(count);
    g.appendChild(txt);

    // Tooltip
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${count} unresolved comment${count > 1 ? 's' : ''} — click to view`;
    g.appendChild(title);

    // Click handler to open popover
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      openCommentPopover(nodeId);
    });

    nodeG.appendChild(g);
    activeCommentBadges.push(g);
  }
}


// ── Comment popover ──────────────────────────────────────────────────────────

let activePopover = null;
let outsideClickHandler = null;

function closeCommentPopover() {
  if (activePopover && activePopover.parentNode) {
    activePopover.parentNode.removeChild(activePopover);
  }
  activePopover = null;
  if (outsideClickHandler) {
    document.removeEventListener('mousedown', outsideClickHandler, true);
    outsideClickHandler = null;
  }
}

/**
 * Open the comment popover for a given node.
 * @param {string} nodeId
 */
export function openCommentPopover(nodeId) {
  closeCommentPopover();

  const bounds = state.layout && state.layout.nodes ? state.layout.nodes[nodeId] : null;
  if (!bounds) return;

  const node = state.graph.nodes.find(n => n.id === nodeId);
  const nodeLabel = node ? (node.label || node.id) : nodeId;

  const comments = getCommentsForNode(nodeId);
  const unresolvedComments = comments.filter(c => !c.resolved);
  const resolvedComments = comments.filter(c => c.resolved);

  // Create popover container
  const popover = document.createElement('div');
  popover.className = 'comment-popover';

  // Position relative to SVG container
  const svgContainer = dom.svgContainer;
  if (!svgContainer) return;
  const svgRect = svgContainer.getBoundingClientRect();
  const svg = dom.diagramSvg;

  // Convert SVG coords to screen coords
  let screenX = bounds.left;
  let screenY = bounds.bottom + 8;

  // Account for SVG viewBox scaling
  if (svg) {
    const svgBCR = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width > 0) {
      const scaleX = svgBCR.width / vb.width;
      const scaleY = svgBCR.height / vb.height;
      screenX = svgBCR.left + bounds.left * scaleX - svgRect.left + svgContainer.scrollLeft;
      screenY = svgBCR.top + (bounds.bottom + 8) * scaleY - svgRect.top + svgContainer.scrollTop;
    }
  }

  popover.style.left = `${screenX}px`;
  popover.style.top = `${screenY}px`;

  // Header
  const header = document.createElement('div');
  header.className = 'comment-popover-header';
  header.innerHTML = `<span class="comment-popover-title">Comments — ${escapeHtml(nodeLabel)}</span>
    <button class="comment-popover-close" title="Close">&times;</button>`;
  popover.appendChild(header);

  header.querySelector('.comment-popover-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeCommentPopover();
  });

  // Comment list
  const list = document.createElement('div');
  list.className = 'comment-list';

  if (unresolvedComments.length === 0 && resolvedComments.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'comment-empty';
    empty.textContent = 'No comments yet.';
    list.appendChild(empty);
  }

  // Unresolved comments
  for (const c of unresolvedComments) {
    list.appendChild(createCommentEntry(c, nodeId));
  }

  // Resolved comments (collapsed)
  if (resolvedComments.length > 0) {
    const resolvedToggle = document.createElement('div');
    resolvedToggle.className = 'comment-resolved-toggle';
    resolvedToggle.textContent = `${resolvedComments.length} resolved comment${resolvedComments.length > 1 ? 's' : ''}`;
    resolvedToggle.style.cursor = 'pointer';

    const resolvedSection = document.createElement('div');
    resolvedSection.className = 'comment-resolved-section';
    resolvedSection.style.display = 'none';

    for (const c of resolvedComments) {
      resolvedSection.appendChild(createCommentEntry(c, nodeId, true));
    }

    resolvedToggle.addEventListener('click', () => {
      const isHidden = resolvedSection.style.display === 'none';
      resolvedSection.style.display = isHidden ? 'block' : 'none';
      resolvedToggle.textContent = (isHidden ? '▾ ' : '▸ ') +
        `${resolvedComments.length} resolved comment${resolvedComments.length > 1 ? 's' : ''}`;
    });

    list.appendChild(resolvedToggle);
    list.appendChild(resolvedSection);
  }

  popover.appendChild(list);

  // Add comment form
  const form = document.createElement('div');
  form.className = 'comment-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'comment-input';
  input.placeholder = 'Add a comment...';

  const addBtn = document.createElement('button');
  addBtn.className = 'comment-add-btn';
  addBtn.textContent = 'Add';

  const submitComment = () => {
    const text = input.value.trim();
    if (!text) return;
    addComment(nodeId, text);
    input.value = '';
    closeCommentPopover();
    renderAll(state.graph);
  };

  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    submitComment();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitComment();
    }
    e.stopPropagation();
  });

  // Prevent SVG interactions from triggering
  input.addEventListener('mousedown', (e) => e.stopPropagation());

  form.appendChild(input);
  form.appendChild(addBtn);
  popover.appendChild(form);

  // Append to stage so it floats above diagram
  const stage = dom.stage || document.getElementById('stage');
  if (stage) {
    stage.appendChild(popover);
  } else {
    document.body.appendChild(popover);
  }
  activePopover = popover;

  // Focus input
  setTimeout(() => input.focus(), 50);

  // Close on click outside
  outsideClickHandler = (e) => {
    if (activePopover && !activePopover.contains(e.target)) {
      closeCommentPopover();
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickHandler, true);
  }, 100);
}

function createCommentEntry(comment, nodeId, isResolved = false) {
  const entry = document.createElement('div');
  entry.className = 'comment-entry' + (isResolved ? ' resolved' : '');

  const meta = document.createElement('div');
  meta.className = 'comment-meta';

  const author = document.createElement('span');
  author.className = 'comment-author';
  author.textContent = comment.author;

  const time = document.createElement('span');
  time.className = 'comment-time';
  time.textContent = formatTimestamp(comment.timestamp);

  meta.appendChild(author);
  meta.appendChild(time);

  const text = document.createElement('div');
  text.className = 'comment-text';
  text.textContent = comment.text;

  entry.appendChild(meta);
  entry.appendChild(text);

  // Resolve button (only for unresolved)
  if (!isResolved) {
    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'comment-resolve-btn';
    resolveBtn.textContent = 'Resolve';
    resolveBtn.title = 'Mark as resolved';
    resolveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resolveComment(comment.id);
      closeCommentPopover();
      renderAll(state.graph);
    });
    entry.appendChild(resolveBtn);
  }

  return entry;
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ── KPI overlay rendering ────────────────────────────────────────────────────

const KPI_ICONS = {
  duration:  '\u23F1',   // stopwatch
  errorRate: '\u26A0',   // warning
  cost:      '\uD83D\uDCB0', // money bag (but we use $ prefix in practice)
};

// Fallback icon for unknown KPI keys
const KPI_DEFAULT_ICON = '\u2139';  // info

const KPI_COLORS = {
  duration:  '#3b82f6',
  errorRate: '#f59e0b',
  cost:      '#22c55e',
};

const activeKPIOverlays = [];

function clearKPIOverlays() {
  for (const el of activeKPIOverlays) {
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  activeKPIOverlays.length = 0;
}

/**
 * Render KPI pill overlays below nodes that have a `kpis` object.
 * Called as a post-render hook.
 */
export function refreshKPIOverlays() {
  clearKPIOverlays();

  if (!state.showKPIOverlay || !state.graph || !state.layout) return;
  if (!dom.nodesLayer) return;

  for (const node of state.graph.nodes) {
    if (!node.kpis || typeof node.kpis !== 'object') continue;

    const bounds = state.layout.nodes ? state.layout.nodes[node.id] : null;
    const nodeG = dom.nodesLayer.querySelector(`g[data-node-id="${node.id}"]`);
    if (!bounds || !nodeG) continue;

    const entries = Object.entries(node.kpis);
    if (entries.length === 0) continue;

    const overlay = document.createElementNS(SVG_NS, 'g');
    overlay.setAttribute('class', 'kpi-overlay');

    // Position below the node
    const startY = bounds.bottom + 6;
    let offsetX = 0;

    for (const [key, value] of entries) {
      const icon = KPI_ICONS[key] || KPI_DEFAULT_ICON;
      const color = KPI_COLORS[key] || '#3b82f6';
      const labelText = `${icon} ${value}`;

      // Estimate pill width based on text length
      const textWidth = labelText.length * 5.5 + 12;
      const pillHeight = 16;

      const pill = document.createElementNS(SVG_NS, 'g');
      pill.setAttribute('transform', `translate(${bounds.left + offsetX}, ${startY})`);

      // Background rect
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('rx', '4');
      rect.setAttribute('ry', '4');
      rect.setAttribute('width', String(textWidth));
      rect.setAttribute('height', String(pillHeight));
      rect.setAttribute('fill', color);
      rect.setAttribute('fill-opacity', '0.2');
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', '0.8');
      rect.setAttribute('stroke-opacity', '0.6');
      pill.appendChild(rect);

      // Text
      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', String(textWidth / 2));
      txt.setAttribute('y', '11.5');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('fill', color);
      txt.setAttribute('font-family', 'system-ui, sans-serif');
      txt.setAttribute('pointer-events', 'none');
      txt.textContent = labelText;
      pill.appendChild(txt);

      // Tooltip
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${key}: ${value}`;
      pill.appendChild(title);

      overlay.appendChild(pill);
      offsetX += textWidth + 4;
    }

    nodeG.appendChild(overlay);
    activeKPIOverlays.push(overlay);
  }
}


// ── KPI toggle button ────────────────────────────────────────────────────────

function initKPIToggle() {
  const btn = document.getElementById('btn-kpi-overlay');
  if (!btn) return;

  btn.addEventListener('click', () => {
    state.showKPIOverlay = !state.showKPIOverlay;
    btn.classList.toggle('active', state.showKPIOverlay);
    if (state.graph) renderAll(state.graph);
  });
}


// ── Initialisation ──────────────────────────────────────────────────────────

/**
 * Initialise comments system and KPI overlays.
 * Called from main.js after DOM is ready.
 */
export function initComments() {
  // Register post-render hooks for badges and KPI overlays
  onPostRender(refreshCommentBadges);
  onPostRender(refreshKPIOverlays);

  // Init KPI toggle button
  initKPIToggle();
}
