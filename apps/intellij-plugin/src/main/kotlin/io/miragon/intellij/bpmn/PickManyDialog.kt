package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CheckBoxList
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

/** One checkbox per offered item, none checked; the row's description shows greyed beside it. */
internal class PickManyList(private val items: List<HostPicker.PickItem>) {
    val component: CheckBoxList<HostPicker.PickItem> =
        object : CheckBoxList<HostPicker.PickItem>() {
            override fun getSecondaryText(index: Int): String? = getItemAt(index)?.description
        }.apply { setItems(items) { it.label } }

    fun checkedIndices(): List<Int> = items.filter { component.isItemSelected(it) }.map { it.index }
}

/**
 * Asks for several items with checkboxes and OK, because in a list popup a
 * plain click or Enter chooses the row at once, and a removal or a deploy must
 * not run on one stray click.
 */
internal class PickManyDialog(
    project: Project,
    title: String?,
    private val placeholder: String,
    items: List<HostPicker.PickItem>,
) : DialogWrapper(project) {
    private val list = PickManyList(items)
    private val showsPlaceholderAsTitle = title == null

    init {
        this.title = title ?: placeholder
        init()
    }

    override fun createCenterPanel(): JComponent =
        panel {
            if (!showsPlaceholderAsTitle) {
                row { label(placeholder) }
            }
            row { scrollCell(list.component).align(Align.FILL) }.resizableRow()
        }

    override fun getPreferredFocusedComponent(): JComponent = list.component

    /** The checked indices on OK, empty when none was checked; null on cancel. */
    fun ask(): List<Int>? = if (showAndGet()) list.checkedIndices() else null
}
