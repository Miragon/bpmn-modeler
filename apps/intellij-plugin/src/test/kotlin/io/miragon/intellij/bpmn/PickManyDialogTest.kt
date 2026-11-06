package io.miragon.intellij.bpmn

import com.intellij.openapi.ui.DialogWrapper
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import javax.swing.JCheckBox

@TestApplication
class PickManyDialogTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val items =
        listOf(
            HostPicker.PickItem(0, "https://github.com/acme/shared", "All my projects"),
            HostPicker.PickItem(1, "/work/templates", "This project"),
            HostPicker.PickItem(2, "/work/other", null),
        )

    @Test
    fun `offers every item as an unchecked checkbox, so a click on a row picks nothing yet`() {
        runInEdtAndWait {
            val list = PickManyList(items)

            assertEquals(items.map { it.label }, checkBoxes(list).map { it.text })
            assertEquals(listOf(false, false, false), checkBoxes(list).map { it.isSelected })
            assertEquals(emptyList<Int>(), list.checkedIndices())
        }
    }

    @Test
    fun `answers the indices of the checked items in their order`() {
        runInEdtAndWait {
            val list = PickManyList(items)

            list.component.setItemSelected(items[2], true)
            list.component.setItemSelected(items[0], true)

            assertEquals(listOf(0, 2), list.checkedIndices())
        }
    }

    @Test
    fun `builds the dialog with the core's title over the checkbox list`() {
        runInEdtAndWait {
            val dialog = PickManyDialog(projectFixture.get(), "Remove Template Marketplace", "Select marketplaces to remove", items)
            try {
                assertEquals("Remove Template Marketplace", dialog.title)
            } finally {
                dialog.close(DialogWrapper.CANCEL_EXIT_CODE)
            }
        }
    }

    private fun checkBoxes(list: PickManyList): List<JCheckBox> =
        (0 until list.component.model.size).map { list.component.model.getElementAt(it) }
}
