package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class WebviewRouteTest {
    @Test
    fun `root and index html serve the bpmn shell`() {
        assertEquals(WebviewRoute.BpmnShell, WebviewRoute.forPath("/"))
        assertEquals(WebviewRoute.BpmnShell, WebviewRoute.forPath("/index.html"))
    }

    @Test
    fun `deployment html serves the deployment shell`() {
        assertEquals(WebviewRoute.DeploymentShell, WebviewRoute.forPath("/deployment.html"))
    }

    @Test
    fun `templatePreview html serves the element template preview shell`() {
        assertEquals(WebviewRoute.TemplatePreviewShell, WebviewRoute.forPath("/templatePreview.html"))
    }

    @Test
    fun `assets resolve under the bpmn bundle root`() {
        assertEquals(
            WebviewRoute.ClasspathAsset("/webview/index.js", "text/javascript; charset=utf-8"),
            WebviewRoute.forPath("/index.js"),
        )
        assertEquals(
            WebviewRoute.ClasspathAsset("/webview/assets/chunk-abc.css", "text/css; charset=utf-8"),
            WebviewRoute.forPath("/assets/chunk-abc.css"),
        )
    }

    @Test
    fun `deployment assets resolve under the deployment bundle root`() {
        assertEquals(
            WebviewRoute.ClasspathAsset("/webview-deployment/index.js", "text/javascript; charset=utf-8"),
            WebviewRoute.forPath("/deployment/index.js"),
        )
    }

    @Test
    fun `a path that merely starts with deployment stays in the bpmn bundle`() {
        assertEquals(
            "/webview/deployment-icon.svg",
            (WebviewRoute.forPath("/deployment-icon.svg") as WebviewRoute.ClasspathAsset).resourcePath,
        )
    }

    @Test
    fun `percent-encoded paths are decoded before the classpath lookup`() {
        assertEquals(
            "/webview/fonts/my font.woff2",
            (WebviewRoute.forPath("/fonts/my%20font.woff2") as WebviewRoute.ClasspathAsset).resourcePath,
        )
    }

    @ParameterizedTest
    @CsvSource(
        "/a.js, text/javascript; charset=utf-8",
        "/a.mjs, text/javascript; charset=utf-8",
        "/a.css, text/css; charset=utf-8",
        "/a.html, text/html; charset=utf-8",
        "/a.json, application/json; charset=utf-8",
        "/a.svg, image/svg+xml",
        "/a.woff2, font/woff2",
        "/a.woff, font/woff",
        "/a.ttf, font/ttf",
        "/a.eot, application/vnd.ms-fontobject",
        "/a.ico, image/x-icon",
        "/a.png, image/png",
        "/A.PNG, image/png",
        "/a.wasm, application/octet-stream",
        "/no-extension, application/octet-stream",
    )
    fun `assets carry the mime type of their extension`(path: String, expectedMimeType: String) {
        assertEquals(expectedMimeType, (WebviewRoute.forPath(path) as WebviewRoute.ClasspathAsset).mimeType)
    }
}
