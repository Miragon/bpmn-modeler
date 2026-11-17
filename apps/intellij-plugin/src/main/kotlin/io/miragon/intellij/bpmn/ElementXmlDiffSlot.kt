package io.miragon.intellij.bpmn

/** One element's XML from both sides of a diagram diff, as the core computed it. */
internal data class ElementXmlDiffContent(val title: String, val before: String, val after: String)

/** Where a diagram diff shows its element XML diff. */
internal interface ElementXmlDiffPanel {
    /** Opens it, or replaces what it shows. */
    fun show(content: ElementXmlDiffContent)

    fun hide()
}

/**
 * The element XML diff inside one diagram diff, under the core's key for it.
 * The core's key changes when the diagram diff is reopened (a swap), so a
 * refresh or close of an older key is late and ignored. Runs on the EDT, where
 * the user's close also runs, so a refresh queued before that close cannot
 * reopen the panel.
 */
internal class ElementXmlDiffSlot(
    private val panel: ElementXmlDiffPanel,
    private val onClosedByUser: (diffKey: String) -> Unit,
) {
    private var shownKey: String? = null

    fun show(diffKey: String, content: ElementXmlDiffContent) {
        shownKey = diffKey
        panel.show(content)
    }

    fun refresh(diffKey: String, content: ElementXmlDiffContent) {
        if (diffKey == shownKey) panel.show(content)
    }

    fun close(diffKey: String) {
        if (diffKey != shownKey) return
        shownKey = null
        panel.hide()
    }

    fun closeByUser() {
        val diffKey = shownKey ?: return
        shownKey = null
        panel.hide()
        onClosedByUser(diffKey)
    }
}
