/**
 * versioning.js — Named snapshot save / restore
 *
 * Provides in-memory versioning: save the current graph state with a name,
 * list saved versions, and restore any previous version (with undo support).
 */

import { state, dom } from './state.js';
import { renderAll } from './renderer.js';
import { pushUndo } from './interactions.js';

// ─────────────────────────────────────────────────────────────
// Version store
// ─────────────────────────────────────────────────────────────

export const versionStore = {
  /** @type {{ name: string, timestamp: string, snapshot: object }[]} */
  versions: [],

  /**
   * Save the current graph as a named version.
   * @param {string} [name] — display name; defaults to "v<N>"
   */
  save(name) {
    if (!state.graph) return;
    this.versions.push({
      name: name || `v${this.versions.length + 1}`,
      timestamp: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(state.graph)),
    });
  },

  /**
   * Restore a previously saved version by index.
   * Pushes the current state onto the undo stack first so the user can undo
   * the restore operation.
   * @param {number} index
   */
  restore(index) {
    const entry = this.versions[index];
    if (!entry) return;
    pushUndo(); // allow undo of restore
    state.graph = JSON.parse(JSON.stringify(entry.snapshot));
    renderAll(state.graph);
  },

  /**
   * Return a lightweight list of saved versions (no snapshot data).
   * @returns {{ index: number, name: string, timestamp: string }[]}
   */
  list() {
    return this.versions.map((v, i) => ({
      index: i,
      name: v.name,
      timestamp: v.timestamp,
    }));
  },
};

// ─────────────────────────────────────────────────────────────
// UI wiring
// ─────────────────────────────────────────────────────────────

/**
 * Render the version list into #version-list.
 */
function refreshVersionList() {
  const ul = dom.versionList;
  if (!ul) return;
  ul.innerHTML = '';

  const versions = versionStore.list();
  if (versions.length === 0) {
    const li = document.createElement('li');
    li.className = 'version-empty';
    li.textContent = 'No saved versions';
    ul.appendChild(li);
    return;
  }

  versions.forEach(({ index, name, timestamp }) => {
    const li = document.createElement('li');
    li.className = 'version-item';

    const info = document.createElement('div');
    info.className = 'version-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'version-name';
    nameSpan.textContent = name;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'version-time';
    const d = new Date(timestamp);
    timeSpan.textContent = d.toLocaleString();

    info.appendChild(nameSpan);
    info.appendChild(timeSpan);

    const btn = document.createElement('button');
    btn.className = 'version-restore-btn';
    btn.textContent = 'Restore';
    btn.addEventListener('click', () => {
      versionStore.restore(index);
      refreshVersionList();
    });

    li.appendChild(info);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

/**
 * Initialise version panel UI: toggle button, save button, list rendering.
 * Call once after DOMContentLoaded + initDom().
 */
export function initVersioning() {
  const btnToggle = dom.btnVersions;
  const panel = dom.versionPanel;
  const btnSave = dom.btnSaveVersion;
  const nameInput = dom.versionNameInput;

  if (!panel) return; // DOM elements not present

  // Toggle panel visibility
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
      if (!visible) refreshVersionList();
    });
  }

  // Save version
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const name = (nameInput && nameInput.value.trim()) || '';
      versionStore.save(name);
      if (nameInput) nameInput.value = '';
      refreshVersionList();
    });
  }

  // Allow Enter in name input to trigger save
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnSave) btnSave.click();
      }
    });
  }

  // Initial render
  refreshVersionList();
}
