package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.JList
import javax.swing.ListSelectionModel

/**
 * Renders the core's `PickerPort` as a native list popup (`JBPopup`). The host
 * owns only the UI: it shows the items the core supplied and reports back the
 * chosen indices, or `null` when the user dismissed the popup.
 *
 * The cancel-vs-throw convention stays core-side (TypeScript `RpcPicker`), so
 * this object is deliberately domain-agnostic — it never maps a choice to an
 * engine, scope, or path, only to the index the core handed it.
 */
object HostPicker {
    /** One offered row, carrying its original index so callbacks can report it. */
    data class PickItem(val index: Int, val label: String, val description: String?)

    /**
     * Shows the chooser centered in the project window and invokes [onResult]
     * exactly once: the chosen indices on confirmation, or `null` on dismissal.
     * Must be called on the EDT.
     *
     * Confirm and cancel are told apart by [LightweightWindowEvent.isOk], not by
     * callback ordering. On the OK path `AbstractPopup.closeOk` fires
     * `onClosed` *before* the item-chosen callback (the latter runs from the
     * popup's deferred final-runnable), so reading the choice inside `onClosed`
     * always sees nothing. Instead the item-chosen callback reports the
     * selection, and `onClosed` reports `null` only for a non-OK close (Esc /
     * click-away). An [AtomicBoolean] guarantees exactly one [onResult].
     */
    fun show(
        project: Project,
        title: String?,
        placeholder: String,
        canPickMany: Boolean,
        items: List<PickItem>,
        onResult: (List<Int>?) -> Unit,
    ) {
        val reported = AtomicBoolean(false)
        fun report(result: List<Int>?) {
            if (reported.compareAndSet(false, true)) onResult(result)
        }

        val builder =
            JBPopupFactory.getInstance()
                .createPopupChooserBuilder(items)
                .setTitle(title ?: placeholder)
                .setRenderer(
                    object : ColoredListCellRenderer<PickItem>() {
                        override fun customizeCellRenderer(
                            list: JList<out PickItem>,
                            value: PickItem,
                            index: Int,
                            selected: Boolean,
                            hasFocus: Boolean,
                        ) {
                            append(value.label)
                            // The detail (full path, extension) disambiguates rows
                            // that share a basename; greyed so the label stays primary.
                            value.description?.let {
                                append("  $it", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                            }
                        }
                    },
                )

        if (canPickMany) {
            builder.setSelectionMode(ListSelectionModel.MULTIPLE_INTERVAL_SELECTION)
            builder.setItemsChosenCallback { set -> report(set.map { it.index }.sorted()) }
        } else {
            builder.setItemChosenCallback { item -> report(listOf(item.index)) }
        }

        val popup = builder.createPopup()
        popup.addListener(
            object : JBPopupListener {
                override fun onClosed(event: LightweightWindowEvent) {
                    // The OK path reports via the item-chosen callback (which runs
                    // after this); only a non-OK close is a real cancellation.
                    if (!event.isOk) report(null)
                }
            },
        )
        popup.showCenteredInCurrentWindow(project)
    }
}
