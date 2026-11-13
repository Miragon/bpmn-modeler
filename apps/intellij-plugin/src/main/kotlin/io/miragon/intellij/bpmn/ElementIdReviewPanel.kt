package io.miragon.intellij.bpmn

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckboxTreeListener
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath

/**
 * The element ID review as a checkbox tree, the IntelliJ counterpart of VS
 * Code's review panel: the core's groups and rows under its message, with
 * Apply and Discard in the toolbar. Checkboxes, a selected row and both
 * actions go to [actions], and the core answers with the next view.
 */
internal class ElementIdReviewPanel(
    private val actions: ElementIdReviewActions,
    // A seam for tests: the checkbox changes of one click go out together on the next EDT turn.
    private val later: (Runnable) -> Unit = { ApplicationManager.getApplication().invokeLater(it) },
) : SimpleToolWindowPanel(true, true) {
    private val message = JBLabel().apply { border = JBUI.Borders.empty(4, 8) }
    private val root = CheckedTreeNode(null)
    internal val tree = CheckboxTree(RowRenderer(), root)

    // Groups the user collapsed; a group starts as the core says, then as the user left it.
    private val collapsedGroups = mutableSetOf<String>()
    private val knownGroups = mutableSetOf<String>()
    private val pendingChecks = linkedMapOf<String, Boolean>()
    private var rebuilding = false

    internal var view: ElementIdReviewView? = null
        private set

    internal val applyAction: AnAction =
        object : DumbAwareAction("Apply ID Changes", "Rename the checked elements in one undo step", AllIcons.Actions.Commit) {
            override fun getActionUpdateThread() = ActionUpdateThread.EDT

            override fun update(event: AnActionEvent) {
                event.presentation.isEnabled = (view?.renameCount ?: 0) > 0
            }

            override fun actionPerformed(event: AnActionEvent) = actions.apply()
        }

    internal val discardAction: AnAction =
        object : DumbAwareAction("Discard ID Changes", "Close the review and keep every ID", AllIcons.Actions.Cancel) {
            override fun getActionUpdateThread() = ActionUpdateThread.EDT

            override fun update(event: AnActionEvent) {
                event.presentation.isEnabled = view != null
            }

            override fun actionPerformed(event: AnActionEvent) = actions.discard()
        }

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.addCheckboxTreeListener(
            object : CheckboxTreeListener {
                override fun nodeStateChanged(node: CheckedTreeNode) {
                    val row = node.userObject as? ElementIdReviewRow ?: return
                    if (rebuilding) return
                    if (pendingChecks.isEmpty()) later.invoke(Runnable(::sendPendingChecks))
                    pendingChecks[row.id] = node.isChecked
                }
            },
        )
        tree.addTreeExpansionListener(
            object : TreeExpansionListener {
                override fun treeExpanded(event: TreeExpansionEvent) {
                    groupAt(event.path)?.let { collapsedGroups -= it.id }
                }

                override fun treeCollapsed(event: TreeExpansionEvent) {
                    if (!rebuilding) groupAt(event.path)?.let { collapsedGroups += it.id }
                }
            },
        )
        tree.addTreeSelectionListener {
            if (!rebuilding) selectedRow()?.let { actions.reveal(it.revealId) }
        }
        val content = JPanel(BorderLayout())
        content.add(message, BorderLayout.NORTH)
        content.add(ScrollPaneFactory.createScrollPane(tree), BorderLayout.CENTER)
        setContent(content)
        val toolbar =
            ActionManager.getInstance().createActionToolbar("ElementIdReview", DefaultActionGroup(applyAction, discardAction), true)
        toolbar.targetComponent = tree
        setToolbar(toolbar.component)
    }

    fun show(next: ElementIdReviewView) {
        view = next
        message.text = next.message
        val selectedId = selectedRow()?.id
        rebuilding = true
        try {
            root.removeAllChildren()
            for (group in next.groups) {
                if (knownGroups.add(group.id) && group.collapsed) collapsedGroups += group.id
                val groupNode = nodeOf(group, group.checked)
                group.rows.forEach { groupNode.add(nodeOf(it, it.checked)) }
                root.add(groupNode)
            }
            (tree.model as DefaultTreeModel).reload()
            for (groupNode in root.children().toList()) {
                val group = (groupNode as DefaultMutableTreeNode).userObject as ElementIdReviewGroup
                if (group.id !in collapsedGroups) tree.expandPath(TreePath(arrayOf(root, groupNode)))
                if (selectedId != null) {
                    groupNode.children().toList().firstOrNull { (it as DefaultMutableTreeNode).rowId() == selectedId }?.let {
                        tree.selectionPath = TreePath(arrayOf(root, groupNode, it))
                    }
                }
            }
        } finally {
            rebuilding = false
        }
    }

    fun clear() {
        view = null
        message.text = ""
        pendingChecks.clear()
        rebuilding = true
        try {
            root.removeAllChildren()
            (tree.model as DefaultTreeModel).reload()
        } finally {
            rebuilding = false
        }
    }

    private fun sendPendingChecks() {
        val checks = pendingChecks.toMap()
        pendingChecks.clear()
        // Unchecked first, as VS Code's panel sends a click on a group.
        for (checked in listOf(false, true)) {
            val ids = checks.filterValues { it == checked }.keys.toList()
            if (ids.isNotEmpty()) actions.setChecked(ids, checked)
        }
    }

    private fun selectedRow(): ElementIdReviewRow? = (tree.lastSelectedPathComponent as? DefaultMutableTreeNode)?.userObject as? ElementIdReviewRow

    private fun groupAt(path: TreePath): ElementIdReviewGroup? = (path.lastPathComponent as? DefaultMutableTreeNode)?.userObject as? ElementIdReviewGroup

    private fun DefaultMutableTreeNode.rowId(): String? = (userObject as? ElementIdReviewRow)?.id

    // A node without a checkbox is a plain one: the tree draws a checkbox only for a CheckedTreeNode.
    private fun nodeOf(item: Any, checked: Boolean?): DefaultMutableTreeNode =
        if (checked == null) DefaultMutableTreeNode(item) else CheckedTreeNode(item).apply { isChecked = checked }

    private class RowRenderer : CheckboxTree.CheckboxTreeCellRenderer() {
        override fun customizeRenderer(
            tree: JTree,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean,
        ) {
            toolTipText = null
            when (val item = (value as? DefaultMutableTreeNode)?.userObject) {
                is ElementIdReviewGroup -> {
                    textRenderer.append(item.label)
                    textRenderer.append("  ${item.rows.size}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
                is ElementIdReviewRow -> {
                    textRenderer.append(item.label)
                    textRenderer.append("  ${item.description}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    toolTipText = item.tooltip
                }
            }
        }
    }
}
