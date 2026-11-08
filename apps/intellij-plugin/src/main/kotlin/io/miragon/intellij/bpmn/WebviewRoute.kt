package io.miragon.intellij.bpmn

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/** What [WebviewServer] answers for one request path. */
internal sealed interface WebviewRoute {
    data object BpmnShell : WebviewRoute

    data object DeploymentShell : WebviewRoute

    data object TemplatePreviewShell : WebviewRoute

    data class ClasspathAsset(val resourcePath: String, val mimeType: String) : WebviewRoute

    /** A file of an approved workspace plugin in the bridge's content-addressed cache. */
    data class PluginAsset(val hash: String, val fileName: String) : WebviewRoute

    data object NotFound : WebviewRoute

    companion object {
        private const val PLUGIN_PREFIX = "/bpmn-plugins/"

        // Matched before decoding, so no escape can smuggle a separator or a dot segment past it.
        private val PLUGIN_ASSET_PATH = Regex("^/bpmn-plugins/([0-9a-f]{64})/(plugin\\.js|plugin\\.css)$")

        /** [requestPath] is the raw, still percent-encoded path. */
        fun forPath(requestPath: String): WebviewRoute {
            if (requestPath == "/" || requestPath == "/index.html") return BpmnShell
            if (requestPath == "/deployment.html") return DeploymentShell
            if (requestPath == "/templatePreview.html") return TemplatePreviewShell
            if (requestPath.startsWith(PLUGIN_PREFIX)) {
                val match = PLUGIN_ASSET_PATH.matchEntire(requestPath) ?: return NotFound
                return PluginAsset(match.groupValues[1], match.groupValues[2])
            }

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

        fun mimeTypeOf(path: String): String =
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
