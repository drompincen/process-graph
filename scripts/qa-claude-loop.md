# Claude QA Closed-Loop Protocol

## How to invoke
Tell Claude: "Run the QA loop" or "Execute qa-claude-loop"

## Workflow ID
`qa-closed-loop` (workflow-1774669312512-kk8lxb)

## Quick Start (One Command)
```bash
./scripts/qa-orchestrate.sh --iteration 1 --max 5
```
Then Claude takes over for visual inspection + multi-agent fixes.

## Loop Protocol (Claude executes this)

### Phase 1 + 2: CAPTURE + ANALYZE (automated via orchestrator)
```bash
cd /mnt/c/Users/drom/IdeaProjects/process-graph
./scripts/qa-orchestrate.sh --iteration N
```
This runs Playwright screenshot audit → qa-png/ + qa-report.json, then generates
6-chapter fix plan → plans/qa-chapters/.

### Phase 3: VISUAL INSPECTION (MANDATORY — NEVER SKIP)
**This phase is non-negotiable. Automated checks catch geometry but miss rendering bugs.**

For EVERY sample (not just failing ones), READ at least one PNG per sample:
1. Read `qa-png/fixed/<sample>--before.png` (or from `qa-png/` root if not in fixed)
2. Read `qa-png/fixed/<sample>--after.png`

Apply the FULL QA skill checklist visually:

**Geometry & Rendering:**
- [ ] Arrowheads are attached to arrow lines (no floating/detached arrowheads)
- [ ] Arrows connect at the CENTER of the box edge (not off-center, not at corners)
- [ ] Arrows connect perpendicular to node edges (no diagonal approach)
- [ ] No arrows going off-canvas or into empty space with large U-detours
- [ ] No arrows passing BEHIND or THROUGH boxes they don't connect to
- [ ] Decision branches (Yes/No) visually diverge from the gateway at distinct ports
- [ ] Labels are readable and not overlapping nodes
- [ ] No nodes overlap or clip each other
- [ ] Nodes are fully inside their swimlanes
- [ ] Arrow crossings are minimized

**Clarity & Common Sense:**
- [ ] Layout flows left-to-right logically — no backwards jumps without clear reason
- [ ] Node spacing is proportionate and consistent (no huge gaps next to tight clusters)
- [ ] A business stakeholder could read the diagram and understand the process flow
- [ ] Swimlane assignments make sense (e.g., system tasks in System lane, not Employee lane)
- [ ] Decision gateway labels are clear questions (e.g., "Approved?" not just "Gateway")
- [ ] Start has no incoming arrows, End has no outgoing arrows
- [ ] Every path from Start reaches an End event (no dead ends or orphan nodes)
- [ ] Cross-lane handoffs are intentional and represent real handoffs between roles

**JSON Placement (check BEFORE making code changes):**
- [ ] If arrows look wrong, first check if adjusting node x/y in the JSON would fix it
- [ ] Aligning source and target x-values produces clean vertical arrows (no elbows needed)
- [ ] Aligning source and target y-values (same lane) produces clean horizontal arrows
- [ ] Moving nodes is cheaper and safer than changing routing code
- [ ] Only change routing code if the issue is systemic (affects ALL diagrams, not just one)

**If ANY visual defect is found:**
- Document it explicitly: "VISUAL DEFECT: [description] in [filename]"
- Do NOT declare the iteration clean
- Proceed to Phase 4 with the visual defect added to the fix list

**If automated checks pass but visual inspection fails:**
- The iteration is FAILED, not passed
- Automated pass + visual fail = FAILED

### Phase 4: READ REPORT + FIX
1. Read `qa-png/qa-report.json`
2. Read `plans/qa-chapters/json-fix-manifest.json`
3. Combine automated issues AND visual defects from Phase 3
4. For each failing sample:
   a. Read the sample JSON
   b. Identify overlapping/crowded nodes from the manifest
   c. Adjust `x` coordinates to add spacing (overlap amount + 40px buffer)
   d. Increase lane `height` if nodes spill outside
   e. Write updated JSON
5. For code-level issues (diagonal arrows, arrow-through-node):
   a. Read `js/routing.js` and `js/layout.js`
   b. Apply routing fixes
   c. **VERIFY the fix doesn't break arrowhead rendering** — arrowheads must
      stay connected to the arrow path (9px offset pattern must be preserved)
6. **IMPORTANT**: When adjusting JSON, move ALL affected nodes and downstream
   nodes to maintain flow order. Don't just move one node — shift everything
   after it to prevent cascading overlaps.

### Phase 5: RE-CAPTURE
Go back to Phase 1 with QA_ITERATION incremented.

### Phase 6: VISUAL CONFIRMATION + FINAL SIGN-OFF
This phase only runs when automated checks pass (28/28 CLEAN).

1. **Take confirmation screenshots** — re-run the capture to get fresh PNGs
2. **READ every PNG** — inspect all 7 samples × at least before + after modes
3. **Apply the full visual checklist** from Phase 3
4. **If visual passes:**
   - Copy all PNGs from `qa-png/fixed/` to `qa-png/confirmed/`
   - These confirmed PNGs are the final proof that the diagrams are correct
   - Declare the loop COMPLETE
5. **If visual fails:**
   - Do NOT copy to confirmed/
   - Document the defect and go back to Phase 4
   - NEVER declare success without having READ and INSPECTED the actual PNG images

### Folder Structure
```
qa-png/
├── *.png              ← Current iteration screenshots (working area)
├── qa-report.json     ← Automated check results
├── fixed/             ← PNGs that passed automated checks (moved, not copied)
└── confirmed/         ← PNGs that passed BOTH automated + visual inspection
                         (final proof — only populated after Phase 6 sign-off)
```

**The `confirmed/` folder is the single source of truth.** If it's empty, the QA
loop hasn't completed successfully. If it has 28 PNGs, all diagrams are verified
clean by both automated checks AND human/Claude visual inspection.

### Clean PNG Management
- Phase 1: Screenshots go to `qa-png/` root
- Automated pass: PNGs moved from root to `qa-png/fixed/`
- Visual pass (Phase 6): PNGs copied from `fixed/` to `qa-png/confirmed/`
- Final state: 28 PNGs in `qa-png/confirmed/` (7 samples × 4 modes)

### JSON Fix Rules
- Overlap fix: increase `x` of rightmost overlapping node by `overlapX + 40`
- Crowding fix: increase `x` gap to at least 40px
- Lane spill fix: increase lane `height` by `spillAmount + 20`
- Label collision fix: increase spacing between connected nodes by 60px
- ALWAYS cascade: if you move node X rightward, move all nodes with `x > X.x` by the same amount

### Code Fix Safety Rules
- NEVER remove the 9px arrowhead offset from path endpoints
- Path lines must stop 9px short of the target node so the arrowhead triangle
  fills the gap between the line end and the node edge
- After ANY routing code change, visually inspect arrowheads in the PNGs
- If arrowheads appear detached or floating, the 9px offset was broken
