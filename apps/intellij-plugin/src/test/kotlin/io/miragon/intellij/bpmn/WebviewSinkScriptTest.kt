package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class WebviewSinkScriptTest {
    @Test
    fun `installs a sink that holds the query function it captured once`() {
        assertEquals(
            "(function (query) { " +
                "if (typeof window.__modelerSetSink !== 'function') return; " +
                "window.__modelerSetSink(function (p) { " +
                "query.call(window, {request: '' + p, onSuccess: function () {}, onFailure: function () {}}); " +
                "}); " +
                "})(window['cefQuery_2_7']);",
            WebviewSinkScript.install("cefQuery_2_7"),
        )
    }

    @Test
    fun `refuses a query function name that could break out of the script`() {
        assertThrows<IllegalArgumentException> { WebviewSinkScript.install("x']); alert(1); (['") }
    }
}
