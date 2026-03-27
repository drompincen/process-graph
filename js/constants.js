/**
 * constants.js — BPMN icons, colour maps, default JSON template
 */

/** SVG path/shape data for node type icons (28×28 viewBox) */
export const BPMN_ICONS = {
  'task':               null,  // no icon — text label only
  'subprocess':         null,  // [+] marker drawn inline
  'gateway':            null,  // diamond shape IS the meaning
  'start-event':        null,  // circle shape IS the meaning
  'end-event':          null,  // circle shape IS the meaning
  'annotation':         null,  // dashed rect shape
  'intermediate-event': null,  // double-ring shape
};

/** 9.2 — Small SVG path icons for node types (16x16 viewBox) */
export const ICON_PATHS = {
  // Clipboard shape for task
  task:        'M6 1h4v2h3v12H3V3h3V1zm1 1v1h2V2H7z',
  // Nested squares for subprocess
  subprocess:  'M2 2h12v12H2V2zm2 2v8h8V4H4zm2 2h4v4H6V6z',
  // Question mark for gateway
  gateway:     'M6 3a3 3 0 0 1 4.5 2.6c0 1.4-2.5 1.4-2.5 3.4h-1c0-2.5 2.5-2.2 2.5-3.4a2 2 0 0 0-3.5-1.3L5 3.3A3 3 0 0 1 6 3zM7 12h2v2H7v-2z',
  // Play triangle for start-event
  'start-event': 'M4 2l10 6-10 6V2z',
  // Stop square for end-event
  'end-event':   'M3 3h10v10H3V3z',
  // Converging arrows for merge
  merge:       'M2 2l6 6-6 6V2zm12 0l-6 6 6 6V2z',
};

/** Small state badge icons overlaid top-left on node */
export const STATE_ICONS = {
  bottleneck: '⚠',
  automated:  '⚡',
};

/** Diff state → fill + stroke colours */
export const DIFF_COLORS = {
  added:     { fill: 'rgba(34,197,94,0.12)',  stroke: '#22c55e', glowId: 'glow-green' },
  removed:   { fill: 'rgba(239,68,68,0.12)',  stroke: '#ef4444', glowId: 'glow-red'   },
  changed:   { fill: 'rgba(245,158,11,0.12)', stroke: '#f59e0b', glowId: 'glow-amber' },
  unchanged: { fill: null, stroke: null, glowId: null },
};

/** Default lane accent colours (used when lane.color not specified) */
export const LANE_COLORS = [
  '#1e3a5f', '#1a3a2a', '#3a1a3a', '#2a2a1a',
  '#1a2a3a', '#3a2a1a', '#1a3a3a', '#3a1a1a',
];

/** Popup toast icon paths by type */
export const POPUP_ICONS = {
  alert:   '⚠',
  issue:   '🔴',
  amplify: '✅',
};

/** Node fill gradient IDs (referenced in SVG defs) */
export const NODE_FILL = {
  default:  'nf-task',
  terminal: 'nf-term',
  decision: 'nf-dec',
  added:    'nf-added',
  removed:  'nf-removed',
};

/** Port definitions for each node type — used by routing and connection validation.
 *  in/out: arrays of port directions; maxIn/maxOut: connection count limits. */
export const PORT_DEFS = {
  'task':           { in: ['top'],              out: ['right'],              maxIn: 1,  maxOut: 1 },
  'gateway':        { in: ['top'],              out: ['left','right','bottom'], maxIn: 1, maxOut: 5, minOut: 2 },
  'merge':          { in: ['top','left','right'], out: ['bottom'],           maxIn: 10, maxOut: 1 },
  'start-event':    { in: [],                   out: ['right'],              maxIn: 0,  maxOut: 1 },
  'end-event':      { in: ['top','left'],       out: [],                     maxIn: 10, maxOut: 0 },
  'subprocess':     { in: ['top'],              out: ['right'],              maxIn: 1,  maxOut: 1 },
  'process-group':  { in: ['left'],             out: ['right'],              maxIn: 1,  maxOut: 1 },
  'annotation':     { in: [],                   out: [],                     maxIn: 0,  maxOut: 0 },
  'intermediate-event': { in: ['left'],         out: ['right'],              maxIn: 1,  maxOut: 1 },
  'persona':        { in: [],                   out: [],                     maxIn: 0,  maxOut: 0 },  // annotation only
  'system':         { in: [],                   out: [],                     maxIn: 0,  maxOut: 0 },  // annotation only
  'agent':          { in: [],                   out: [],                     maxIn: 0,  maxOut: 0 },  // annotation only
};

/** Connection matrix: source type → allowed target types */
export const CONNECTION_MATRIX = {
  'start-event':        ['task', 'gateway', 'process-group', 'subprocess'],
  'task':               ['task', 'gateway', 'process-group', 'subprocess', 'merge', 'end-event', 'intermediate-event'],
  'gateway':            ['task', 'process-group', 'subprocess', 'merge', 'end-event', 'intermediate-event'],
  'merge':              ['task', 'process-group', 'subprocess', 'gateway', 'end-event', 'intermediate-event'],
  'process-group':      ['task', 'gateway', 'subprocess', 'merge', 'end-event', 'intermediate-event'],
  'subprocess':         ['task', 'gateway', 'subprocess', 'merge', 'end-event', 'intermediate-event'],
  'end-event':          [],
  'intermediate-event': ['task', 'gateway', 'subprocess', 'merge', 'end-event', 'process-group'],
  'persona':            [],
  'system':             [],
  'agent':              [],
  'annotation':         [],
};

/** When false, gateway→gateway connections are rejected */
export const ALLOW_DECISION_TO_DECISION = false;

/** Valid lane type values */
export const LANE_TYPES = ['persona', 'system', 'agent', 'department'];

/** Default lane type when not specified */
export const DEFAULT_LANE_TYPE = 'department';

/** Default JSON shown in editor when no file loaded */
export const DEFAULT_JSON = `{
  "title": "Sample Process",
  "notes": "Edit this diagram or load a JSON file.",
  "metrics": {
    "before": { "stepCount": 4, "cycleTimeHours": 24, "handoffCount": 3 },
    "after":  { "stepCount": 2, "cycleTimeHours": 2,  "handoffCount": 1 }
  },
  "lanes": [
    { "id": "requester", "label": "Requester", "color": "#1e3a5f" },
    { "id": "system",    "label": "System",    "color": "#1a3a2a" }
  ],
  "nodes": [
    { "id": "start",  "type": "start-event", "label": "Start",   "lane": "requester", "x": 100, "phase": "both" },
    { "id": "submit", "type": "task",         "label": "Submit\\nRequest", "lane": "requester", "x": 200, "phase": "both" },
    { "id": "auto",   "type": "task",         "label": "Auto\\nCheck",    "lane": "system",    "x": 360, "phase": "after", "state": "automated" },
    { "id": "manual", "type": "task",         "label": "Manual\\nCheck",  "lane": "system",    "x": 360, "phase": "before" },
    { "id": "end",    "type": "end-event",    "label": "Done",   "lane": "requester", "x": 520, "phase": "both" }
  ],
  "connections": [
    { "id": "c1", "from": "start",  "to": "submit", "type": "sequence", "phase": "both" },
    { "id": "c2", "from": "submit", "to": "manual", "type": "message",  "phase": "before" },
    { "id": "c3", "from": "submit", "to": "auto",   "type": "message",  "phase": "after" },
    { "id": "c4", "from": "manual", "to": "end",    "type": "message",  "phase": "before" },
    { "id": "c5", "from": "auto",   "to": "end",    "type": "message",  "phase": "after" }
  ]
}`;
