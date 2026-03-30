# Multi-Phase Process Transformation Plan

**Workflow ID**: `workflow-1774709469233-pxprft`
**Status**: Ready
**Estimated agents**: 15 (parallel swarm across 6 steps)

## Goal

Replace the binary before/after model with an N-phase progressive transformation model (inspired by archviz). Each sample starts with an inefficient process (Phase 0) and evolves through 3 improvement phases into a fully optimized process (Phase 3).

## CRITICAL: View Mode Removal

**before/split/after/overlay view modes are REMOVED ENTIRELY.** They are replaced by a single phase slider (0 to N). This is not optional — the old buttons are gone.

### Per-Phase Quality Requirements
Each phase MUST be a **standalone valid process diagram**:
- Every visible node has at least one visible connection (no orphans)
- Every visible connection has both endpoints visible (no floating arrows)
- Flow is complete: path from start to end exists at every phase
- No overlapping nodes at any phase
- All arrows are orthogonal at every phase
- A business stakeholder can read and understand the process at any single phase
- The QA screenshot audit runs per-phase (not just "all combined")

### What stays
- Phase slider (range input, 0 to N-1)
- Phase dots (clickable, archviz-style progress indicators)
- Diff toggle button (highlights what changed between current and previous phase)
- For non-phase diagrams (like decision-flow.json with 0 phases): render normally, no slider

### What goes
- Before button — REMOVED
- Split button — REMOVED
- After button — REMOVED
- Overlay button — REMOVED
- All code paths that reference `viewMode === 'before'` etc. in the multi-phase path

## Reference: ArchViz Phase Model

```json
// archviz uses a phases array + phase field on nodes/connections
{
  "phases": [
    { "id": "legacy",   "label": "0 — Legacy (Today)" },
    { "id": "mobile",   "label": "1 — Mobile Ordering" },
    { "id": "credits",  "label": "2 — Credits & Loyalty" },
    { "id": "analytics","label": "3 — Analytics & AI" }
  ],
  "nodes": [
    { "id": "cashier", "type": "user", "label": "Cashier", "phase": ["legacy", "mobile"] },
    { "id": "api-gw",  "type": "gateway", "label": "API Gateway", "phase": "mobile" }
  ],
  "connections": [
    { "from": "cashier", "to": "barista" },  // no phase = all phases
    { "from": "api-gw", "to": "order-svc", "phase": "mobile" }  // phase-specific
  ]
}
```

**Key behaviors:**
- No `phase` field = visible in ALL phases
- `"phase": "mobile"` = visible from Phase 1 onward
- `"phase": ["legacy", "mobile"]` = visible in Phases 0 and 1 only (removed in Phase 2)
- UI slider reveals phases progressively (Phase 0, then 0+1, then 0+1+2, etc.)
- Diff highlighting between adjacent phases (what's new, what's removed)

## Current Process-Graph Model

```json
{
  "phases": [
    { "id": "phase1", "label": "Digitise Forms" },
    { "id": "phase2", "label": "Auto Budget Check" }
  ],
  "nodes": [
    { "id": "b-fill-form", "phase": "before", "diff": "removed" },
    { "id": "a-portal",    "phase": "after",  "diff": "added" }
  ]
}
```

The `phases` array already exists but is only used for phase dots (filtering within the after version). The actual version control is binary: `"phase": "before"` or `"phase": "after"`.

## New Model (Target)

