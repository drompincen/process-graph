#!/usr/bin/env node
/**
 * qa-analyze.js — Reads qa-png/qa-report.json and generates:
 *   1. Multi-chapter fix plan → plans/qa-chapters/
 *   2. JSON patch suggestions for sample files that need coordinate adjustments
 *   3. Summary of what's clean vs what needs work
 *
 * Usage: node scripts/qa-analyze.js [--iteration N]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const REPORT_PATH = path.join(ROOT, 'qa-png', 'qa-report.json');
const CHAPTERS_DIR = path.join(ROOT, 'plans', 'qa-chapters');
const SAMPLE_DIR = path.join(ROOT, 'sample');

// ─── Load report ─────────────────────────────────────────────────────────────

if (!fs.existsSync(REPORT_PATH)) {
  console.error('No qa-report.json found. Run the QA screenshot audit first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
const iteration = report.iteration || 1;

console.log(`\n═══ QA Analysis — Iteration ${iteration} ═══`);
console.log(`Report from: ${report.timestamp}`);
console.log(`Total checks: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed}\n`);

// ─── Categorize issues ──────────────────────────────────────────────────────

const bySample = {};
const byCategory = {};
const jsonFixes = {}; // sample → list of coordinate fixes needed

for (const result of report.results) {
  if (!bySample[result.sample]) bySample[result.sample] = [];
  bySample[result.sample].push(result);

  for (const issue of result.issues) {
    if (!byCategory[issue.category]) byCategory[issue.category] = [];
    byCategory[issue.category].push({ ...issue, sample: result.sample, mode: result.mode });

    // Track which samples need JSON coordinate fixes
    const needsJsonFix = [
      'node-overlap', 'node-crowding', 'lane-violation',
      'label-node-collision', 'arrow-through-node'
    ].includes(issue.category);

    if (needsJsonFix) {
      if (!jsonFixes[result.sample]) jsonFixes[result.sample] = [];
      jsonFixes[result.sample].push({
        category: issue.category,
        detail: issue.detail,
        fix: issue.fix,
        nodes: issue.nodes || (issue.nodeId ? [issue.nodeId] : []),
        mode: result.mode,
      });
    }
  }
}

// ─── Generate chapters ──────────────────────────────────────────────────────

fs.mkdirSync(CHAPTERS_DIR, { recursive: true });

// Chapter 1: Arrow Routing Fixes
const arrowIssues = [
  ...(byCategory['diagonal-arrow'] || []),
  ...(byCategory['arrow-through-node'] || []),
];

const ch1 = `# Chapter 1: Arrow Routing Fixes
## Iteration ${iteration}

### Diagonal Arrows (${(byCategory['diagonal-arrow'] || []).length} violations)
Arrows must be purely orthogonal (horizontal or vertical segments only).

${(byCategory['diagonal-arrow'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: Arrow \`${i.connId}\` (${i.from}→${i.to}) has ${i.detail.match(/\d+°/)?.[0] || 'diagonal'} segment
  - **Fix**: Routing algorithm must produce H/V segments only`
).join('\n') || '✓ No diagonal arrows found'}

### Arrows Through Nodes (${(byCategory['arrow-through-node'] || []).length} violations)
No arrow may pass through a non-endpoint node.

${(byCategory['arrow-through-node'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: Arrow \`${i.connId}\` passes through \`${i.intersectedNode}\`
  - **Fix**: Reroute around node OR move node in JSON to create clearance`
).join('\n') || '✓ No arrow-through-node violations'}

### Parallelism
- Diagonal arrow fixes: modify \`js/routing.js\` (single file, all fixes in parallel)
- Arrow-through-node: split between routing.js fixes and JSON coordinate adjustments (parallel tracks)
`;

// Chapter 2: Node Overlap & Spacing Fixes
const ch2 = `# Chapter 2: Node Overlap & Spacing Fixes
## Iteration ${iteration}

### Node Overlaps (${(byCategory['node-overlap'] || []).length} violations)
No two nodes may visually collide.

${(byCategory['node-overlap'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: ${i.detail}
  - **Fix**: ${i.fix}`
).join('\n') || '✓ No node overlaps found'}

### Node Crowding (${(byCategory['node-crowding'] || []).length} violations)
Nodes must maintain minimum spacing for readability.

${(byCategory['node-crowding'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: ${i.detail}
  - **Fix**: ${i.fix}`
).join('\n') || '✓ No crowding issues'}

### Parallelism
- Each sample JSON can be fixed independently (8 files, fully parallel)
- Layout algorithm fixes in js/layout.js can proceed in parallel with JSON fixes
`;

// Chapter 3: Label Placement Fixes
const ch3 = `# Chapter 3: Label Placement Fixes
## Iteration ${iteration}

### Labels Colliding With Nodes (${(byCategory['label-node-collision'] || []).length} violations)
Labels must never overlap node shapes.

${(byCategory['label-node-collision'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: ${i.detail}
  - **Fix**: ${i.fix}`
).join('\n') || '✓ No label-node collisions'}

### Detached Labels (${(byCategory['label-detached'] || []).length} violations)
Connection labels must be anchored near their path.

${(byCategory['label-detached'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: ${i.detail}
  - **Fix**: ${i.fix}`
).join('\n') || '✓ No detached labels'}

### Parallelism
- Label anchor logic: single fix in js/routing.js (label positioning section)
- Label-node collision avoidance: may also need JSON node spacing adjustments (parallel with Ch2)
`;

// Chapter 4: Swimlane Compliance
const ch4 = `# Chapter 4: Swimlane Compliance
## Iteration ${iteration}

### Lane Violations (${(byCategory['lane-violation'] || []).length} violations)
Every node must be fully contained within its assigned swimlane.

${(byCategory['lane-violation'] || []).map(i =>
  `- **${i.sample}** [${i.mode}]: ${i.detail}
  - **Fix**: ${i.fix}`
).join('\n') || '✓ All nodes within lanes'}

### Parallelism
- Lane height increases: edit each sample JSON independently (parallel)
- Layout engine lane-fit logic: js/layout.js (single file fix)
`;

// Chapter 5: JSON Sample Coordinate Adjustments
const ch5Lines = [];
for (const [sample, fixes] of Object.entries(jsonFixes)) {
  // Deduplicate by node
  const nodeSet = new Set();
  const uniqueFixes = [];
  for (const f of fixes) {
    const key = f.nodes.join(',') + f.category;
    if (!nodeSet.has(key)) {
      nodeSet.add(key);
      uniqueFixes.push(f);
    }
  }
  ch5Lines.push(`### ${sample}
${uniqueFixes.map(f => `- [${f.category}] ${f.detail}
  - Affected nodes: \`${f.nodes.join('`, `')}\`
  - Action: ${f.fix}`).join('\n')}
`);
}

const ch5 = `# Chapter 5: JSON Sample Coordinate Adjustments
## Iteration ${iteration}

These are the specific JSON sample files that need node position / lane height changes.
**Each file can be edited independently — maximum parallelism.**

${ch5Lines.length > 0 ? ch5Lines.join('\n') : '✓ No JSON adjustments needed — all samples are geometrically clean'}

### Adjustment Strategy
1. For overlapping nodes: increase \`x\` spacing by at least the overlap amount + 30px buffer
2. For crowded nodes: increase \`x\` gap to ≥ 40px
3. For lane spills: increase lane \`height\` by spill amount + 20px buffer
4. For label collisions: increase spacing between source and target nodes by 60px
5. After JSON edits, re-run the QA loop to verify fixes
`;

// Chapter 6: Execution Summary & Next Iteration
const cleanSamples = Object.entries(bySample)
  .filter(([_, results]) => results.every(r => r.passed))
  .map(([s]) => s);

const dirtySamples = Object.entries(bySample)
  .filter(([_, results]) => results.some(r => !r.passed))
  .map(([s]) => s);

const ch6 = `# Chapter 6: Execution Summary & Loop Status
## Iteration ${iteration}

### Clean Samples (${cleanSamples.length}/${Object.keys(bySample).length})
${cleanSamples.map(s => `- ✓ ${s}`).join('\n') || '- (none yet)'}

### Samples Needing Fixes (${dirtySamples.length}/${Object.keys(bySample).length})
${dirtySamples.map(s => {
  const issues = bySample[s].reduce((acc, r) => acc + r.issues.length, 0);
  return `- ✗ ${s} — ${issues} issue(s)`;
}).join('\n') || '- (none — all clean!)'}

### Issue Breakdown by Category
| Category | Count | Severity |
|----------|-------|----------|
${Object.entries(byCategory).map(([cat, items]) => {
  const sev = items[0]?.severity || 'unknown';
  return `| ${cat} | ${items.length} | ${sev} |`;
}).join('\n') || '| (none) | 0 | — |'}

### Parallel Execution Plan
\`\`\`
Track A (Code Fixes):          Track B (JSON Fixes):
├─ js/routing.js               ├─ sample/order-approval.json
│  ├─ diagonal arrow fix       ├─ sample/ticket-triage.json
│  ├─ label anchor fix         ├─ sample/onboarding.json
│  └─ node avoidance routing   ├─ sample/incident-response.json
├─ js/layout.js                ├─ sample/expense-claim.json
│  ├─ lane containment         ├─ sample/manufacturing-fulfillment.json
│  └─ spacing enforcement      ├─ sample/lean-six-sigma.json
└─ (done)                      └─ sample/decision-flow.json
                                   (all 8 in parallel)
\`\`\`

### Next Step
${report.summary.failed === 0
  ? '🎉 ALL CHECKS PASS — Loop complete. All PNGs moved to qa-png/fixed/.'
  : `Run iteration ${iteration + 1}: fix the issues above, then re-run the QA loop.`}
`;

// (SAMPLES_COUNT inlined as Object.keys(bySample).length above)

// Write all chapters
const chapters = [
  ['ch1-arrow-routing.md', ch1],
  ['ch2-node-overlaps.md', ch2],
  ['ch3-label-placement.md', ch3],
  ['ch4-swimlane-compliance.md', ch4],
  ['ch5-json-adjustments.md', ch5],
  ['ch6-summary.md', ch6],
];

for (const [filename, content] of chapters) {
  fs.writeFileSync(path.join(CHAPTERS_DIR, filename), content);
}

// Write JSON fix manifest (machine-readable)
const manifestPath = path.join(CHAPTERS_DIR, 'json-fix-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(jsonFixes, null, 2));

console.log(`\nChapters written to ${CHAPTERS_DIR}/`);
chapters.forEach(([f]) => console.log(`  - ${f}`));
console.log(`\nJSON fix manifest: ${manifestPath}`);

if (Object.keys(jsonFixes).length > 0) {
  console.log(`\n⚠ ${Object.keys(jsonFixes).length} sample(s) need JSON coordinate adjustments:`);
  for (const [sample, fixes] of Object.entries(jsonFixes)) {
    console.log(`  ${sample}: ${fixes.length} fix(es)`);
  }
}

if (report.summary.failed === 0) {
  console.log('\n✅ ALL CHECKS PASS — no further iterations needed.');
  process.exit(0);
} else {
  console.log(`\n❌ ${report.summary.failed} diagram(s) have issues — fix and re-run.`);
  process.exit(1);
}
