package io.miragon.intellij.bpmn

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/** What [WebviewServer] answers for one request path. */
internal sealed interface WebviewRoute {
    data object BpmnShell : WebviewRoute

    data object DeploymentShell : WebviewRoute

    data object TemplatePreviewShell : WebviewRoute

    data class ClasspathAsset(val resourcePath: String, val mimeType: String) : WebviewRoute

    companion object {
        fun forPath(requestPath: String): WebviewRoute {
            if (requestPath == "/" || requestPath == "/index.html") return BpmnShell
            if (requestPath == "/deployment.html") return DeploymentShell
            if (requestPath == "/templatePreview.html") return TemplatePreviewShell

            // The two bundles live under distinct classpath roots; the
            // `/deployment/...` request prefix maps to `/webview-deployment/...`,
            // everything else to the bpmn bundle's `/webview/...`.
            val decoded = URLDecoder.decode(requestPath, StandardCharsets.UTF_8)
            val resourcePath =
                if (decoded.startsWith("/deployment/")) {
                    "/webview-deployment" + decoded.removePrefix("/deployment")
                } else {
                    "/webview$decoded"
                }
            return ClasspathAsset(resourcePath, mimeTypeOf(requestPath))
        }

        private fun mimeTypeOf(path: String): String =
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
    }
}
