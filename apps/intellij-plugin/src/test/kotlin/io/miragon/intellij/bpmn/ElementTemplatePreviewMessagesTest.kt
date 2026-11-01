package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ElementTemplatePreviewMessagesTest {
    @Test
    fun `hands the page the file with the locale to render it in`() {
        val query = JsonParser.parseString(ElementTemplatePreviewMessages.fileQuery("{\"a\":\"<b>\"}", "de")).asJsonObject

        assertEquals("ElementTemplateFileQuery", query.get("type").asString)
        assertEquals("{\"a\":\"<b>\"}", query.get("content").asString)
        assertEquals(0, query.get("documentRevision").asInt)
        assertEquals("de", query.get("locale").asString)
    }

    @Test
    fun `tells the page a new language`() {
        val query = JsonParser.parseString(ElementTemplatePreviewMessages.languageQuery("fr")).asJsonObject

        assertEquals("LanguageQuery", query.get("type").asString)
        assertEquals("fr", query.get("locale").asString)
    }

    @Test
    fun `reads what the page sends`() {
        val message = ElementTemplatePreviewMessages.parse("""{"type":"LogErrorCommand","log":"boom"}""")

        assertEquals(ElementTemplatePreviewMessages.PageMessage("LogErrorCommand", "boom"), message)
        assertEquals(
            ElementTemplatePreviewMessages.PageMessage("GetElementTemplateFileCommand", null),
            ElementTemplatePreviewMessages.parse("""{"type":"GetElementTemplateFileCommand"}"""),
        )
    }

    @Test
    fun `ignores what is not a page message`() {
        assertNull(ElementTemplatePreviewMessages.parse("not json"))
        assertNull(ElementTemplatePreviewMessages.parse("[]"))
        assertNull(ElementTemplatePreviewMessages.parse("""{"log":"no type"}"""))
    }
}
