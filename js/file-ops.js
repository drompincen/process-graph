/**
 * file-ops.js — Live JSON editor, file upload/download, notebook display,
 *               and diagram selector wiring.
 */

import { state, dom } from './state.js';
import { parseGraph } from './data.js';
import { renderAll } from './renderer.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simple debounce utility.
 * @param {Function} fn  - function to debounce
 * @param {number}   ms  - delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Dynamic import of narrative.js to avoid circular dependency.
 * Silently ignores import errors (module may not exist yet).
 */
async function tryInitNarrative(graph) {
  try {
    const { initNarrative } = await import('./narrative.js');
    initNarrative(graph);
  } catch {}
}

// ── Notebook ───────────────────────────────────────────────────────────────

/**
 * Show or hide the #notebook widget based on graph.notes.
 * @param {object} graph
 */
export function updateNotebook(graph) {
  if (!dom.notebook || !dom.notebookText) return;

  if (graph && graph.notes) {
    dom.notebookText.textContent = graph.notes;
    dom.notebook.style.display = '';
  } else {
    dom.notebook.style.display = 'none';
  }
}

// ── Editor helpers ─────────────────────────────────────────────────────────

/**
 * Apply a successfully parsed graph: update state, render, narrative, notebook.
 * @param {object} graph
 */
function applyGraph(graph) {
  state.graph = graph;
  renderAll(graph);
  updateNotebook(graph);
  if (graph.story) {
    tryInitNarrative(graph);
  }
}

/**
 * Show a parse error in the editor UI.
 * @param {Error|string} err
 */
function showEditorError(err) {
  if (dom.editorError) dom.editorError.textContent = err instanceof Error ? err.message : String(err);
  if (dom.jsonEditor) dom.jsonEditor.classList.add('invalid');
}

/**
 * Clear the editor error state.
 */
function clearEditorError() {
  if (dom.editorError) dom.editorError.textContent = '';
  if (dom.jsonEditor) dom.jsonEditor.classList.remove('invalid');
}

/**
 * Try to parse and apply the text from #json-editor.
 * @param {boolean} silent - if true, suppress error display on failure
 */
function applyEditorText(silent = false) {
  if (!dom.jsonEditor) return;
  const text = dom.jsonEditor.value;
  try {
    const graph = parseGraph(text);
    clearEditorError();
    applyGraph(graph);
  } catch (err) {
    if (!silent) {
      showEditorError(err);
    }
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

/**
 * Wire all file-operation and editor event listeners.
 * Called once after DOMContentLoaded.
 */
export function initFileOps() {
  // ── Live editor: #btn-update ──────────────────────────────────
  if (dom.btnUpdate) {
    dom.btnUpdate.addEventListener('click', () => applyEditorText(false));
  }

  // ── Live editor: debounced input (800 ms, silent) ─────────────
  if (dom.jsonEditor) {
    const debouncedApply = debounce(() => applyEditorText(true), 800);
    dom.jsonEditor.addEventListener('input', debouncedApply);

    // ── Live editor: Ctrl+Enter → immediate update ────────────
    dom.jsonEditor.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        applyEditorText(false);
      }
    });
  }

  // ── JSON upload ───────────────────────────────────────────────
  if (dom.btnUploadJson) {
    dom.btnUploadJson.addEventListener('click', () => {
      if (dom.fileInput) dom.fileInput.click();
    });
  }

  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', () => {
      const file = dom.fileInput.files && dom.fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        try {
          const graph = parseGraph(text);
          clearEditorError();
          if (dom.jsonEditor) dom.jsonEditor.value = JSON.stringify(graph, null, 2);
          applyGraph(graph);
        } catch (err) {
          showEditorError(err);
        }
      };
      reader.readAsText(file);

      // Reset so the same file can be re-uploaded
      dom.fileInput.value = '';
    });
  }

  // ── JSON download ─────────────────────────────────────────────
  if (dom.btnDownloadJson) {
    dom.btnDownloadJson.addEventListener('click', () => {
      if (!state.graph) return;
      const json = JSON.stringify(state.graph, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = (state.graph.title || 'diagram').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') + '.json';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ── Show/hide editor pane ─────────────────────────────────────
  if (dom.chkShowEditor) {
    dom.chkShowEditor.addEventListener('change', () => {
      if (!dom.editorPane) return;
      dom.editorPane.style.display = dom.chkShowEditor.checked ? '' : 'none';
    });
  }

  // ── Notebook: initial display based on loaded graph ──────────
  if (state.graph) {
    updateNotebook(state.graph);
  }
}
