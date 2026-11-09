package io.miragon.intellij.bpmn

/**
 * Reports whether one tool window content is shown, and only when that changes,
 * so an unrelated tool window event never re-sends the same state.
 */
internal class VisibilityLatch(private var shown: Boolean, private val onChange: (Boolean) -> Unit) {
    fun update(toolWindowVisible: Boolean, contentSelected: Boolean) {
        val nowShown = toolWindowVisible && contentSelected
        if (nowShown == shown) return
        shown = nowShown
        onChange(nowShown)
    }
}
