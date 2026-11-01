package io.miragon.intellij.bpmn

import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.ui.JBColor
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.HttpURLConnection
import java.net.URI

@TestApplication
class WebviewServerTest {
    private val server = WebviewServer()

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

    private class Response(val status: Int, val contentType: String?, val body: String)

    private fun get(url: String): Response {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            val status = connection.responseCode
            val stream = if (status < 400) connection.inputStream else connection.errorStream
            val body = stream.use { it.readBytes().toString(Charsets.UTF_8) }
            return Response(status, connection.contentType, body)
        } finally {
            connection.disconnect()
        }
    }

    private fun origin(): String = server.ensureStarted().removeSuffix("/index.html")

    @Test
    fun `ensureStarted binds once to the IPv4 loopback and returns the bpmn shell url`() {
        val shellUrl = server.ensureStarted()

        assertTrue(shellUrl.matches(Regex("""http://127\.0\.0\.1:\d+/index\.html""")), shellUrl)
        assertEquals(shellUrl, server.ensureStarted())
        assertEquals(shellUrl.replace("/index.html", "/deployment.html"), server.deploymentUrl())
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
        assertTrue(response.body.contains("""<link href="/deployment/index.css" rel="stylesheet"/>"""))
        assertTrue(response.body.contains("--vscode-button-background"))
        assertTrue(response.body.contains("""<script type="module" src="/deployment/index.js"></script>"""))
    }

    @Test
    fun `bundle assets are served from the classpath with their mime type`() {
        val bpmnAsset = get("${origin()}/test-asset.css")
        val deploymentAsset = get("${origin()}/deployment/test-asset.svg")

        assertEquals(200, bpmnAsset.status)
        assertEquals("text/css; charset=utf-8", bpmnAsset.contentType)
        assertTrue(bpmnAsset.body.contains(".test-asset"))
        assertEquals(200, deploymentAsset.status)
        assertEquals("image/svg+xml", deploymentAsset.contentType)
        assertTrue(deploymentAsset.body.contains("test-asset"))
    }

    @Test
    fun `a missing asset answers 404`() {
        val response = get("${origin()}/missing.js")

        assertEquals(404, response.status)
        assertEquals("Not found: /missing.js", response.body)
    }
}
