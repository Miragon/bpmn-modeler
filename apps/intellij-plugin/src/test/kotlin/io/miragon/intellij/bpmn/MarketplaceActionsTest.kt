package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Test

@TestApplication
class MarketplaceActionsTest {
    @Test
    fun `registers the add, update and remove actions under Tools with their menu texts`() {
        runInEdtAndWait {
            val actions = ActionManager.getInstance()
            val add = actions.getAction("io.miragon.bpmn-modeler.addMarketplace")
            val update = actions.getAction("io.miragon.bpmn-modeler.updateMarketplaces")
            val remove = actions.getAction("io.miragon.bpmn-modeler.removeMarketplace")

            assertInstanceOf(AddMarketplaceAction::class.java, add)
            assertInstanceOf(UpdateMarketplacesAction::class.java, update)
            assertInstanceOf(RemoveMarketplaceAction::class.java, remove)
            assertEquals(
                listOf("Add Template Marketplace…", "Update Template Marketplaces", "Remove Template Marketplace…"),
                listOf(add, update, remove).map { it.templatePresentation.text },
            )
        }
    }
}
