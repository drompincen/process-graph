/**
 * validation-ui.js — Validation panel UI, warning badges, and navigation
 *
 * Implements task 5.11 (Agent 5-B):
 *   - Validate button click handler
 *   - Populate validation results panel
 *   - Click issue to pan/highlight the offending node
 *   - Warning badges on SVG node groups
 *   - Loop mode toggle
 */

import { state, dom } from './state.js';
import { svgEl, onPostRender } from './renderer.js';

// ── Lazy import of validateGraph (created by Agent 5-A in parallel) ──────────
let validateGraph = null;

async function loadValidator() {
  try {
    const mod = await import('./validation.js');
    validateGraph = mod.validateGraph;
  } catch {
    console.warn('[validation-ui] validation.js not yet available');
  }
}

// ── SVG namespace ────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Badge tracking ───────────────────────────────────────────────────────────
// Keep references to badge elements so we can remove them on re-validation
const activeBadges = [];

/**
 * Remove all existing validation badges from the SVG.
 */
function clearBadges() {
  for (const badge of activeBadges) {
    if (badge.parentNode) badge.parentNode.removeChild(badge);
  }
  activeBadges.length = 0;
}

/**
 * Create a small warning badge (yellow triangle + "!") and append it to a
 * node's <g> element at the top-right corner.
 *
 * @param {SVGGElement} nodeG  — the node's <g data-node-id="...">
 * @param {Object}      bounds — { x, y, left, right, top, bottom }
 * @param {string}      tooltipText — text shown on hover
 */
function addBadge(nodeG, bounds, tooltipText) {
  if (!nodeG || !bounds) return;

  const bx = bounds.right - 4;
  const by = bounds.top - 2;

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'validation-badge');
  g.setAttribute('transform', `translate(${bx}, ${by})`);

  // Yellow triangle
  const tri = document.createElementNS(SVG_NS, 'polygon');
  tri.setAttribute('points', '6,0 12,10 0,10');
  tri.setAttribute('fill', '#f59e0b');
  tri.setAttribute('stroke', '#92400e');
  tri.setAttribute('stroke-width', '0.8');
  g.appendChild(tri);

  // "!" text
  const txt = document.createElementNS(SVG_NS, 'text');
  txt.setAttribute('x', '6');
  txt.setAttribute('y', '9');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('font-size', '8');
  txt.setAttribute('fill', '#451a03');
  txt.textContent = '!';
  g.appendChild(txt);

  // Tooltip via SVG <title>
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = tooltipText;
  g.appendChild(title);

  nodeG.appendChild(g);
  activeBadges.push(g);
}

/**
 * Render warning badges on all nodes that have validation issues.
 */
function renderBadges() {
  clearBadges();

  if (!state.validationIssues || !state.validationIssues.length) return;
  if (!dom.nodesLayer) return;

  // Group issues by nodeId (first issue per node for tooltip)
  const issuesByNode = new Map();
  for (const issue of state.validationIssues) {
    if (issue.nodeId && !issuesByNode.has(issue.nodeId)) {
      issuesByNode.set(issue.nodeId, issue.message);
    }
  }

  for (const [nodeId, message] of issuesByNode) {
    const nodeG = dom.nodesLayer.querySelector(`g[data-node-id="${nodeId}"]`);
    const bounds = state.layout && state.layout.nodes ? state.layout.nodes[nodeId] : null;
    if (nodeG && bounds) {
      addBadge(nodeG, bounds, message);
    }
  }
}

/**
 * Pan the SVG viewport to center on a given node and briefly highlight it.
 *
 * @param {string} nodeId — the ID of the node to navigate to
 */
function navigateToNode(nodeId) {
  if (!nodeId) return;

  const container = dom.svgContainer;
  const svg = dom.diagramSvg;
  if (!container || !svg) return;

  const bounds = state.layout && state.layout.nodes ? state.layout.nodes[nodeId] : null;
  if (!bounds) return;

  // Calculate where to scroll so the node is centered in the visible area
  const containerRect = container.getBoundingClientRect();

  // Get the SVG viewBox to compute the scale factor
  const viewBox = svg.viewBox.baseVal;
  if (!viewBox || !viewBox.width) return;

  const scaleX = svg.clientWidth / viewBox.width;
  const scaleY = svg.clientHeight / viewBox.height;

  // Node center in screen-space pixels relative to SVG element
  const nodeCenterX = bounds.x * scaleX;
  const nodeCenterY = bounds.y * scaleY;

  // Scroll so the node is centered
  const scrollLeft = nodeCenterX - containerRect.width / 2;
  const scrollTop = nodeCenterY - containerRect.height / 2;

  container.scrollTo({
    left: Math.max(0, scrollLeft),
    top: Math.max(0, scrollTop),
    behavior: 'smooth',
  });

  // Highlight the node group with a pulse animation
  const nodeG = dom.nodesLayer
    ? dom.nodesLayer.querySelector(`g[data-node-id="${nodeId}"]`)
    : null;
  if (nodeG) {
    nodeG.classList.remove('validation-highlight');
    // Force reflow to restart animation
    void nodeG.offsetWidth;
    nodeG.classList.add('validation-highlight');
    // Remove class after animation completes (3 pulses * 0.6s = 1.8s)
    setTimeout(() => nodeG.classList.remove('validation-highlight'), 2000);
  }
}

