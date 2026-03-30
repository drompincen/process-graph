# CH-T0 — Infrastructure & Backend
**Agent:** A (single, sequential)
**Blocks:** ALL other chapters
**Estimated duration:** 5–10 min (mostly JBang first-run download)

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| T1 | Install npm dependencies + Playwright browsers | ⬜ | One-time setup |
| T2 | Start JBang backend and verify port 8080 responds | ⬜ | Needs T1 |
| T3 | Run single smoke test to confirm full stack works | ⬜ | Needs T2 |

---

## T1 — Install npm dependencies + Playwright browsers

**Working directory:** `testing/`

```bash
npm install
npx playwright install --with-deps chromium firefox
```

**Done when:**
- `node_modules/@playwright/test` exists
- `npx playwright --version` prints a version string

**Status checklist:**
- [ ] `npm install` exited 0
- [ ] `npx playwright install --with-deps chromium` exited 0
- [ ] `npx playwright install --with-deps firefox` exited 0

**Progress reporting:**
```
[T1 ▶ 0:00] Starting npm install…
[T1 ▶ 0:30] npm install done. Installing Playwright browsers…
[T1 ✓ 1:30] Playwright browsers installed. T1 complete.
```

---

## T2 — Start JBang backend, verify port 8080

**Working directory:** project root (`../` from `testing/`)

**Start backend in background:**
```bash
jbang ProcessGraph.java &
PG_PID=$!
echo $PG_PID > /tmp/pg-backend.pid
```

**Wait for port 8080 (poll every 2s, timeout 60s):**
```bash
for i in $(seq 1 30); do
  curl -s http://localhost:8080/api/diagrams > /dev/null 2>&1 && break
  echo "[T2] Waiting for backend… attempt $i/30"
  sleep 2
done
```

**Verify API returns data:**
```bash
curl -s http://localhost:8080/api/diagrams | python3 -m json.tool
```

**Expected:** JSON array with at least 1 object containing `file` and `label`.

**Status checklist:**
- [ ] `jbang ProcessGraph.java` process started without error
- [ ] Port 8080 accepting TCP connections
- [ ] `GET /api/diagrams` returns HTTP 200
- [ ] Response body is a JSON array with ≥1 entry
- [ ] `GET /` returns HTTP 200 with `text/html`
- [ ] Sample files reachable: `GET /sample/order-approval.json` returns 200

**Progress reporting:**
```
[T2 ▶ 0:00] Starting JBang backend…
[T2 ▶ 0:15] JBang compiling Spring Boot (first run may take 2-3 min)…
[T2 ▶ 1:00] Port 8080 open. Verifying /api/diagrams…
[T2 ✓ 1:15] Backend healthy — 3 diagrams found. T2 complete.
```

**If backend fails to start:**
- Check `jbang --version` — must be ≥0.100
- Check `java -version` — must be ≥17
- Check port 8080 is not already in use: `lsof -i :8080`
- Inspect output for Spring Boot error messages

---

## T3 — Run smoke test to confirm full stack

**Working directory:** `testing/`

```bash
npx playwright test tests/01-smoke.spec.js --reporter=list
```

**Expected output:** 5 passed, 0 failed

**If any test fails:**
1. Run with `--headed` to see what's happening:
   ```bash
   npx playwright test tests/01-smoke.spec.js --headed --timeout=60000
   ```
2. Check `playwright-report/` for screenshots + traces
3. Common failures:
   - **`[data-node-id]` timeout** → JS module loading error → check browser console in trace
   - **`/api/diagrams` 404** → backend not serving from correct root → check `PROJECT_ROOT` in ProcessGraph.java logs
   - **`#json-selector` empty** → API returned empty array → check `sample/` directory exists

**Status checklist:**
- [ ] `J1-S1` PASS — SVG renders node groups
- [ ] `J1-S2` PASS — API returns diagrams array
- [ ] `J1-S3` PASS — selector has ≥1 option
- [ ] `J1-S4` PASS — switching diagrams re-renders
- [ ] `J1-S5` PASS — no uncaught JS errors

**Progress reporting:**
```
[T3 ▶ 0:00] Running 01-smoke.spec.js…
[T3 ▶ 0:20] J1-S1 PASS, J1-S2 PASS, J1-S3 PASS…
[T3 ✓ 0:35] All 5 smoke tests passed. CH-T0 complete. Unblocking CH-T1 through CH-T7.
```

---

## Outputs

- [ ] `node_modules/` populated in `testing/`
- [ ] Playwright browsers installed (chromium, firefox)
- [ ] JBang backend running on port 8080
- [ ] `/tmp/pg-backend.pid` written
- [ ] Smoke test 5/5 passed

## Chapter Complete When

All 3 tasks show ✅. Post to CHAPTERS.md: update CH-T0 status to ✅ Done and unblock CH-T1 through CH-T7.
