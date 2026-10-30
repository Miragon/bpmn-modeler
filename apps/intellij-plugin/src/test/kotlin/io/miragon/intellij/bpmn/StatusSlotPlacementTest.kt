package io.miragon.intellij.bpmn

import com.intellij.openapi.wm.StatusBarWidgetFactory
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

/**
 * Pins the host to the core's status unions in `statusView.ts`: every slot the
 * core shows has a widget, and every icon, tone and action it sends has a
 * Kotlin value. The router logs and drops what it does not know, so without
 * this a new core value would vanish silently in IntelliJ.
 */
class StatusSlotPlacementTest {
    private val coreStatusTypes: String by lazy {
        val path =
            requireNotNull(System.getProperty("miragon.statusViewTypes")) {
                "miragon.statusViewTypes is unset; run the test through Gradle"
            }
        Files.readString(Path.of(path))
    }

    private val pluginXml: String by lazy {
        requireNotNull(javaClass.getResource("/META-INF/plugin.xml")) { "plugin.xml is not on the test classpath" }.readText()
    }

    private fun coreUnion(typeName: String): Set<String> {
        val union =
            requireNotNull(Regex("""export type $typeName =([^;]+);""").find(coreStatusTypes)) {
                "statusView.ts declares no union $typeName"
            }.groupValues[1]
        return Regex(""""(\w+)"""").findAll(union).map { it.groupValues[1] }.toSet()
    }

    private fun widgetFactoriesById(): Map<String, String> =
        Regex("""<statusBarWidgetFactory\s+id="([^"]+)"\s+implementation="([^"]+)"""")
            .findAll(pluginXml)
            .associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `places every status slot the core shows`() {
        val unplaced = coreUnion("StatusSlot").filter { wireValueOf<StatusSlot>(it) == null }

        assertEquals(emptyList<String>(), unplaced, "core status slots without a Kotlin slot")
    }

    @Test
    fun `registers a status bar widget for every slot`() {
        val factories = widgetFactoriesById()
        val unregistered = StatusSlot.entries.filter { widgetIdFor(it) !in factories }

        assertEquals(emptyList<StatusSlot>(), unregistered, "slots whose widget plugin.xml does not register")
    }

    @Test
    fun `gives every widget factory the id plugin xml registers it under`() {
        val reportedIds =
            widgetFactoriesById().mapValues { (_, implementation) ->
                (Class.forName(implementation).getDeclaredConstructor().newInstance() as StatusBarWidgetFactory).id
            }

        assertEquals(reportedIds.keys.associateWith { it }, reportedIds)
    }

    @Test
    fun `knows every icon, tone and action the core sends`() {
        assertEquals(coreUnion("StatusIcon"), StatusIcon.entries.map { it.wireName }.toSet())
        assertEquals(coreUnion("StatusTone"), StatusTone.entries.map { it.wireName }.toSet())
        assertEquals(coreUnion("StatusAction"), StatusAction.entries.map { it.wireName }.toSet())
    }
}
