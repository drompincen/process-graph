# CH6 — Spring Boot + JBang Backend

> Single-file JBang app (modelled on ArchViz.java). Serves the static frontend +
> one API endpoint that lists the `sample/` JSON files for the diagram dropdown.
> No database, no in-memory store — pure static serving.

## Tasks

| ID  | Task | Owner | Status | Blocked by |
|-----|------|-------|--------|------------|
| T27 | `ProcessGraph.java` — JBang scaffold + static serving | G1 | ⬜ Pending | — |
| T28 | `GET /api/diagrams` — scan `sample/*.json`, return `{ file, label }[]` | G1 | ⬜ Pending | T27 |
| T29 | `run.sh` / `run.ps1` + README launch section | G2 | ⬜ Pending | T27 |

---

## T27 — ProcessGraph.java

**File:** `ProcessGraph.java` at project root
**Pattern:** Identical JBang header to `ArchViz.java`

```java
///usr/bin/env jbang "$0" "$@" ; exit $?
//JAVA 17+
//COMPILE_OPTIONS -parameters
//DEPS org.springframework.boot:spring-boot-starter-web:3.3.1

package io.github.drompincen.processgraph;

import ...

@SpringBootApplication
@RestController
public class ProcessGraph {

    public static void main(String[] args) {
        // Serve everything from project root so index.html, css/, js/, sample/ all work
        System.setProperty("spring.web.resources.static-locations", "file:./");
        SpringApplication.run(ProcessGraph.class, args);
    }

    @EventListener
    public void onServerStarted(ServletWebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        log.info("Process Graph ready → http://localhost:{}/index.html", port);
    }
}
```

**Static serving:** `file:./` means Spring Boot serves everything in the project directory.
- `http://localhost:8080/` → `index.html`
- `http://localhost:8080/css/core.css` → `css/core.css`
- `http://localhost:8080/js/renderer.js` → `js/renderer.js`
- `http://localhost:8080/sample/order-approval.json` → `sample/order-approval.json`

ES module `import` in the browser fetches JS files directly — no bundling needed.

---

## T28 — GET /api/diagrams

The only API endpoint. Scans `sample/*.json`, reads `title` from each file, returns:

```json
[
  { "file": "order-approval.json",  "label": "Purchase Approval Process" },
  { "file": "ticket-triage.json",   "label": "IT Ticket Triage Process" },
  { "file": "onboarding.json",      "label": "Employee Onboarding Process" }
]
```

This is **exactly** what `main.js discoverDiagrams()` already expects — no frontend changes needed.

```java
@GetMapping("/api/diagrams")
public List<Map<String, String>> listDiagrams() throws IOException {
    List<Map<String, String>> result = new ArrayList<>();
    var resolver = new PathMatchingResourcePatternResolver();
    Resource[] resources = resolver.getResources("file:./sample/*.json");
    ObjectMapper mapper = new ObjectMapper();
    for (Resource r : resources) {
        try (var is = r.getInputStream()) {
            JsonNode root = mapper.readTree(is);
            String title = root.path("title").asText(r.getFilename());
            result.add(Map.of(
                "file",  r.getFilename(),
                "label", title
            ));
        } catch (IOException ignored) {}
    }
    return result;
}
```

---

## T29 — Launch scripts

### `run.sh`
```bash
#!/usr/bin/env bash
# Start Process Graph — requires JBang (https://jbang.dev) and Java 17+
cd "$(dirname "$0")"
jbang ProcessGraph.java
```

### `run.ps1`
```powershell
# Start Process Graph — requires JBang (https://jbang.dev) and Java 17+
Set-Location $PSScriptRoot
jbang ProcessGraph.java
```

### README section
```
## Running

Prerequisites: Java 17+ and [JBang](https://jbang.dev)

    ./run.sh          # Linux / macOS
    ./run.ps1         # Windows PowerShell

App opens at: http://localhost:8080
```

---

## Parallel Execution

- G1 does T27 then T28 (same file, sequential)
- G2 does T29 (scripts only, can run once T27 exists)