/**
 * Populate the validation panel with the current issues.
 */
function populatePanel(issues) {
  const list = dom.validationList;
  const countBadge = dom.validationCount;
  if (!list) return;

  list.innerHTML = '';

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;

  // Update count badge
  if (countBadge) {
    const total = issues.length;
    countBadge.textContent = total === 0
      ? 'No issues'
      : `${total} issue${total !== 1 ? 's' : ''}` +
        (errorCount ? ` (${errorCount} error${errorCount !== 1 ? 's' : ''})` : '');
    countBadge.className = 'badge' +
      (errorCount ? ' has-errors' : warnCount ? ' has-warnings' : ' all-clear');
  }

  // Render each issue as a list item
  for (const issue of issues) {
    const li = document.createElement('li');
    li.className = `validation-issue ${issue.severity}`;
    if (issue.nodeId) li.dataset.nodeId = issue.nodeId;

    const icon = document.createElement('span');
    icon.className = 'icon';
    li.appendChild(icon);

    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = issue.message;
    li.appendChild(msg);

    // Click to navigate to node
    if (issue.nodeId) {
      li.addEventListener('click', () => navigateToNode(issue.nodeId));
    }

    list.appendChild(li);
  }
}

/**
 * Run validation and update the UI (panel + badges).
 */
async function runValidation() {
  if (!validateGraph) await loadValidator();
  if (!validateGraph) {
    console.warn('[validation-ui] validateGraph not available');
    return;
  }
  if (!state.graph) return;

  const issues = validateGraph(state.graph, {
    loopModeEnabled: state.loopModeEnabled,
    allowDecisionToDecision: state.config.allowDecisionToDecision,
  });
  state.validationIssues = issues;

  populatePanel(issues);
  renderBadges();

  // Show the panel
  if (dom.validationPanel) {
    dom.validationPanel.style.display = '';
  }
}

/**
 * Initialise validation UI event handlers.
 * Called from main.js after DOM is ready.
 */
export function initValidationUI() {
  // Attempt to load the validator module eagerly
  loadValidator();

  // Register post-render hook to refresh badges after every renderAll()
  onPostRender(refreshValidationBadges);

  // Validate button
  const btnValidate = dom.btnValidate;
  if (btnValidate) {
    btnValidate.addEventListener('click', () => runValidation());
  }

  // Close button
  const btnClose = dom.btnCloseValidation;
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (dom.validationPanel) dom.validationPanel.style.display = 'none';
    });
  }

  // Loop mode toggle
  const chkLoops = dom.chkAllowLoops;
  if (chkLoops) {
    chkLoops.checked = state.loopModeEnabled;
    chkLoops.addEventListener('change', () => {
      state.loopModeEnabled = chkLoops.checked;
      // Re-run validation if panel is visible
      if (dom.validationPanel && dom.validationPanel.style.display !== 'none') {
        runValidation();
      }
    });
  }

  // Decision-to-decision toggle (7.9)
  const chkD2D = dom.chkAllowD2d;
  if (chkD2D) {
    chkD2D.checked = state.config.allowDecisionToDecision;
    chkD2D.addEventListener('change', () => {
      state.config.allowDecisionToDecision = chkD2D.checked;
      // Re-run validation if panel is visible
      if (dom.validationPanel && dom.validationPanel.style.display !== 'none') {
        runValidation();
      }
    });
  }
}

/**
 * Re-render validation badges (called after renderAll to refresh overlays).
 * Safe to call even if no validation has been run yet.
 */
export function refreshValidationBadges() {
  if (state.validationIssues && state.validationIssues.length > 0) {
    renderBadges();
  }
}

/**
 * Run validation and return whether there are blocking errors.
 * Used by save flow to block save when errors exist.
 *
 * @returns {boolean} true if save should be blocked (errors present)
 */
export async function validateBeforeSave() {
  await runValidation();
  return state.validationIssues.some(i => i.severity === 'error');
}
