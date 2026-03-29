#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# qa-orchestrate.sh — Master orchestration for the Claude QA closed loop
#
# This script is the ENTRY POINT for the fully automated QA pipeline.
# It handles the mechanical steps; Claude handles visual inspection + fixes.
#
# Usage:
#   ./scripts/qa-orchestrate.sh [--iteration N] [--max N] [--phase PHASE]
#
# Phases (can be run individually or as full loop):
#   capture    — Run Playwright screenshot audit → qa-png/ + qa-report.json
#   analyze    — Generate 6-chapter fix plan → plans/qa-chapters/
#   report     — Print summary of current state (no side effects)
#   all        — Run capture + analyze + report (default)
#
# After this script runs, Claude takes over for:
#   - Visual PNG inspection (multimodal — reads the actual images)
#   - Multi-agent fix planning and execution
#   - Re-invoking this script for the next iteration
#
# The closed loop:
#   ┌──────────────────────────────────────────────────────────────┐
#   │  qa-orchestrate.sh (capture + analyze)                      │
#   │       ↓                                                     │
#   │  Claude reads PNGs (visual inspection)                      │
#   │       ↓                                                     │
#   │  Claude spawns fix agents (coder × N, tester × 1)          │
#   │       ↓                                                     │
#   │  qa-orchestrate.sh --iteration N+1 (re-capture + analyze)   │
#   │       ↓                                                     │
#   │  Claude reads PNGs → all clean? → EXIT                      │
#   │                       not clean? → loop back ↑              │
#   └──────────────────────────────────────────────────────────────┘
#
# Environment:
#   PG_BASE_URL  — app URL (default: http://localhost:8080)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TESTING_DIR="$ROOT/testing"
QA_DIR="$ROOT/qa-png"
FIXED_DIR="$QA_DIR/fixed"
CONFIRMED_DIR="$QA_DIR/confirmed"
CHAPTERS_DIR="$ROOT/plans/qa-chapters"

# ─── Parse arguments ─────────────────────────────────────────────────────────

ITERATION=1
MAX_ITERATIONS=5
PHASE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iteration) ITERATION="$2"; shift 2 ;;
    --max)       MAX_ITERATIONS="$2"; shift 2 ;;
    --phase)     PHASE="$2"; shift 2 ;;
    *)           echo "Unknown arg: $1"; exit 1 ;;
  esac
done

BASE_URL="${PG_BASE_URL:-http://localhost:8080}"

# ─── Helpers ─────────────────────────────────────────────────────────────────

log() { echo "│ $*"; }
header() {
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  $*"
  echo "╚══════════════════════════════════════════════════════════════╝"
}

# ─── Pre-flight ──────────────────────────────────────────────────────────────

preflight() {
  echo ""
  header "QA CLOSED LOOP — Iteration $ITERATION / $MAX_ITERATIONS"
  echo ""

  # Check app is running
  if ! curl -s --max-time 3 "$BASE_URL" > /dev/null 2>&1; then
    log "ERROR: App not reachable at $BASE_URL"
    log "Start it with: cd $ROOT && jbang ProcessGraph.java"
    exit 2
  fi
  log "✓ App reachable at $BASE_URL"

  # Ensure Playwright
  if [ ! -d "$TESTING_DIR/node_modules" ]; then
    log "Installing Playwright dependencies..."
    cd "$TESTING_DIR" && npm install
  fi
  log "✓ Playwright ready"

  # Ensure directories
  mkdir -p "$QA_DIR" "$FIXED_DIR" "$CONFIRMED_DIR" "$CHAPTERS_DIR"
  log "✓ Directories ready"
  echo ""
}

# ─── Phase: CAPTURE ──────────────────────────────────────────────────────────

