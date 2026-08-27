package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

/**
 * Loopback HTTP server that serves the pre-built bpmn-webview bundle to JCEF.
 *
 * Serving over `http://127.0.0.1` rather than `file://` is mandatory: the bundle
 * is an ES module (`<script type="module">`), and Chromium refuses to load
 * modules over `file://` (CORS). HTTP also yields correct MIME types so the
 * `.js`/`.css`/font responses are interpreted, not downloaded.
 *
 * Assets are read from the plugin classpath (`/webview/...`, staged there by the
 * Gradle `copyWebview` task) so the same code path works in `runIde` and in a
 * packaged plugin without resolving on-disk install locations. The `/index.html`
 * shell is synthesised here because the Vite build emits no HTML — its input is
 * `src/main.ts`, so every host supplies its own DOM skeleton + asset tags.
 *
 * A single application-level instance serves every editor (in every project):
 * the static bundle is identical across files, and all per-file data flows over
 * the JCEF message bridge, never over HTTP.
 */
@Service(Service.Level.APP)
class WebviewServer : Disposable {
    private val log = Logger.getInstance(WebviewServer::class.java)

    private var server: HttpServer? = null

    @Volatile
    private var baseUrl: String? = null

    // Loopback origin (scheme + host + port) without a path, so per-shell URLs
    // (bpmn `/index.html`, deployment `/deployment.html`) can be derived from it.
    @Volatile
    private var origin: String? = null

    /**
     * Starts the server on first call and returns the URL of the synthesised
     * bpmn editor shell. Idempotent — later calls return the already-bound URL.
     */
    @Synchronized
    fun ensureStarted(): String {
        baseUrl?.let { return it }

        // Port 0 → the OS assigns a free ephemeral port. Bind to the IPv4 literal
        // `127.0.0.1` (no DNS), not getLoopbackAddress(): the latter returns `::1`
        // under -Djava.net.preferIPv6Addresses, but the base URL below advertises
        // `127.0.0.1`, and the mismatch makes JCEF load a blank editor.
        val httpServer = HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0)
        httpServer.createContext("/") { exchange -> handle(exchange) }
        httpServer.executor =
            Executors.newCachedThreadPool { runnable ->
                Thread(runnable, "modeler-webview-http").apply { isDaemon = true }
            }
        httpServer.start()