```json
{
  "phases": [
    { "id": "phase0", "label": "0 — Manual Baseline" },
    { "id": "phase1", "label": "1 — Digital Forms" },
    { "id": "phase2", "label": "2 — Auto Validation" },
    { "id": "phase3", "label": "3 — AI-Powered" }
  ],
  "nodes": [
    // Exists in ALL phases (the start event never changes)
    { "id": "start", "type": "start-event", "label": "Start", "lane": "requester", "x": 110 },

    // Exists only in Phase 0 (replaced in Phase 1)
    { "id": "paper-form", "type": "task", "label": "Fill Paper\nForm", "lane": "requester", "x": 230, "phase": ["phase0"] },

    // Introduced in Phase 1, persists through Phase 3
    { "id": "portal", "type": "task", "label": "Submit via\nPortal", "lane": "requester", "x": 230, "phase": "phase1" },

    // Introduced in Phase 2, persists through Phase 3
    { "id": "auto-check", "type": "subprocess", "label": "Auto Budget\nCheck", "lane": "system", "x": 380, "phase": "phase2" },

    // Introduced in Phase 3 only
    { "id": "ai-router", "type": "agent", "label": "Smart\nRouting Agent", "lane": "system", "x": 530, "phase": "phase3" }
  ],
  "connections": [
    // Always present
    { "id": "c1", "from": "start", "to": "paper-form", "phase": ["phase0"] },
    { "id": "c2", "from": "start", "to": "portal", "phase": "phase1" },
    { "id": "c3", "from": "portal", "to": "auto-check", "phase": "phase2" },
    { "id": "c4", "from": "auto-check", "to": "ai-router", "phase": "phase3" }
  ]
}
```

**Phase semantics:**
- No `phase` → visible in ALL phases (unchanged infrastructure)
- `"phase": "phase1"` → introduced in Phase 1, visible in Phase 1, 2, 3 (persists)
- `"phase": ["phase0"]` → visible ONLY in Phase 0 (removed after Phase 0)
- `"phase": ["phase0", "phase1"]` → visible in Phases 0 and 1 (removed in Phase 2)

## Implementation Steps

### Step 1: Research ArchViz (1 agent)
- Read archviz rendering code to understand phase filtering
- Document how the slider UI works
- Identify reusable patterns

### Step 2: Design Phase Schema (1 agent)
- Define exact JSON schema (above is the draft)
- Design backward compatibility: if `"phase": "before"` is encountered, map to `["phase0"]`; if `"phase": "after"`, map to `"phase1"`
- Define diff rules: when viewing Phase N, nodes introduced in Phase N are "added" (green), nodes present in Phase N-1 but not N are "removed" (red)
- Update json-spec

### Step 3: Implement Core (3 parallel agents)

#### Agent 3a: Schema Migrator (js/data.js, js/state.js)
- Modify `isVisible(item, viewMode, selectedPhase)` → `isVisible(item, activePhases)`
- `activePhases` = all phases up to the slider position (cumulative)
- When slider is at Phase 2: `activePhases = ["phase0", "phase1", "phase2"]`
- A node with `"phase": "phase1"` is visible if `"phase1" ∈ activePhases`
- A node with `"phase": ["phase0"]` is visible if `"phase0" ∈ activePhases` AND `"phase1" ∉ activePhases` (it was removed in phase1)
- Actually simpler: `"phase": ["phase0"]` means ONLY in phase0. Check if ALL of the node's phases are in activePhases, AND the node's phase array doesn't include phases AFTER the current slider position...
- **Simplest model (matching archviz)**:
  - `"phase": "phaseN"` means "introduced in phase N" → visible when slider ≥ N
  - `"phase": ["phase0", "phase1"]` means "visible only in phases 0 and 1" → visible when slider is 0 or 1, hidden when slider ≥ 2
  - No phase = always visible

#### Agent 3b: UI Builder (index.html)
- Replace before/split/after/overlay buttons with phase slider
- Slider range: 0 to N (where N = phases.length - 1)
- Show phase label next to slider
- Keep "All" button that shows everything (like current overlay)
- Phase dots below slider for quick jumping
- Optional: "Diff" toggle that highlights what changed between current phase and previous

#### Agent 3c: Renderer Updater (js/main.js, js/routing.js)
- Update `renderNodes()` to filter by active phases
- Update `renderConnections()` to filter by active phases
- Diff highlighting: when "Diff" toggle is on:
  - Nodes introduced in current phase → `diff-added` class (green border)
  - Nodes that will be removed in next phase → `diff-removed` class (red border)
  - Connections same logic
- Update routing to only consider visible nodes for obstacle avoidance

### Step 4: Rewrite 7 Samples (7 parallel agents)

Each sample gets a 4-phase transformation story:

