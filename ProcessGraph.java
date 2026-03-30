///usr/bin/env jbang "$0" "$@" ; exit $?
//JAVA 17+
//COMPILE_OPTIONS -parameters
//DEPS org.springframework.boot:spring-boot-starter-web:3.3.1

package io.github.drompincen.processgraph;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.context.ServletWebServerInitializedEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@SpringBootApplication
@RestController
public class ProcessGraph {

    private static final Logger log = LoggerFactory.getLogger(ProcessGraph.class);

    // Resolve project root at startup — the directory containing ProcessGraph.java
    private static final File PROJECT_ROOT = resolveProjectRoot();

    private static File resolveProjectRoot() {
        // JBang sets the script's parent directory; fall back to working directory
        String scriptDir = System.getProperty("jbang.script.dir");
        if (scriptDir != null) {
            File f = new File(scriptDir);
            if (f.exists()) return f;
        }
        // user.dir is wherever jbang was launched from
        return new File(System.getProperty("user.dir", ".")).getAbsoluteFile();
    }

    public static void main(String[] args) {
        // Use resolved absolute path — avoids ambiguity with file:./
        String staticPath = "file:" + PROJECT_ROOT.getAbsolutePath() + "/";
        log.info("Static root: {}", staticPath);
        System.setProperty("spring.web.resources.static-locations", staticPath);
        SpringApplication.run(ProcessGraph.class, args);
    }

    /** Serve project files as static resources at /** */
    @Bean
    public WebMvcConfigurer staticResourceConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addResourceHandlers(ResourceHandlerRegistry registry) {
                String base = "file:" + PROJECT_ROOT.getAbsolutePath() + "/";
                registry.addResourceHandler("/**").addResourceLocations(base);
            }
        };
    }

    /** Explicit redirect: GET / → index.html */
    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public org.springframework.http.ResponseEntity<Resource> root() {
        File index = new File(PROJECT_ROOT, "index.html");
        if (!index.exists()) {
            log.error("index.html not found at {}", index.getAbsolutePath());
            return org.springframework.http.ResponseEntity.notFound().build();
        }
        return org.springframework.http.ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(new FileSystemResource(index));
    }

    @EventListener
    public void onServerStarted(ServletWebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        log.info("===========================================================");
        log.info("  Process Graph is ready!");
        log.info("  App:   http://localhost:{}/", port);
        log.info("  API:   http://localhost:{}/api/diagrams", port);
        log.info("  Root:  {}", PROJECT_ROOT.getAbsolutePath());
        log.info("===========================================================");
    }

    @Bean
    public OncePerRequestFilter accessLogFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest req,
                                            HttpServletResponse res,
                                            FilterChain chain)
                    throws ServletException, IOException {
                long start = System.currentTimeMillis();
                chain.doFilter(req, res);
                long ms = System.currentTimeMillis() - start;
                String path = req.getRequestURI();
                if (path.endsWith(".html") || path.startsWith("/api/")) {
                    log.info("{} {} → {} ({}ms)", req.getMethod(), path, res.getStatus(), ms);
                }
            }
        };
    }

    @GetMapping("/api/diagrams")
    public List<Map<String, String>> listDiagrams() {
        List<Map<String, String>> result = new ArrayList<>();
        ObjectMapper mapper = new ObjectMapper();
        File sampleDir = new File(PROJECT_ROOT, "sample");

        if (!sampleDir.isDirectory()) {
            log.warn("sample/ directory not found at {}", sampleDir.getAbsolutePath());
            return result;
        }

        File[] files = sampleDir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) return result;

        for (File f : files) {
            try (InputStream is = new java.io.FileInputStream(f)) {
                JsonNode root = mapper.readTree(is);
                String label = root.path("title").asText(f.getName());
                result.add(Map.of("file", f.getName(), "label", label));
            } catch (IOException e) {
                log.warn("Skipping {}: {}", f.getName(), e.getMessage());
            }
        }

        log.info("GET /api/diagrams → {} diagrams", result.size());
        return result;
    }
}
