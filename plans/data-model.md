# Process-Graph — JSON Data Model

> Complete annotated schema for the process-graph JSON format.
> All agents read from this spec. Do not deviate without updating here.

---

## Root Object

```jsonc
{
  "title": "Purchase Approval Process",    // Display title
  "description": "...",                    // Optional subtitle / description
  "notes": "Process owner: Jane Smith\nLast reviewed: 2024-01",  // Notebook text (\n = newlines)

  "metrics": { ... },       // Before/after KPI baselines
  "lanes": [ ... ],         // Swimlane definitions (order = top-to-bottom)
  "nodes": [ ... ],         // All nodes for both before and after phases
  "connections": [ ... ],   // All edges (sequence + message flows)

  "phases": [ ... ],        // Optional: named improvement phases (for step-by-step rollout)
  "flows": [ ... ],         // Optional: named process paths (happy path, exception, escalation)
  "sequence": [ ... ],      // Optional: default animation sequence (steps)

  "story": { ... }          // Optional: AS-IS → TO-BE narrative
}
```

---

## `metrics` Object

```jsonc
{
  "metrics": {
    "before": {
      "stepCount": 6,
      "cycleTimeHours": 48,
      "handoffCount": 4,
      "errorRate": "~15%",
      "automationPct": 0,
      "costPerCase": 240
    },
    "after": {
      "stepCount": 3,
      "cycleTimeHours": 2,
      "handoffCount": 1,
      "errorRate": "~2%",
      "automationPct": 80,
      "costPerCase": 35
    }
  }
}
```

All fields are optional. Numeric fields get delta badges (▼50%). String fields are displayed as-is.

---

## `lanes` Array

```jsonc
{
  "lanes": [
    {
      "id": "requester",          // Unique lane identifier (referenced by nodes)
      "label": "Requester",       // Display label (shown rotated on left side)
      "color": "#1e3a5f",         // Lane accent color (used for gradient + label tint)
      "height": 120               // Optional: lane height in px (default: 120)
    },
    {
      "id": "manager",
      "label": "Manager",
      "color": "#1a3a2a",
      "height": 120
    },
    {
      "id": "finance",
      "label": "Finance",
      "color": "#3a1a3a",
      "height": 120
    },
    {
      "id": "system",
      "label": "System",
      "color": "#2a2a1a",
      "height": 120
    }
  ]
}
```

---

## `nodes` Array

```jsonc
{
  "nodes": [
    {
      // --- Identity ---
      "id": "start-requester",           // Unique ID (referenced by connections, sequence)
      "type": "start-event",             // Node type — see type table below
      "label": "Purchase\nRequest",      // Display label (\n = line break)

      // --- Layout ---
      "lane": "requester",               // Lane ID (determines y-band)
      "x": 120,                          // Absolute SVG x position (pixels from left)
      "laneY": 60,                       // Y offset WITHIN lane (from lane top, default: lane center)

      // --- Phase visibility ---
      "phase": "both",                   // "before" | "after" | "both" | ["phase1", "phase2"]

      // --- Diff state (auto-computed by diff.js, can be set manually) ---
      "diff": "added",                   // "added" | "removed" | "changed" | "unchanged" (optional override)

      // --- Process state ---
      "state": "bottleneck",             // "bottleneck" | "automated" | "manual" | "new" | null

      // --- Annotation (subprocess) ---
      "subprocess": true,                // Show subprocess [+] marker inside task rect

      // --- For decision nodes ---
      "defaultPath": "conn-id",          // Connection ID of the default outgoing path (shown with //)

      // --- Step badge from animation ---
      "stepBadges": []                   // Auto-managed by animation.js — do not set manually
    }
  ]
}
```

### Node Types

| `type` | SVG Shape | Description |
|---|---|---|
| `start-event` | `<circle r="12">` thin border | BPMN start event |
| `end-event` | `<circle r="14">` thick border + filled center | BPMN end event |
| `task` | `<rect rx="6">` rounded rectangle | Standard task |
| `subprocess` | `<rect rx="6">` + `[+]` marker at bottom | Collapsed subprocess |
| `gateway` | `<polygon>` diamond | Gateway / decision point |
| `annotation` | dashed `<rect>` + callout `<path>` pointer | Text annotation |
| `intermediate-event` | `<circle>` with double-ring | BPMN intermediate event |

### Node States → Visual Treatment

| `state` | Border color | Fill tint | Icon overlay |
|---|---|---|---|
| `bottleneck` | `#f59e0b` amber | amber 8% | ⚠ small badge |
| `automated` | `#3b82f6` blue | blue 8% | ⚡ small badge |
| `manual` | `#94a3b8` grey | none | none |
| `new` | `#22c55e` green | green 8% | NEW chip |
| null | lane default | none | none |

### Phase visibility rules

