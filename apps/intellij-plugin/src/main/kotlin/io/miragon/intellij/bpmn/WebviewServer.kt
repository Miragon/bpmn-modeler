package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
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
 * the JCEF message bridge, never over HTTP. The one exception is the files of
 * approved workspace plugins, which it reads from [pluginCacheRoot] under
 * `/bpmn-plugins/<hash>/plugin.js|plugin.css`.
 */
@Service(Service.Level.APP)
class WebviewServer(private val pluginCacheRoot: Path = BpmnPluginCache.root()) : Disposable {
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

    /** The add-ons view of the BPMN Modeler tool window's Add-ons tab, from `/webview-add-ons/...`. */
    fun addOnsUrl(): String {
        ensureStarted()
        return "${origin}/addOns.html"
    }

    /** The element template preview: the template editor entry of the bpmn bundle, without its builder. */
    fun templatePreviewUrl(): String {
        ensureStarted()
        return "${origin}/templatePreview.html"
    }

    private fun handle(exchange: HttpExchange) {
        try {
            val path = exchange.requestURI.rawPath
            when (val route = WebviewRoute.forPath(path)) {
                WebviewRoute.BpmnShell -> respondHtml(exchange, indexHtml(), WebviewContentSecurityPolicy.BPMN_SHELL)
                WebviewRoute.DeploymentShell ->
                    respondHtml(exchange, deploymentHtml(), WebviewContentSecurityPolicy.DEPLOYMENT_SHELL)
                WebviewRoute.AddOnsShell -> respondHtml(exchange, addOnsHtml(), WebviewContentSecurityPolicy.ADD_ONS_SHELL)
                WebviewRoute.TemplatePreviewShell ->
                    respondHtml(exchange, templatePreviewHtml(), WebviewContentSecurityPolicy.BPMN_SHELL)
                is WebviewRoute.PluginAsset -> respondPluginAsset(exchange, route, path)
                WebviewRoute.NotFound -> respondNotFound(exchange, path)
                is WebviewRoute.ClasspathAsset -> {
                    val bytes = javaClass.getResourceAsStream(route.resourcePath)?.use { it.readBytes() }
                    if (bytes == null) {
                        respondNotFound(exchange, path)
                    } else {
                        respond(exchange, 200, route.mimeType, bytes)
                    }
                }
            }
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
        // Page-level theme scope baked in so the first frame paints correctly (no
        // light flash). Theming is per-instance via `data-bpmn-theme`; the theme
        // CSS ships inside `/index.css`, so there is no `#theme-link` to swap.
        val themeKind = if (signal.isDark()) "dark" else "light"
        return listOf(
            "<!DOCTYPE html>",
            "<html lang=\"en\" data-bpmn-theme=\"$themeKind\">",
            "<head>",
            "  <meta charset=\"UTF-8\"/>",
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "  <link href=\"/index.css\" rel=\"stylesheet\"/>",
            "  <title>BPMN Modeler</title>",
            "  <style id=\"ide-theme-vars\">${signal.themeVarsCss()}</style>",
            "  <script>${WebviewContentSecurityPolicy.ACQUIRE_VS_CODE_API_SHIM}</script>",
            "</head>",
            "<body class=\"${signal.bodyClass()}\">",
            "  <div id=\"app\"></div>",
            "  <script type=\"module\" src=\"/index.js\"></script>",
            "</body>",
            "</html>",
        ).joinToString("\n")
    }

    /**
     * Synthesises the deployment tool-window shell with the IDE theme baked in,
     * mirroring [indexHtml]: the [IdeThemeSignal.bodyClass] on `<body>` and an
     * `#ide-theme-vars` block carrying the deployment form's mapped `--vscode-*`
     * colors (the id `applyJs` rewrites live) so the form follows the IDE theme,
     * not the OS. The deployment bundle (`src/adapter/in/formTemplate.ts`)
     * renders the form itself. Assets resolve under `/deployment/...` →
     * classpath `/webview-deployment`.
     *
     * The off-EDT palette read on the HTTP pool thread is safe for the same reason
     * documented on [indexHtml].
     */
    private fun deploymentHtml(): String {
        val signal = service<IdeThemeSignal>()
        return sidePanelHtml(
            "Deploy Diagram",
            "/deployment",
            themeVarsCss = signal.deploymentThemeVarsCss(),
            bodyClass = signal.bodyClass(),
        )
    }

    /**
     * The add-ons view, built from the core's model into `#app` by its bundle under `/add-ons/...`.
     * It wears the Miragon brand, not the IDE palette: `<html>` carries only its brand mode, so the
     * first frame paints in it.
     */
    private fun addOnsHtml(): String =
        sidePanelHtml("Add-ons", "/add-ons", htmlAttributes = service<IdeThemeSignal>().addOnsBrandMode().htmlAttributes())

    /** A tool window page: its bundle under [assetPrefix] and an empty `#app` it fills. */
    private fun sidePanelHtml(
        title: String,
        assetPrefix: String,
        htmlAttributes: String = "",
        themeVarsCss: String? = null,
        bodyClass: String? = null,
    ): String =
        listOfNotNull(
            "<!DOCTYPE html>",
            "<html lang=\"en\"$htmlAttributes>",
            "<head>",
            "  <meta charset=\"UTF-8\"/>",
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "  <link href=\"$assetPrefix/index.css\" rel=\"stylesheet\"/>",
            "  <title>$title</title>",
            themeVarsCss?.let { "  <style id=\"ide-theme-vars\">$it</style>" },
            "  <script>${WebviewContentSecurityPolicy.ACQUIRE_VS_CODE_API_SHIM}</script>",
            "</head>",
            "<body${bodyClass?.let { " class=\"$it\"" } ?: ""}>",
            "  <div id=\"app\"></div>",
            "  <script type=\"module\" src=\"$assetPrefix/index.js\"></script>",
            "</body>",
            "</html>",
        ).joinToString("\n")

    /** The preview shell, themed like [indexHtml]; `data-view` asks the page for the preview alone. */
    private fun templatePreviewHtml(): String {
        val signal = service<IdeThemeSignal>()
        val themeKind = if (signal.isDark()) "dark" else "light"
        return listOf(
            "<!DOCTYPE html>",
            "<html lang=\"en\" data-bpmn-theme=\"$themeKind\">",
            "<head>",
            "  <meta charset=\"UTF-8\"/>",
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "  <link href=\"/index.css\" rel=\"stylesheet\"/>",
            "  <title>Element Template Preview</title>",
            "  <style id=\"ide-theme-vars\">${signal.themeVarsCss()}</style>",
            "  <script>${WebviewContentSecurityPolicy.ACQUIRE_VS_CODE_API_SHIM}</script>",
            "</head>",
            "<body class=\"${signal.bodyClass()}\">",
            "  <div id=\"app\" data-view=\"preview\"></div>",
            "  <script type=\"module\" src=\"/templateEditor.js\"></script>",
            "</body>",
            "</html>",
        ).joinToString("\n")
    }

    /** Served without a policy, like the bundle; the page's `script-src 'self'` already admits the same origin. */
    private fun respondPluginAsset(exchange: HttpExchange, asset: WebviewRoute.PluginAsset, path: String) {
        val file = PluginAssetFile.resolve(pluginCacheRoot, asset) ?: return respondNotFound(exchange, path)
        exchange.responseHeaders.set("X-Content-Type-Options", "nosniff")
        // The same hash names the same bytes, but a cleared cache must not be answered from memory.
        exchange.responseHeaders.set("Cache-Control", "no-cache")
        respond(exchange, 200, WebviewRoute.mimeTypeOf(asset.fileName), Files.readAllBytes(file))
    }

    private fun respondNotFound(exchange: HttpExchange, path: String) =
        respond(exchange, 404, "text/plain; charset=utf-8", "Not found: $path".toByteArray())

    private fun respond(exchange: HttpExchange, code: Int, contentType: String, body: ByteArray) {
        exchange.responseHeaders.set("Content-Type", contentType)
        exchange.sendResponseHeaders(code, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    private fun respondHtml(exchange: HttpExchange, html: String, contentSecurityPolicy: String) {
        exchange.responseHeaders.set("Content-Security-Policy", contentSecurityPolicy)
        respond(exchange, 200, "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
    }

    override fun dispose() {
        server?.stop(0)
        server = null
        baseUrl = null
        origin = null
    }
}
