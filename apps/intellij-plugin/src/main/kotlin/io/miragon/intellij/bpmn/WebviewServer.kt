package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
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

        // Port 0 → the OS assigns a free ephemeral port; bind to loopback only.
        val httpServer = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        httpServer.createContext("/") { exchange -> handle(exchange) }
        httpServer.executor =
            Executors.newCachedThreadPool { runnable ->
                Thread(runnable, "miranum-webview-http").apply { isDaemon = true }
            }
        httpServer.start()

        val base = "http://127.0.0.1:${httpServer.address.port}"
        val url = "$base/index.html"
        server = httpServer
        origin = base
        baseUrl = url
        log.info("Miranum webview server started at $url")
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
                respond(exchange, 200, "text/html; charset=utf-8", INDEX_HTML.toByteArray(StandardCharsets.UTF_8))
                return
            }
            if (path == "/deployment.html") {
                respond(exchange, 200, "text/html; charset=utf-8", DEPLOYMENT_HTML.toByteArray(StandardCharsets.UTF_8))
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
         * bpmn-js icon font. The Vite `viteStaticCopy` glob preserves the source
         * `node_modules/...` path, so the font CSS lands at this nested location.
         * The embedded variant inlines the font as base64, so palette/context-pad
         * icons render even though its sibling `../font` URLs don't resolve under
         * this layout.
         */
        const val FONT_CSS =
            "/css/node_modules/camunda-bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css"

        /**
         * The `acquireVsCodeApi()` shim. Runs as a classic (non-module) script so
         * the global exists before the deferred ES module calls `getVsCodeApi()` at
         * top level. Outgoing messages are buffered until the JVM installs its sink
         * via `__miranumSetSink`, because the module may post before the host
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
                "  window.__miranumSetSink = function (fn) { sink = fn; flush(); };",
                "  window.acquireVsCodeApi = function () {",
                "    return {",
                "      postMessage: function (msg) { outbox.push(JSON.stringify(msg)); flush(); },",
                "      getState: function () { return state; },",
                "      setState: function (s) { state = s; return s; }",
                "    };",
                "  };",
                "})();",
            ).joinToString("\n")

        /**
         * Mirrors the `#js-canvas` / `#js-panel-resizer` / `#js-properties-panel`
         * skeleton the webview queries by id, plus the asset tags from the VS Code
         * host's `WebviewHtml.ts`. The `#app { height: 100vh }` wrapper gives the
         * canvas a height that the VS Code host gets from its own body styling.
         */
        val INDEX_HTML =
            listOf(
                "<!DOCTYPE html>",
                "<html lang=\"en\">",
                "<head>",
                "  <meta charset=\"UTF-8\"/>",
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
                "  <link href=\"/index.css\" rel=\"stylesheet\"/>",
                "  <link href=\"/lightTheme.css\" rel=\"stylesheet\" id=\"theme-link\"/>",
                "  <link href=\"$FONT_CSS\" rel=\"stylesheet\"/>",
                "  <title>BPMN Modeler</title>",
                "  <style>html, body { margin: 0; height: 100%; } #app { height: 100vh; }</style>",
                "  <script>$SHIM</script>",
                "</head>",
                "<body>",
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

        /**
         * Maps the `--vscode-*` CSS variables the deployment form's stylesheet
         * reads onto CSS *system colors*, so the form stays readable in both light
         * and dark IDE themes without a VS Code host. `color-scheme: light dark`
         * lets Chromium (JCEF) resolve `Canvas`/`CanvasText`/`Field`/… to the
         * embedding theme; this is the IntelliJ counterpart of VS Code injecting
         * its theme variables into the webview. (Visual parity should be confirmed
         * live against a dark IDE theme — see #1071 notes.)
         */
        val DEPLOYMENT_THEME =
            listOf(
                ":root {",
                "  color-scheme: light dark;",
                "  --vscode-foreground: CanvasText;",
                "  --vscode-descriptionForeground: GrayText;",
                "  --vscode-icon-foreground: CanvasText;",
                "  --vscode-editor-background: Canvas;",
                "  --vscode-sideBar-background: Canvas;",
                "  --vscode-sideBarSectionHeader-background: ButtonFace;",
                "  --vscode-sideBarSectionHeader-foreground: CanvasText;",
                "  --vscode-panel-border: GrayText;",
                "  --vscode-list-hoverBackground: Highlight;",
                "  --vscode-focusBorder: Highlight;",
                "  --vscode-input-background: Field;",
                "  --vscode-input-foreground: FieldText;",
                "  --vscode-input-border: GrayText;",
                "  --vscode-button-background: AccentColor;",
                "  --vscode-button-foreground: AccentColorText;",
                "  --vscode-button-hoverBackground: AccentColor;",
                "  --vscode-button-secondaryBackground: ButtonFace;",
                "  --vscode-button-secondaryForeground: ButtonText;",
                "  --vscode-button-secondaryHoverBackground: ButtonFace;",
                "  --vscode-errorForeground: #e51400;",
                "  --vscode-notifications-background: Canvas;",
                "  --vscode-inputValidation-errorBackground: #5a1d1d;",
                "  --vscode-inputValidation-errorBorder: #be1100;",
                "  --vscode-inputValidation-errorForeground: CanvasText;",
                "  --vscode-inputValidation-infoBackground: #063b49;",
                "  --vscode-inputValidation-infoBorder: #007acc;",
                "  --vscode-inputValidation-infoForeground: CanvasText;",
                "}",
            ).joinToString("\n")

        /**
         * Deployment tool-window shell. Same shim + asset-tag pattern as
         * [INDEX_HTML]; the body is just `<div id="app"></div>` because the
         * deployment bundle (`src/app/formTemplate.ts`) renders the form itself.
         * Assets resolve under `/deployment/...` → classpath `/webview-deployment`.
         */
        val DEPLOYMENT_HTML =
            listOf(
                "<!DOCTYPE html>",
                "<html lang=\"en\">",
                "<head>",
                "  <meta charset=\"UTF-8\"/>",
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
                "  <link href=\"/deployment/index.css\" rel=\"stylesheet\"/>",
                "  <title>Deploy Diagram</title>",
                "  <style>$DEPLOYMENT_THEME</style>",
                "  <script>$SHIM</script>",
                "</head>",
                "<body>",
                "  <div id=\"app\"></div>",
                "  <script type=\"module\" src=\"/deployment/index.js\"></script>",
                "</body>",
                "</html>",
            ).joinToString("\n")
    }
}
