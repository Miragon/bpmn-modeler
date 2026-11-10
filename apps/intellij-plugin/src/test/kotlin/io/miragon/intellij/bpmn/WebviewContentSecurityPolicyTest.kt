package io.miragon.intellij.bpmn

import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64

@TestApplication
class WebviewContentSecurityPolicyTest {
    private val server = WebviewServer()

    private val httpClient = HttpClient.newHttpClient()

    @AfterEach
    fun tearDown() {
        server.dispose()
    }

    @Test
    fun `pins the bpmn shell policy`() {
        assertEquals(
            "default-src 'none'; " +
                "script-src 'self' 'sha256-gRNMaVliC1NArQo19O2For+mqk6lM6huJLujAnYaytk='; " +
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: https:; " +
                "font-src 'self' data:; " +
                "base-uri 'none'; form-action 'none'",
            WebviewContentSecurityPolicy.BPMN_SHELL,
        )
    }

    @Test
    fun `pins the deployment shell policy`() {
        assertEquals(
            "default-src 'none'; " +
                "script-src 'self' 'sha256-gRNMaVliC1NArQo19O2For+mqk6lM6huJLujAnYaytk='; " +
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data:; " +
                "font-src 'self' data:; " +
                "base-uri 'none'; form-action 'none'",
            WebviewContentSecurityPolicy.DEPLOYMENT_SHELL,
        )
    }

    @Test
    fun `pins the add-ons shell policy, which loads its bundled fonts and no image`() {
        assertEquals(
            "default-src 'none'; " +
                "script-src 'self' 'sha256-gRNMaVliC1NArQo19O2For+mqk6lM6huJLujAnYaytk='; " +
                "style-src 'self' 'unsafe-inline'; " +
                "font-src 'self'; " +
                "base-uri 'none'; form-action 'none'",
            WebviewContentSecurityPolicy.ADD_ONS_SHELL,
        )
    }

    @Test
    fun `the shim removes the sink setter once the host installed its sink`() {
        val shim = WebviewContentSecurityPolicy.ACQUIRE_VS_CODE_API_SHIM

        assertTrue(shim.contains("Object.defineProperty(window, \"__modelerSetSink\""), shim)
        assertTrue(shim.contains("delete window.__modelerSetSink;"), shim)
        assertFalse(shim.contains("window.__modelerSetSink = "), "a plain assignment would leave the setter writable")
    }

    @Test
    fun `the shim hands out the host api once and frozen`() {
        val shim = WebviewContentSecurityPolicy.ACQUIRE_VS_CODE_API_SHIM

        assertTrue(shim.contains("if (acquired) throw new Error("), shim)
        assertTrue(shim.contains("acquired = true;"), shim)
        assertTrue(shim.contains("return Object.freeze({"), shim)
    }

    @Test
    fun `serves the bpmn shell with a policy that admits its inline script`() {
        val response = get(server.ensureStarted())

        val policy = response.headers().firstValue("Content-Security-Policy").orElse(null)

        assertEquals(WebviewContentSecurityPolicy.BPMN_SHELL, policy)
        assertEquals(listOf(policy.scriptHashSource()), inlineScriptHashSources(response.body()))
    }

    @Test
    fun `serves the deployment shell with a policy that admits its inline script`() {
        val response = get(server.deploymentUrl())

        val policy = response.headers().firstValue("Content-Security-Policy").orElse(null)

        assertEquals(WebviewContentSecurityPolicy.DEPLOYMENT_SHELL, policy)
        assertEquals(listOf(policy.scriptHashSource()), inlineScriptHashSources(response.body()))
    }

    @Test
    fun `serves the add-ons shell with a policy that admits its inline script`() {
        val response = get(server.addOnsUrl())

        val policy = response.headers().firstValue("Content-Security-Policy").orElse(null)

        assertEquals(WebviewContentSecurityPolicy.ADD_ONS_SHELL, policy)
        assertEquals(listOf(policy.scriptHashSource()), inlineScriptHashSources(response.body()))
    }

    @Test
    fun `serves bundle assets without a policy`() {
        val response = get(server.ensureStarted().replace("/index.html", "/test-asset.css"))

        assertEquals(200, response.statusCode())

        assertEquals(false, response.headers().firstValue("Content-Security-Policy").isPresent)
    }

    private fun get(url: String): HttpResponse<String> =
        httpClient.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString())

    private fun String.scriptHashSource(): String = Regex("'sha256-[^']+'").find(this)!!.value

    private fun inlineScriptHashSources(html: String): List<String> =
        Regex("<script>(.*?)</script>", RegexOption.DOT_MATCHES_ALL).findAll(html).map { match ->
            val inlineScript = match.groupValues[1].toByteArray(StandardCharsets.UTF_8)
            val digest = MessageDigest.getInstance("SHA-256").digest(inlineScript)
            "'sha256-${Base64.getEncoder().encodeToString(digest)}'"
        }.toList()
}
