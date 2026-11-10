package io.miragon.intellij.bpmn

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64

/**
 * The Content-Security-Policy headers [WebviewServer] sends with its HTML shells.
 *
 * `script-src` allows the bundle (`'self'`, which also covers the lazily loaded
 * chunks) and the inline [ACQUIRE_VS_CODE_API_SHIM] by hash; the shim is a
 * constant, so its hash is too. `style-src` stays `'unsafe-inline'` without a
 * nonce or hash: `#ide-theme-vars` is computed per request and rewritten live,
 * and Chromium ignores `'unsafe-inline'` once a nonce or hash is listed. The JCEF
 * bridge runs through `executeJavaScript`, which a page policy does not govern.
 */
internal object WebviewContentSecurityPolicy {
    /**
     * The `acquireVsCodeApi()` shim. Runs as a classic (non-module) script so
     * the global exists before the deferred ES module calls `getVsCodeApi()` at
     * top level. Outgoing messages are buffered until the JVM installs its sink
     * via `__modelerSetSink`, because the module may post before the host
     * callback is injected (which only happens on `onLoadEnd`).
     *
     * The page's wiring is single-use: `__modelerSetSink` deletes itself on
     * its first call, before any plugin script arrives, and
     * `acquireVsCodeApi()` hands out its frozen API once, as VS Code does, to
     * the page's own bootstrap. That stops accidental reuse, not an approved
     * plugin, which has the page's full authority (see [WebviewSinkScript]).
     */
    val ACQUIRE_VS_CODE_API_SHIM =
        listOf(
            "(function () {",
            "  var outbox = [];",
            "  var sink = null;",
            "  var state = {};",
            "  var acquired = false;",
            "  function flush() {",
            "    if (!sink) return;",
            "    while (outbox.length) { sink(outbox.shift()); }",
            "  }",
            "  Object.defineProperty(window, \"__modelerSetSink\", {",
            "    configurable: true,",
            "    value: function (fn) { delete window.__modelerSetSink; sink = fn; flush(); }",
            "  });",
            "  window.acquireVsCodeApi = function () {",
            "    if (acquired) throw new Error(\"An instance of the VS Code API has already been acquired\");",
            "    acquired = true;",
            "    return Object.freeze({",
            "      postMessage: function (msg) { outbox.push(JSON.stringify(msg)); flush(); },",
            "      getState: function () { return state; },",
            "      setState: function (s) { state = s; return s; }",
            "    });",
            "  };",
            "})();",
        ).joinToString("\n")

    private val shimHashSource = "'sha256-${sha256Base64(ACQUIRE_VS_CODE_API_SHIM)}'"

    // Element-template icons may be remote `https:` URLs; the deployment form shows none.
    val BPMN_SHELL = policy(imageSources = "'self' data: https:", fontSources = "'self' data:")

    val DEPLOYMENT_SHELL = policy(imageSources = "'self' data:", fontSources = "'self' data:")

    // The add-ons page loads only the fonts its bundle ships and no image, which `default-src 'none'` refuses.
    val ADD_ONS_SHELL = policy(imageSources = null, fontSources = "'self'")

    private fun policy(imageSources: String?, fontSources: String?): String =
        listOfNotNull(
            "default-src 'none'",
            "script-src 'self' $shimHashSource",
            "style-src 'self' 'unsafe-inline'",
            imageSources?.let { "img-src $it" },
            fontSources?.let { "font-src $it" },
            "base-uri 'none'",
            "form-action 'none'",
        ).joinToString("; ")

    private fun sha256Base64(text: String): String =
        Base64.getEncoder().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(text.toByteArray(StandardCharsets.UTF_8)),
        )
}
