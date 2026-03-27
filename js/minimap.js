/**
 * minimap.js — Mini-map navigation widget
 *
 * Renders a simplified overview of the entire diagram on a 200x150 canvas.
 * Supports click-to-navigate and click+drag continuous panning.
 *
 * Exports:
 *   renderMinimap()     — redraw the minimap (called after every renderAll)
 *   initMinimap()       — attach mouse event listeners for click-to-navigate
 */

import { state, dom } from './state.js';
import { NODE_DIMS } from './layout.js';
import { LANE_COLORS } from './constants.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 200;
const CANVAS_H = 150;
const PADDING  = 8; // px padding inside minimap for diagram bounds

// ─── Cached state for coordinate conversion ─────────────────────────────────

let _scale  = 1;
let _offsetX = 0;
let _offsetY = 0;
let _diagramBounds = { x: 0, y: 0, w: 1, h: 1 };

// ─── Diagram bounds computation ─────────────────────────────────────────────

function computeDiagramBounds(layout) {
  if (!layout) return { x: 0, y: 0, w: 1200, h: 600 };

  const w = layout.svgWidth  || 1200;
  const h = layout.svgHeight || 600;
  return { x: 0, y: 0, w, h };
}

// ─── Node color by type ─────────────────────────────────────────────────────

function getNodeColor(type) {
  switch (type) {
    case 'start-event':        return '#22c55e';
    case 'end-event':          return '#ef4444';
    case 'gateway':            return '#f59e0b';
    case 'merge':              return '#94a3b8';
    case 'task':               return '#e2e8f0';
    case 'subprocess':         return '#60a5fa';
    case 'intermediate-event': return '#3b82f6';
    case 'annotation':         return '#64748b';
    default:                   return '#e2e8f0';
  }
}

// ─── Render minimap ─────────────────────────────────────────────────────────

export function renderMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const layout = state.layout;
  const graph  = state.graph;
  if (!layout || !graph) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  // Compute diagram bounds
  _diagramBounds = computeDiagramBounds(layout);
  const db = _diagramBounds;

  // Calculate scale to fit diagram in canvas with padding
  const availW = CANVAS_W - PADDING * 2;
  const availH = CANVAS_H - PADDING * 2;
  _scale = Math.min(availW / db.w, availH / db.h);
  _offsetX = PADDING + (availW - db.w * _scale) / 2;
  _offsetY = PADDING + (availH - db.h * _scale) / 2;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = '#0d1120';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.translate(_offsetX, _offsetY);
  ctx.scale(_scale, _scale);

  // ── Draw lanes as colored horizontal bands ──────────────────────────────
  if (layout.lanes) {
    layout.lanes.forEach((lane, i) => {
      const color = lane.color || LANE_COLORS[i % LANE_COLORS.length];
      ctx.fillStyle = color + '40'; // ~25% opacity
      ctx.fillRect(0, lane.y, db.w, lane.height);
    });
  }

  // ── Draw connections as thin gray lines ─────────────────────────────────
  if (graph.connections && layout.nodes) {
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1 / _scale; // keep at ~0.5px screen
    ctx.beginPath();
    for (const conn of graph.connections) {
      const src = layout.nodes[conn.from];
      const tgt = layout.nodes[conn.to];
      if (!src || !tgt) continue;
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
    }
    ctx.stroke();
  }

  // ── Draw nodes as small colored shapes ──────────────────────────────────
  if (graph.nodes && layout.nodes) {
    for (const node of graph.nodes) {
      const bounds = layout.nodes[node.id];
      if (!bounds) continue;
      const color = getNodeColor(node.type);
      ctx.fillStyle = color;

      const size = 4 / _scale; // ~4px screen size

      if (node.type === 'gateway') {
        // Diamond
        ctx.save();
        ctx.translate(bounds.x, bounds.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      } else if (node.type === 'start-event' || node.type === 'end-event' ||
                 node.type === 'merge' || node.type === 'intermediate-event') {
        // Circle
        ctx.beginPath();
        ctx.arc(bounds.x, bounds.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Rectangle
        ctx.fillRect(bounds.x - size * 0.75, bounds.y - size / 2, size * 1.5, size);
      }
    }
  }

  // ── Draw viewport indicator ─────────────────────────────────────────────
  const svgContainer = dom.svgContainer;
  const svgEl = dom.diagramSvg;
  if (svgContainer && svgEl && layout) {
    const zoom = state.zoom || 1;
    const panX = state.panX || 0;
    const panY = state.panY || 0;

    // The SVG's viewBox maps diagram coords to screen via base scale:
    //   baseScale = containerWidth / diagramWidth (when width:100%)
    // CSS transform then applies additional zoom + pan on top.
    // Visible area in diagram coords:
    const containerW = svgContainer.clientWidth;
    const containerH = svgContainer.clientHeight;
    const diagW = layout.svgWidth  || db.w;
    const diagH = layout.svgHeight || db.h;

    // Base scale from viewBox fitting
    const baseScale = containerW / diagW;
    const effectiveScale = baseScale * zoom;

    const viewW = containerW / effectiveScale;
    const viewH = containerH / effectiveScale;
    const viewX = -panX / effectiveScale;
    const viewY = -panY / effectiveScale;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2 / _scale;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(viewX, viewY, viewW, viewH);
    ctx.strokeRect(viewX, viewY, viewW, viewH);
  }

  ctx.restore();

  // ── Update zoom percentage label ────────────────────────────────────────
  const zoomLabel = document.getElementById('zoom-pct-label');
  if (zoomLabel) {
    const zoom = state.zoom || 1;
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
}

// ─── Coordinate conversion: minimap canvas → diagram coords ─────────────────

function canvasToDiagram(canvasX, canvasY) {
  const diagramX = (canvasX - _offsetX) / _scale + _diagramBounds.x;
  const diagramY = (canvasY - _offsetY) / _scale + _diagramBounds.y;
  return { x: diagramX, y: diagramY };
}

// ─── Pan to center viewport on a diagram point ─────────────────────────────

function panToPosition(diagramX, diagramY) {
  const svgContainer = dom.svgContainer;
  const layout = state.layout;
  if (!svgContainer || !layout) return;

  const zoom = state.zoom || 1;
  const containerW = svgContainer.clientWidth;
  const containerH = svgContainer.clientHeight;
  const diagW = layout.svgWidth || 1200;

  // Base scale from viewBox fitting (SVG width:100% maps diagram to container)
  const baseScale = containerW / diagW;
  const effectiveScale = baseScale * zoom;

  const viewW = containerW / effectiveScale;
  const viewH = containerH / effectiveScale;

  // Center the viewport on the clicked point
  state.panX = -(diagramX - viewW / 2) * effectiveScale;
  state.panY = -(diagramY - viewH / 2) * effectiveScale;

  applyZoomPan();
  renderMinimap();
}

// ─── Apply zoom + pan transform to the SVG ──────────────────────────────────

export function applyZoomPan() {
  const svg = dom.diagramSvg;
  if (!svg) return;

  const zoom = state.zoom || 1;
  const panX = state.panX || 0;
  const panY = state.panY || 0;

  svg.style.transformOrigin = '0 0';
  svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

// ─── Init minimap interactions ──────────────────────────────────────────────

export function initMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;

  let isDragging = false;

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    handleMinimapClick(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    handleMinimapClick(e);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  function handleMinimapClick(e) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const { x, y } = canvasToDiagram(canvasX, canvasY);
    panToPosition(x, y);
  }
}