| Sample | Phase 0 (Baseline) | Phase 1 | Phase 2 | Phase 3 (Target) |
|--------|-------------------|---------|---------|-------------------|
| **order-approval** | Paper forms, manual routing, walk to manager | Digital portal, email notifications | Auto budget check, rule-based routing | AI agent: smart routing, anomaly detection |
| **ticket-triage** | Email inbox, manual assignment, no SLA | Web portal, basic categorization | Auto-classification, SLA timers | AI agent: intent analysis, predictive routing |
| **onboarding** | Paper HR packet, manual IT setup | Digital forms, email-based provisioning | Auto-provisioning, checklist system | AI agent: personalized onboarding, proactive setup |
| **incident-response** | Manual paging, phone tree | Automated alerting, PagerDuty | Severity auto-classification, runbook links | AI war room: auto-diagnosis, post-mortem generation |
| **expense-claim** | Paper receipts, manager sign-off | Mobile photo capture, digital forms | OCR extraction, policy auto-check | AI agent: real-time policy enforcement, fraud detection |
| **manufacturing** | Manual inventory, paper QC | Inventory management system | Assembly line automation, digital QC | AI agents: procurement, QA automation, predictive maintenance |
| **lean-six-sigma** | Manual defect tracking | Data collection systems | Statistical process control (SPC) | AI poka-yoke: real-time defect prevention |

**JSON structure per sample:**
- 4 phases defined in `phases` array
- Nodes from Phase 0 that persist get no `phase` field
- Nodes removed in Phase 1 get `"phase": ["phase0"]`
- Nodes introduced in Phase 1 get `"phase": "phase1"`
- Each node has `x`, `y`/`lane`, and the usual attributes
- Connections follow same phase logic
- `spec` section describes each phase's rationale
- `metrics` section shows improvement per phase

### Step 5: Update Tests (1 agent)
- Update helpers.js `setViewMode` → `setPhase`
- Update QA screenshot audit to test each phase
- Update view-mode tests for slider navigation
- Update diff tests for phase-based highlighting
- Add test: slider at Phase 0 shows only baseline nodes
- Add test: slider at Phase 3 shows full optimized process
- Add test: diff mode highlights Phase N additions

### Step 6: QA Loop
- Run the existing qa-closed-loop workflow on the new phase-based diagrams
- Capture screenshots for each phase × each sample
- Fix any routing/layout issues
- Confirm all phases render correctly

## Execution Plan

```
STEP 1 (research)     ─────┐
                            ▼
STEP 2 (schema design) ────┐
                            ▼
STEP 3 (3 agents)     ─────┤ ← parallel: schema + UI + renderer
                            ▼
STEP 4 (7 agents)     ─────┤ ← parallel: 7 sample rewrites
                            ▼
STEP 5 (test updates)  ────┤
                            ▼
STEP 6 (QA loop)       ────┘ ← iterate until clean
```

**Total agents**: ~15 (1 + 1 + 3 + 7 + 1 + QA agents)
**Estimated iterations**: 3-5 QA loops for the new phase model

## Backward Compatibility

The migration must be backward-compatible:
- If a JSON has `"phase": "before"` → treat as `"phase": ["phase0"]`
- If a JSON has `"phase": "after"` → treat as `"phase1"` (introduced in phase 1)
- If a JSON has no `phases` array → create default `[{id:"phase0",label:"Before"},{id:"phase1",label:"After"}]`
- This way, existing JSONs work without modification during development

## Files to Create/Modify

### New files
- `plans/multi-phase-transformation.md` (this file)

### Modified files
- `index.html` — phase slider UI
- `js/data.js` — phase filtering logic
- `js/state.js` — phase slider state
- `js/main.js` — renderer phase support
- `js/routing.js` — visibility filtering
- `css/core.css` / `css/diagram.css` — phase slider styles
- `sample/*.json` — all 7 samples rewritten
- `testing/tests/*.spec.js` — test updates
- `testing/tests/helpers.js` — new phase helpers
- `testing/tests/qa-screenshot-audit.spec.js` — phase-aware QA