        val base = "http://127.0.0.1:${httpServer.address.port}"
        val url = "$base/index.html"
        server = httpServer
        origin = base
        baseUrl = url
        log.info("Miragon webview server started at $url")
        return url
    }

    /**
     * Ensures the server is running and returns the deployment tool-window shell
     * URL. Same static bundle pipeline as the bpmn shell, served from a separate
     * classpath root (`/webview-deployment/...`).
     */
    fun deploymentUrl(): String {
        ensureStarted()
        return "${origin}/deployment.html"
    }

    private fun handle(exchange: HttpExchange) {
        try {
            val path = exchange.requestURI.path
            if (path == "/" || path == "/index.html") {
                respond(exchange, 200, "text/html; charset=utf-8", indexHtml().toByteArray(StandardCharsets.UTF_8))
                return
            }
            if (path == "/deployment.html") {
                respond(exchange, 200, "text/html; charset=utf-8", deploymentHtml().toByteArray(StandardCharsets.UTF_8))
                return
            }

            // The two bundles live under distinct classpath roots; the
            // `/deployment/...` request prefix maps to `/webview-deployment/...`,
            // everything else to the bpmn bundle's `/webview/...`.
            val decoded = URLDecoder.decode(path, StandardCharsets.UTF_8)
            val resourcePath =
                if (decoded.startsWith("/deployment/")) {
                    "/webview-deployment" + decoded.removePrefix("/deployment")
                } else {
                    "/webview$decoded"
                }
            val bytes = javaClass.getResourceAsStream(resourcePath)?.use { it.readBytes() }
            if (bytes == null) {
                respond(exchange, 404, "text/plain; charset=utf-8", "Not found: $path".toByteArray())
                return
            }
            respond(exchange, 200, mimeType(path), bytes)
        } catch (e: Exception) {
            log.warn("Error serving ${exchange.requestURI}", e)
            runCatching { respond(exchange, 500, "text/plain; charset=utf-8", (e.message ?: "error").toByteArray()) }
        } finally {
            exchange.close()
        }
    }

    /**
     * Synthesises the bpmn editor shell with the IDE theme baked in: the
     * [IdeThemeSignal.bodyClass] on `<body>` and an `#ide-theme-vars` style block
     * carrying the mapped `--vscode-*` colors. Computing this per request (rather
     * than caching a constant) means the page paints in the correct theme on the
     * very first frame — no light flash, no race with `onLoadEnd`.
     *
     * Note the deliberate off-EDT UIManager read: `handle()` runs on the HTTP
     * pool thread, but the color lookups [IdeThemeSignal] performs are plain
     * UIDefaults reads with no EDT affinity, and nothing here is cached.
     */
    private fun indexHtml(): String {
        val signal = service<IdeThemeSignal>()
        return listOf(
            "<!DOCTYPE html>",
            "<html lang=\"en\">",
            "<head>",
            "  <meta charset=\"UTF-8\"/>",
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "  <link href=\"/index.css\" rel=\"stylesheet\"/>",
            "  <link href=\"/lightTheme.css\" rel=\"stylesheet\" id=\"theme-link\"/>",
            "  <title>BPMN Modeler</title>",
            "  <style>html, body { margin: 0; height: 100%; } #app { height: 100vh; }</style>",
            "  <style id=\"ide-theme-vars\">${signal.themeVarsCss()}</style>",
            "  <script>$SHIM</script>",
            "</head>",
            "<body class=\"${signal.bodyClass()}\">",
            "  <div id=\"app\">",
            "    <div class=\"content with-diagram\" id=\"js-drop-zone\">",
            "      <div class=\"canvas\" id=\"js-canvas\"></div>",
            "      <div id=\"js-panel-resizer\" class=\"panel-resizer\"></div>",
            "      <div class=\"properties-panel-parent\" id=\"js-properties-panel\"></div>",
            "    </div>",
            "  </div>",
            "  <script type=\"module\" src=\"/index.js\"></script>",
            "</body>",
            "</html>",
        ).joinToString("\n")
    }

    /**
     * Synthesises the deployment tool-window shell with the IDE theme baked in,
     * mirroring [indexHtml]: the [IdeThemeSignal.bodyClass] on `<body>` and an
     * `#ide-theme-vars` block carrying the deployment form's mapped `--vscode-*`
     * colors (the id `applyJs` rewrites live). Replaces the former static
     * system-color block so the form follows the IDE theme, not the OS. The body
     * is just `<div id="app"></div>` because the deployment bundle
     * (`src/app/formTemplate.ts`) renders the form itself. Assets resolve under
     * `/deployment/...` → classpath `/webview-deployment`.
     *
     * The off-EDT palette read on the HTTP pool thread is safe for the same reason
     * documented on [indexHtml].
     */
    private fun deploymentHtml(): String {
        val signal = service<IdeThemeSignal>()
        return listOf(
            "<!DOCTYPE html>",
            "<html lang=\"en\">",
            "<head>",
            "  <meta charset=\"UTF-8\"/>",
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "  <link href=\"/deployment/index.css\" rel=\"stylesheet\"/>",
            "  <title>Deploy Diagram</title>",
            "  <style id=\"ide-theme-vars\">${signal.deploymentThemeVarsCss()}</style>",
            "  <script>$SHIM</script>",
            "</head>",
            "<body class=\"${signal.bodyClass()}\">",
            "  <div id=\"app\"></div>",
            "  <script type=\"module\" src=\"/deployment/index.js\"></script>",
            "</body>",
            "</html>",
        ).joinToString("\n")
    }

    private fun respond(exchange: HttpExchange, code: Int, contentType: String, body: ByteArray) {
        exchange.responseHeaders.set("Content-Type", contentType)
        exchange.sendResponseHeaders(code, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    private fun mimeType(path: String): String =
        when (path.substringAfterLast('.').lowercase()) {
            "js", "mjs" -> "text/javascript; charset=utf-8"
            "css" -> "text/css; charset=utf-8"
            "html" -> "text/html; charset=utf-8"
            "json" -> "application/json; charset=utf-8"
            "svg" -> "image/svg+xml"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            "ttf" -> "font/ttf"
            "eot" -> "application/vnd.ms-fontobject"
            "ico" -> "image/x-icon"
            "png" -> "image/png"
            else -> "application/octet-stream"
        }

    override fun dispose() {
        server?.stop(0)
        server = null
        baseUrl = null
        origin = null
    }

    private companion object {
        /**
         * The `acquireVsCodeApi()` shim. Runs as a classic (non-module) script so
         * the global exists before the deferred ES module calls `getVsCodeApi()` at
         * top level. Outgoing messages are buffered until the JVM installs its sink
         * via `__modelerSetSink`, because the module may post before the host
         * callback is injected (which only happens on `onLoadEnd`).
         */
        val SHIM =
            listOf(
                "(function () {",
                "  var outbox = [];",
                "  var sink = null;",
                "  var state = {};",
                "  function flush() {",
                "    if (!sink) return;",
                "    while (outbox.length) { sink(outbox.shift()); }",
                "  }",
                "  window.__modelerSetSink = function (fn) { sink = fn; flush(); };",
                "  window.acquireVsCodeApi = function () {",
                "    return {",
                "      postMessage: function (msg) { outbox.push(JSON.stringify(msg)); flush(); },",
                "      getState: function () { return state; },",
                "      setState: function (s) { state = s; return s; }",
                "    };",
                "  };",
                "})();",
            ).joinToString("\n")

        // The bpmn and deployment shells are emitted by the instance methods
        // `indexHtml()` / `deploymentHtml()`, not constants: their `<body>` class
        // and `#ide-theme-vars` block are computed per request from the live IDE
        // theme (see IdeThemeSignal).
    }
}
