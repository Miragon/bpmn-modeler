package io.miragon.intellij.bpmn

import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.ui.JBColor
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.net.HttpURLConnection
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path

@TestApplication
class WebviewServerTest {
    @TempDir
    lateinit var tempDir: Path

    private val pluginCacheRoot: Path get() = tempDir.resolve("bpmn-plugins")

    private val server by lazy { WebviewServer(pluginCacheRoot) }

    private var wasDark = false

    @BeforeEach
    fun forceLightTheme() {
        wasDark = !JBColor.isBright()
        JBColor.setDark(false)
    }

    @AfterEach
    fun stopServer() {
        Disposer.dispose(server)
        JBColor.setDark(wasDark)
    }

    private class Response(
        val status: Int,
        val contentType: String?,
        val body: String,
        val headers: Map<String?, List<String>> = emptyMap(),
    ) {
        fun header(name: String): String? = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.single()
    }

    private fun get(url: String): Response {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            val status = connection.responseCode
            val stream = if (status < 400) connection.inputStream else connection.errorStream
            val body = stream.use { it.readBytes().toString(Charsets.UTF_8) }
            return Response(status, connection.contentType, body, connection.headerFields)
        } finally {
            connection.disconnect()
        }
    }

    private fun cachePluginFile(fileName: String, content: String, hash: String = HASH): Path {
        val file = pluginCacheRoot.resolve(hash).resolve(fileName)
        Files.createDirectories(file.parent)
        Files.writeString(file, content)
        return file
    }

    private fun origin(): String = server.ensureStarted().removeSuffix("/index.html")

    @Test
    fun `ensureStarted binds once to the IPv4 loopback and returns the bpmn shell url`() {
        val shellUrl = server.ensureStarted()

        assertTrue(shellUrl.matches(Regex("""http://127\.0\.0\.1:\d+/index\.html""")), shellUrl)
        assertEquals(shellUrl, server.ensureStarted())
        assertEquals(shellUrl.replace("/index.html", "/deployment.html"), server.deploymentUrl())
        assertEquals(shellUrl.replace("/index.html", "/addOns.html"), server.addOnsUrl())
    }

    @Test
    fun `the bpmn shell bakes in the IDE theme and boots the bundle`() {
        val response = get(server.ensureStarted())

        assertEquals(200, response.status)
        assertEquals("text/html; charset=utf-8", response.contentType)
        assertTrue(response.body.contains("""data-bpmn-theme="light""""))
        assertTrue(response.body.contains("""<body class="vscode-light">"""))
        assertTrue(response.body.contains("""<style id="ide-theme-vars">:root {"""))
        assertTrue(response.body.contains("window.acquireVsCodeApi"))
        assertTrue(response.body.contains("""<script type="module" src="/index.js"></script>"""))
    }

    @Test
    fun `the template preview shell boots the template editor entry as a preview only`() {
        val url = server.templatePreviewUrl()
        val response = get(url)

        assertEquals("${origin()}/templatePreview.html", url)
        assertEquals(200, response.status)
        assertTrue(response.body.contains("""<link href="/index.css" rel="stylesheet"/>"""))
        assertTrue(response.body.contains("""<body class="vscode-light">"""))
        assertTrue(response.body.contains("""<div id="app" data-view="preview"></div>"""))
        assertTrue(response.body.contains("window.acquireVsCodeApi"))
        assertTrue(response.body.contains("""<script type="module" src="/templateEditor.js"></script>"""))
    }

    @Test
    fun `the deployment shell loads the deployment bundle with its own theme vars`() {
        val response = get(server.deploymentUrl())

        assertEquals(200, response.status)
        assertTrue(response.body.contains("""<html lang="en">"""))
        assertTrue(response.body.contains("""<link href="/deployment/index.css" rel="stylesheet"/>"""))
        assertTrue(response.body.contains("""<style id="ide-theme-vars">:root {"""))
        assertTrue(response.body.contains("--vscode-button-background"))
        assertTrue(response.body.contains("""<body class="vscode-light">"""))
        assertTrue(response.body.contains("""<script type="module" src="/deployment/index.js"></script>"""))
    }

    @Test
    fun `the add-ons shell loads the add-ons bundle into an empty app in its brand mode alone`() {
        val response = get(server.addOnsUrl())

        assertEquals(200, response.status)
        assertTrue(response.body.contains("<title>Add-ons</title>"))
        assertTrue(response.body.contains("""<html lang="en" data-cd-theme="light">"""))
        assertTrue(response.body.contains("""<link href="/add-ons/index.css" rel="stylesheet"/>"""))
        assertFalse(response.body.contains("ide-theme-vars"))
        assertFalse(response.body.contains("--vscode-"))
        assertTrue(response.body.contains("<body>"))
        assertTrue(response.body.contains("""<div id="app"></div>"""))
        assertTrue(response.body.contains("window.acquireVsCodeApi"))
        assertTrue(response.body.contains("""<script type="module" src="/add-ons/index.js"></script>"""))
    }

    @Test
    fun `bundle assets are served from the classpath with their mime type`() {
        val bpmnAsset = get("${origin()}/test-asset.css")
        val deploymentAsset = get("${origin()}/deployment/test-asset.svg")
        val addOnsAsset = get("${origin()}/add-ons/test-asset.css")

        assertEquals(200, bpmnAsset.status)
        assertEquals("text/css; charset=utf-8", bpmnAsset.contentType)
        assertTrue(bpmnAsset.body.contains(".test-asset"))
        assertEquals(200, deploymentAsset.status)
        assertEquals("image/svg+xml", deploymentAsset.contentType)
        assertTrue(deploymentAsset.body.contains("test-asset"))
        assertEquals(200, addOnsAsset.status)
        assertTrue(addOnsAsset.body.contains(".add-ons-test-asset"))
    }

    @Test
    fun `the add-ons bundle's fonts are served as fonts`() {
        val font = get("${origin()}/add-ons/test-font.woff2")

        assertEquals(200, font.status)
        assertEquals("font/woff2", font.contentType)
    }

    @Test
    fun `a missing asset answers 404`() {
        val response = get("${origin()}/missing.js")

        assertEquals(404, response.status)
        assertEquals("Not found: /missing.js", response.body)
    }

    @Test
    fun `a cached plugin script is served from the plugin cache, never sniffed and never cached`() {
        cachePluginFile("plugin.js", "window.pluginLoaded = true;")

        val response = get("${origin()}/bpmn-plugins/$HASH/plugin.js")

        assertEquals(200, response.status)
        assertEquals("text/javascript; charset=utf-8", response.contentType)
        assertEquals("window.pluginLoaded = true;", response.body)
        assertEquals("nosniff", response.header("X-Content-Type-Options"))
        assertEquals("no-cache", response.header("Cache-Control"))
        assertNull(response.header("Content-Security-Policy"))
    }

    @Test
    fun `a cached plugin stylesheet is served as css`() {
        cachePluginFile("plugin.css", ".djs-shape { opacity: 1 }")

        val response = get("${origin()}/bpmn-plugins/$HASH/plugin.css")

        assertEquals(200, response.status)
        assertEquals("text/css; charset=utf-8", response.contentType)
        assertEquals(".djs-shape { opacity: 1 }", response.body)
    }

    @Test
    fun `a plugin file the cache does not hold answers 404`() {
        assertEquals(404, get("${origin()}/bpmn-plugins/$HASH/plugin.js").status)
    }

    @Test
    fun `a plugin url with an encoded separator answers 404 although the file exists`() {
        cachePluginFile("plugin.js", "window.pluginLoaded = true;")

        assertEquals(404, get("${origin()}/bpmn-plugins/$HASH%2Fplugin.js").status)
    }

    @Test
    fun `a cached plugin file that is a symbolic link answers 404`() {
        val target = cachePluginFile("plugin.js", "steal()", hash = OTHER_HASH)
        Files.createDirectories(pluginCacheRoot.resolve(HASH))
        Files.createSymbolicLink(pluginCacheRoot.resolve(HASH).resolve("plugin.js"), target)

        assertEquals(404, get("${origin()}/bpmn-plugins/$HASH/plugin.js").status)
    }

    @Test
    fun `a hash folder linked outside the plugin cache answers 404`() {
        val outside = Files.createDirectories(tempDir.resolve("outside"))
        Files.writeString(outside.resolve("plugin.js"), "steal()")
        Files.createDirectories(pluginCacheRoot)
        Files.createSymbolicLink(pluginCacheRoot.resolve(HASH), outside)

        assertEquals(404, get("${origin()}/bpmn-plugins/$HASH/plugin.js").status)
    }

    private companion object {
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        const val OTHER_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    }
}