- `"phase": "before"` → only visible in Before view and split-view left side
- `"phase": "after"` → only visible in After view and split-view right side
- `"phase": "both"` → visible in all views
- `"phase": ["phase1", "phase2"]` → visible in those named improvement phases
- Diff engine: nodes present in before-only → `removed`; after-only → `added`; both → compare label → `changed` or `unchanged`

---

## `connections` Array

```jsonc
{
  "connections": [
    {
      "id": "c1",                    // Unique ID (optional but recommended)
      "from": "start-requester",     // Source node ID
      "to": "submit-form",           // Target node ID
      "phase": "both",               // Same phase rules as nodes

      // --- Connection type (affects routing style) ---
      "type": "sequence",            // "sequence" | "message" | "conditional" | "default"

      // --- Labels ---
      "label": "approved",           // Optional: label shown near arrowhead

      // --- Routing hints ---
      "route": "right",              // "right" | "left" | "down" | "up" | "auto" (default: auto)
      "offset": 20,                  // Optional: routing offset px for loop-backs (default: 24)

      // --- Decision gateway labels ---
      "decision": "yes"              // "yes" | "no" | null — shows YES/NO badge
    }
  ]
}
```

### Connection Types → Visual Treatment

| `type` | Stroke style | Color | Arrowhead |
|---|---|---|---|
| `sequence` | solid 1.8px | `#475569` | filled polygon |
| `message` | dashed 5,4 | `#60a5fa` | filled polygon |
| `conditional` | dashed 4,3 | `#f59e0b` | filled polygon |
| `default` | solid with // tick at source | `#475569` | filled polygon |

### Routing logic (handled by `routing.js`)

1. **Same-lane, same direction (left→right):** straight horizontal line
2. **Same-lane, loop-back (right→left):** U-path routing below the lane midpoint
3. **Cross-lane, downward:** exit node bottom → vertical → enter target top
4. **Cross-lane, upward:** exit node top → vertical up → horizontal → enter target bottom
5. **Cross-lane, elbow:** exit right → horizontal → vertical → horizontal → enter left
6. Auto-detects all cases from source/target `lane` and relative `x` positions

---

## `phases` Array (optional)

```jsonc
{
  "phases": [
    { "id": "phase1", "label": "Digitise Forms" },
    { "id": "phase2", "label": "Auto Budget Check" },
    { "id": "phase3", "label": "Smart Approval" }
  ]
}
```

When present: renders phase dot indicators in the header (same as archviz).
Each dot click filters nodes/connections to those tagged with that phase ID.

---

## `flows` Array (optional)

```jsonc
{
  "flows": [
    {
      "id": "happy-path",
      "name": "Happy Path",
      "sequence": [
        { "from": "start", "to": "submit", "text": "Employee submits request", "status": "ready" },
        { "from": "submit", "to": "auto-check", "text": "System validates budget", "status": "ready",
          "popup": { "type": "amplify", "msg": "Auto-validated in <2 seconds" } },
        { "from": "auto-check", "to": "mgr-review", "text": "Routed to manager", "status": "ready" },
        { "from": "mgr-review", "to": "approved", "text": "Manager approves", "status": "ready" }
      ]
    },
    {
      "id": "exception",
      "name": "Over-Budget Exception",
      "sequence": [
        { "from": "start", "to": "submit", "text": "Employee submits request" },
        { "from": "submit", "to": "auto-check", "text": "System flags over-budget",
          "popup": { "type": "alert", "msg": "Budget limit exceeded — escalating" } },
        { "from": "auto-check", "to": "finance-review", "text": "Escalated to Finance" },
        { "from": "finance-review", "to": "rejected", "text": "Finance rejects" }
      ]
    }
  ]
}
```

Rendered in the header as a dropdown: "-- Default -- | Happy Path | Over-Budget Exception"

---

## `sequence` Array (optional, default flow)

Same structure as `flows[n].sequence`. Used when no `flows` are defined or when "Default" is selected.

---

## `story` Object (optional, full narrative)