phase_capture() {
  header "PHASE 1: CAPTURE (Playwright screenshot audit)"
  echo ""

  cd "$TESTING_DIR"

  QA_ITERATION="$ITERATION" PG_BASE_URL="$BASE_URL" npx playwright test \
    tests/qa-screenshot-audit.spec.js \
    --project=chromium \
    --reporter=list \
    --timeout=60000 \
    2>&1 || true

  echo ""

  # Count PNGs captured
  local png_count
  png_count=$(find "$QA_DIR" -maxdepth 1 -name "*.png" | wc -l)
  log "Captured $png_count PNG screenshots → $QA_DIR/"

  if [ -f "$QA_DIR/qa-report.json" ]; then
    log "Report written → $QA_DIR/qa-report.json"
  else
    log "WARNING: No qa-report.json generated"
  fi
  echo ""
}

# ─── Phase: ANALYZE ──────────────────────────────────────────────────────────

phase_analyze() {
  header "PHASE 2: ANALYZE (generate fix chapters)"
  echo ""

  cd "$ROOT"
  node --experimental-modules scripts/qa-analyze.js --iteration "$ITERATION" || true
  echo ""
}

# ─── Phase: REPORT ───────────────────────────────────────────────────────────

phase_report() {
  header "PHASE 3: REPORT"
  echo ""

  if [ ! -f "$QA_DIR/qa-report.json" ]; then
    log "No report found. Run capture first."
    return 1
  fi

  local total passed failed issues
  total=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$QA_DIR/qa-report.json','utf-8')).summary.total)")
  passed=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$QA_DIR/qa-report.json','utf-8')).summary.passed)")
  failed=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$QA_DIR/qa-report.json','utf-8')).summary.failed)")
  issues=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$QA_DIR/qa-report.json','utf-8')).summary.issues)")

  echo "┌──────────────────────────────────────┐"
  echo "│  ITERATION $ITERATION RESULTS              │"
  echo "├──────────────────────────────────────┤"
  echo "│  Total checks:  $total"
  echo "│  Passed:        $passed"
  echo "│  Failed:        $failed"
  echo "│  Total issues:  $issues"
  echo "└──────────────────────────────────────┘"
  echo ""

  if [ "$failed" -eq 0 ]; then
    log "✅ ALL AUTOMATED CHECKS PASS"
    log ""
    log "NEXT → Claude must now:"
    log "  1. READ every PNG in qa-png/ (visual inspection)"
    log "  2. If visual clean → copy to qa-png/confirmed/ → DONE"
    log "  3. If visual defects → spawn fix agents → re-run"
    echo ""
    return 0
  else
    log "❌ $failed diagram(s) have automated failures"
    log ""
    log "NEXT → Claude must now:"
    log "  1. READ PNGs for failing diagrams (visual inspection)"
    log "  2. READ plans/qa-chapters/ for fix plan"
    log "  3. READ plans/qa-chapters/json-fix-manifest.json"
    log "  4. Spawn parallel fix agents (coder + tester)"
    log "  5. Re-run: ./scripts/qa-orchestrate.sh --iteration $((ITERATION + 1))"
    echo ""
    return 1
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

preflight

case "$PHASE" in
  capture)  phase_capture ;;
  analyze)  phase_analyze ;;
  report)   phase_report ;;
  all)
    phase_capture
    phase_analyze
    phase_report
    ;;
  *)
    echo "Unknown phase: $PHASE (use: capture, analyze, report, all)"
    exit 1
    ;;
esac

# ─── Output for Claude to parse ─────────────────────────────────────────────

echo "═══ ORCHESTRATION COMPLETE ═══"
echo "ITERATION=$ITERATION"
echo "QA_DIR=$QA_DIR"
echo "CHAPTERS_DIR=$CHAPTERS_DIR"
echo "NEXT_ITERATION=$((ITERATION + 1))"

# List PNGs for Claude to read
echo ""
echo "═══ PNG FILES FOR VISUAL INSPECTION ═══"
if [ -d "$FIXED_DIR" ]; then
  find "$FIXED_DIR" -name "*.png" -type f 2>/dev/null | sort || true
fi
find "$QA_DIR" -maxdepth 1 -name "*.png" -type f 2>/dev/null | sort || true
