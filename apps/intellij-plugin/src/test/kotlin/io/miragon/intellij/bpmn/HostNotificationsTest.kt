package io.miragon.intellij.bpmn

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.junit5.RunInEdt
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@TestApplication
@RunInEdt(writeIntent = true)
class HostNotificationsTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val answers = mutableListOf<Int?>()

    private fun notice(tone: ActionNoticeTone = ActionNoticeTone.INFO): Notification =
        HostNotifications(projectFixture.get()).actionNotice(tone, MESSAGE, LABELS) { answers += it }

    @Test
    fun `an action notice shows the core's message with one action per label in its group`() {
        val notification = notice()

        assertEquals("Miragon BPMN Modeler", notification.groupId)
        assertEquals(MESSAGE, notification.content)
        assertEquals(NotificationType.INFORMATION, notification.type)
        assertEquals(LABELS, notification.actions.map { it.templateText })
    }

    @Test
    fun `a warning notice shows as a warning`() {
        assertEquals(NotificationType.WARNING, notice(ActionNoticeTone.WARNING).type)
    }

    @Test
    fun `a chosen action answers its index once and expires the notice`() {
        val notification = notice()

        Notification.fire(notification, notification.actions[1], SimpleDataContext.getSimpleContext(Notification.KEY, notification))
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(listOf<Int?>(1), answers)
        assertTrue(notification.isExpired)
    }

    @Test
    fun `a notice that expires unanswered answers without a choice`() {
        val notification = notice()

        notification.expire()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(listOf<Int?>(null), answers)
    }

    private companion object {
        const val MESSAGE = "The workspace holds a new bpmn-js plugin."
        val LABELS = listOf("Review…", "Not now")
    }
}