```jsonc
{
  "story": {
    "storyId": "purchase-approval-improvement",
    "version": 1,
    "createdAt": "2024-01-15",
    "createdBy": "process.owner@company.com",

    "problem": {
      "headline": "Purchase approvals take 2–3 days and have a 15% error rate",
      "description": "Finance manually checks every request against budget spreadsheets. <b>4 handoffs</b> per request create bottlenecks. Errors require rework and delay procurement.",
      "impactMetric": { "kpiId": "cycle-time", "value": 48, "unit": "hours" },
      "evidence": [
        { "label": "Q3 Process Audit", "url": "#", "addedAt": "2024-01-10", "addedBy": "jane@co.com" },
        { "label": "Employee Survey Results", "url": "#", "addedAt": "2024-01-12", "addedBy": "bob@co.com" }
      ],
      "scope": ["submit-form", "finance-check", "mgr-review"],
      "risks": ["Manual checks miss policy changes", "No audit trail", "Bottleneck at Finance team"]
    },

    "vision": {
      "summary": "Automated portal reduces approvals to under 2 hours",
      "description": "Replace paper form with <b>self-service portal</b>. Auto-validate budget in real-time. Manager review only when required by policy.",
      "kpiTargets": [
        { "kpiId": "cycle-time", "min": 1, "max": 2, "confidence": "high", "horizon": "Q2 2024" },
        { "kpiId": "error-rate", "min": 1, "max": 3, "confidence": "medium", "horizon": "Q3 2024" },
        { "kpiId": "handoffs", "min": 1, "max": 1, "confidence": "high", "horizon": "Q2 2024" }
      ],
      "acceptanceCriteria": [
        "Portal handles 100% of standard requests (<$10k)",
        "Auto-check responds in <3 seconds",
        "Full audit trail maintained in system"
      ]
    },

    "phases": [
      { "label": "Phase 1: Digitise", "phaseRef": "phase1", "description": "Replace paper form with web portal. No process change yet.", "duration": "4 weeks" },
      { "label": "Phase 2: Automate", "phaseRef": "phase2", "description": "Add auto budget validation. Remove Finance manual step.", "duration": "6 weeks" },
      { "label": "Phase 3: Optimise", "phaseRef": "phase3", "description": "Smart routing — skip manager for low-risk requests.", "duration": "4 weeks" }
    ],

    "ideaCards": [
      {
        "id": "ic1",
        "title": "Self-Service Portal",
        "phases": ["phase1"],
        "hypothesis": "Moving to a <b>web portal</b> eliminates data entry errors and removes the paper handoff step.",
        "expectedKpiImpacts": [
          { "kpiId": "handoffs", "delta": -1, "confidence": "high" },
          { "kpiId": "error-rate", "delta": -5, "confidence": "medium" }
        ]
      },
      {
        "id": "ic2",
        "title": "Auto Budget Check",
        "phases": ["phase2"],
        "hypothesis": "Real-time API call to Finance system replaces manual spreadsheet check — <b>removes Finance lane entirely</b>.",
        "expectedKpiImpacts": [
          { "kpiId": "cycle-time", "delta": -30, "confidence": "high" },
          { "kpiId": "handoffs", "delta": -2, "confidence": "high" },
          { "kpiId": "error-rate", "delta": -8, "confidence": "high" }
        ]
      },
      {
        "id": "ic3",
        "title": "Risk-Based Routing",
        "phases": ["phase3"],
        "hypothesis": "Auto-approve requests under policy threshold — <b>skip manager review</b> for 60% of cases.",
        "expectedKpiImpacts": [
          { "kpiId": "cycle-time", "delta": -15, "confidence": "medium" },
          { "kpiId": "handoffs", "delta": -1, "confidence": "medium" }
        ]
      }
    ],

    "kpis": [
      {
        "id": "cycle-time",
        "label": "Cycle Time",
        "unit": "hours",
        "direction": "lower_is_better",
        "baseline": 48,
        "current": 48,
        "format": "0"
      },
      {
        "id": "handoffs",
        "label": "Handoff Count",
        "unit": "",
        "direction": "lower_is_better",
        "baseline": 4,
        "current": 4,
        "format": "0"
      },
      {
        "id": "error-rate",
        "label": "Error Rate",
        "unit": "%",
        "direction": "lower_is_better",
        "baseline": 15,
        "current": 15,
        "format": "0.1f"
      }
    ],

    "benefits": [
      {
        "id": "b1",
        "title": "Faster Approvals",
        "phaseId": "phase2",
        "kpiId": "cycle-time",
        "baseline": 48,
        "targetRange": { "min": 1, "max": 2 },
        "boundNodes": ["auto-check", "submit-portal"],
        "realized": false
      },
      {
        "id": "b2",
        "title": "Fewer Errors",
        "phaseId": "phase2",
        "kpiId": "error-rate",
        "baseline": 15,
        "targetRange": { "min": 1, "max": 3 },
        "boundNodes": ["auto-check"],
        "realized": false
      }
    ],

    "uiHints": {
      "initialView": "narrative",
      "initialPhase": "phase1"
    }
  }
}
```

---

## Validation Rules (enforced by `data.js`)

1. `lanes` array required, minimum 1 lane
2. All node `lane` values must reference a valid lane `id`
3. All connection `from`/`to` values must reference a valid node `id`
4. Node `x` must be > label column width (default 90px)
5. Node `type` must be one of the 7 defined types
6. If `story` present: all `kpiId` references must resolve to a `story.kpis[n].id`
7. If `story` present: all `benefit.boundNodes` must reference valid node IDs
8. Phase references in `nodes`, `connections`, `flows` must match `phases[n].id` (warning, not error)
