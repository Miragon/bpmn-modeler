package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Runs `elementTemplatePreviewMessages.cases.json`, which `libs/shared` pins to its message classes. */
class ElementTemplatePreviewMessagesTest {
    private val messages = readTypeScriptJson("miragon.elementTemplatePreviewMessages").asJsonObject

    @Test
    fun `hands the page the file with the locale to render it in`() {
        val expected = messages.getAsJsonObject("fileQuery")

        val query = ElementTemplatePreviewMessages.fileQuery(expected.get("content").asString, expected.get("locale").asString)

        assertEquals(expected, JsonParser.parseString(query))
    }

    @Test
    fun `tells the page a new language`() {
        val expected = messages.getAsJsonObject("languageQuery")

        val query = ElementTemplatePreviewMessages.languageQuery(expected.get("locale").asString)

        assertEquals(expected, JsonParser.parseString(query))
    }

    @Test
    fun `reads what the page sends`() {
        assertEquals(
            ElementTemplatePreviewMessages.PageMessage(ElementTemplatePreviewMessages.GET_FILE, null),
            ElementTemplatePreviewMessages.parse(messages.get("getFile").toString()),
        )
        assertEquals(
            ElementTemplatePreviewMessages.PageMessage(ElementTemplatePreviewMessages.LOG_ERROR, "boom"),
            ElementTemplatePreviewMessages.parse(messages.get("logError").toString()),
        )
    }

    @Test
    fun `ignores what is not a page message`() {
        assertNull(ElementTemplatePreviewMessages.parse("not json"))
        assertNull(ElementTemplatePreviewMessages.parse("[]"))
        assertNull(ElementTemplatePreviewMessages.parse("""{"message":"no type"}"""))
    }
}
