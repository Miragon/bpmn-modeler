package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.CheckedTreeNode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreePath

@TestApplication
class ElementIdReviewPanelTest {
    private class RecordingActions : ElementIdReviewActions {
        val calls = mutableListOf<String>()

        override fun setChecked(ids: List<String>, checked: Boolean) {
            calls += "setChecked $ids $checked"
        }

        override fun apply() {
            calls += "apply"
        }

        override fun discard() {
            calls += "discard"
        }

        override fun reveal(elementId: String) {
            calls += "reveal $elementId"
        }
    }

    private val actions = RecordingActions()
    private val scheduled = mutableListOf<Runnable>()

    private fun row(id: String, checked: Boolean?) =
        ElementIdReviewRow(id, "Name of $id", "$id → new_$id", "Tooltip of $id", checked, "${id}_shown")

    private val view =
        ElementIdReviewView(
            title = "order.bpmn",
            message = "1 of 2 IDs will change.",
            renameCount = 1,
            groups =
                listOf(
                    ElementIdReviewGroup("activity", "Activities", false, false, listOf(row("Activity_1", true), row("Activity_2", false))),
                    ElementIdReviewGroup("matches", "Already match", null, true, listOf(row("flow_yes", null))),
                ),
        )

    private fun panel(): ElementIdReviewPanel = ElementIdReviewPanel(actions) { scheduled += it }

    private fun ElementIdReviewPanel.groupNodes(): List<DefaultMutableTreeNode> =
        (tree.model.root as DefaultMutableTreeNode).children().toList().map { it as DefaultMutableTreeNode }

    private fun DefaultMutableTreeNode.rowNodes(): List<DefaultMutableTreeNode> = children().toList().map { it as DefaultMutableTreeNode }

    private fun path(vararg nodes: DefaultMutableTreeNode) = TreePath(arrayOf(nodes.first().root, *nodes))

    private fun event(action: AnAction) = AnActionEvent.createFromAnAction(action, null, ActionPlaces.UNKNOWN, DataContext.EMPTY_CONTEXT)

    private fun isEnabled(action: AnAction): Boolean = event(action).also(action::update).presentation.isEnabled

    private fun perform(action: AnAction) = action.actionPerformed(event(action))

    @Test
    fun `shows the groups and rows with a checkbox only where a row can change`() =
        runInEdtAndWait {
            val panel = panel()

            panel.show(view)

            val (activities, matches) = panel.groupNodes()
            assertTrue(activities is CheckedTreeNode)
            assertFalse((activities as CheckedTreeNode).isChecked)
            assertEquals(listOf(true, false), activities.rowNodes().map { (it as CheckedTreeNode).isChecked })
            assertFalse(matches is CheckedTreeNode)
            assertFalse(matches.rowNodes().single() is CheckedTreeNode)
        }

    @Test
    fun `expands the groups the core leaves open and keeps the user's choice across views`() =
        runInEdtAndWait {
            val panel = panel()
            panel.show(view)
            val (activities, matches) = panel.groupNodes()
            assertTrue(panel.tree.isExpanded(path(activities)))
            assertFalse(panel.tree.isExpanded(path(matches)))

            panel.tree.collapsePath(path(activities))
            panel.show(view)

            assertFalse(panel.tree.isExpanded(path(panel.groupNodes()[0])))
        }

    @Test
    fun `sends the checkbox changes of one click together, a group's as its rows`() =
        runInEdtAndWait {
            val panel = panel()
            panel.show(view)
            val activities = panel.groupNodes()[0] as CheckedTreeNode

            panel.tree.setNodeState(activities, true)
            panel.tree.setNodeState(activities.rowNodes()[0] as CheckedTreeNode, false)
            assertEquals(1, scheduled.size)
            scheduled.single().run()

            assertEquals(listOf("setChecked [Activity_1] false", "setChecked [Activity_2] true"), actions.calls)
        }

    @Test
    fun `reveals a row the user selects, and not when a new view keeps it selected`() =
        runInEdtAndWait {
            val panel = panel()
            panel.show(view)
            val activities = panel.groupNodes()[0]

            panel.tree.selectionPath = path(activities, activities.rowNodes()[1])
            panel.show(view)

            assertEquals(listOf("reveal Activity_2_shown"), actions.calls)
            assertEquals("Activity_2", ((panel.tree.lastSelectedPathComponent as DefaultMutableTreeNode).userObject as ElementIdReviewRow).id)
        }

    @Test
    fun `offers Apply only while an ID would change and hands both actions to the core`() =
        runInEdtAndWait {
            val panel = panel()
            panel.show(view.copy(renameCount = 0))
            assertFalse(isEnabled(panel.applyAction))

            panel.show(view)
            assertTrue(isEnabled(panel.applyAction))
            perform(panel.applyAction)
            perform(panel.discardAction)

            assertEquals(listOf("apply", "discard"), actions.calls)
        }

    @Test
    fun `empties the tree once the review is over`() =
        runInEdtAndWait {
            val panel = panel()
            panel.show(view)

            panel.clear()

            assertEquals(emptyList<DefaultMutableTreeNode>(), panel.groupNodes())
            assertNull(panel.view)
            assertFalse(isEnabled(panel.discardAction))
        }
}
