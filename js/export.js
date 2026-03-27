/**
 * export.js — SVG, PNG, and PDF export
 *
 * Exports:
 *   initExport() — wire #btn-export-svg, #btn-export-png, #btn-export-pdf
 */

import { state, dom } from './state.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeFilename(graph) {
  const base = (graph?.title || 'process-diagram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'diagram';
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── SVG export ──────────────────────────────────────────────────────────────

function exportSvg() {
  const svgEl = dom.diagramSvg;
  if (!svgEl) return;

  // Clone so we can inject inline styles without mutating the live DOM
  const clone = svgEl.cloneNode(true);

  // Inline the CSS custom properties as literal values on the clone root
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.style.background = '#0f1117';

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  triggerDownload(url, `${safeFilename(state.graph)}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── PNG export ──────────────────────────────────────────────────────────────

async function exportPng() {
  const svgEl = dom.diagramSvg;
  if (!svgEl) return;

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale  = window.devicePixelRatio || 2;
    canvas.width  = svgEl.clientWidth  * scale;
    canvas.height = svgEl.clientHeight * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, svgEl.clientWidth, svgEl.clientHeight);

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${safeFilename(state.graph)}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');

    URL.revokeObjectURL(svgUrl);
  };
  img.onerror = () => {
    console.error('[export] PNG render failed');
    URL.revokeObjectURL(svgUrl);
  };
  img.src = svgUrl;
}

// ─── PDF export ──────────────────────────────────────────────────────────────

async function exportPdf() {
  // Show the modal for orientation confirmation
  const modal = dom.modalExportPdf;
  if (!modal) {
    // No modal — fall back to direct export
    await _doPdfExport('landscape');
    return;
  }

  modal.style.display = 'flex';

  const onConfirm = async () => {
    modal.style.display = 'none';
    cleanup();
    await _doPdfExport('landscape');
  };

  const onCancel = () => {
    modal.style.display = 'none';
    cleanup();
  };

  const confirmBtn = dom.btnPdfConfirm;
  const cancelBtn  = dom.btnPdfCancel;

  function cleanup() {
    if (confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
    if (cancelBtn)  cancelBtn.removeEventListener('click', onCancel);
  }

  if (confirmBtn) confirmBtn.addEventListener('click', onConfirm, { once: true });
  if (cancelBtn)  cancelBtn.addEventListener('click', onCancel, { once: true });
}

async function _doPdfExport(orientation) {
  const svgEl = dom.diagramSvg;
  if (!svgEl) return;

  // Render SVG → canvas → PDF via jsPDF (loaded via CDN in index.html)
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    console.error('[export] jsPDF not loaded');
    return;
  }

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const w = svgEl.clientWidth;
    const h = svgEl.clientHeight;

    const canvas = document.createElement('canvas');
    const scale  = 2;
    canvas.width  = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = canvas.toDataURL('image/png');

    // A4 landscape: 297 × 210 mm
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    // Fit diagram preserving aspect ratio
    const ratio = Math.min(pdfW / w, pdfH / h);
    const drawW = w * ratio;
    const drawH = h * ratio;
    const offX  = (pdfW - drawW) / 2;
    const offY  = (pdfH - drawH) / 2;

    pdf.addImage(imgData, 'PNG', offX, offY, drawW, drawH);
    pdf.save(`${safeFilename(state.graph)}.pdf`);

    URL.revokeObjectURL(svgUrl);
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initExport() {
  if (dom.btnExportSvg) dom.btnExportSvg.addEventListener('click', exportSvg);
  if (dom.btnExportPng) dom.btnExportPng.addEventListener('click', exportPng);
  if (dom.btnExportPdf) dom.btnExportPdf.addEventListener('click', exportPdf);
}
