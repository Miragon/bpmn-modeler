package io.miragon.intellij.bpmn

/**
 * The script that hands a page's shim the JVM sink. It reads the `JBCefJSQuery`
 * function once, and the shim drops its setter after the first call, so a later
 * script cannot swap the sink. This is no boundary against a plugin in the
 * page: CEF's message router keeps the function on `window` in every context,
 * so the plugin can call it itself. Approval is the control.
 */
internal object WebviewSinkScript {
    private val JS_IDENTIFIER = Regex("^[A-Za-z_$][A-Za-z0-9_$]*$")

    fun install(queryFunctionName: String): String {
        require(JS_IDENTIFIER.matches(queryFunctionName)) { "Not a JavaScript identifier: $queryFunctionName" }
        return "(function (query) { " +
            "if (typeof window.__modelerSetSink !== 'function') return; " +
            "window.__modelerSetSink(function (p) { " +
            "query.call(window, {request: '' + p, onSuccess: function () {}, onFailure: function () {}}); " +
            "}); " +
            "})(window['$queryFunctionName']);"
    }
}
