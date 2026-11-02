package io.miragon.intellij.bpmn

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive

/** The engines an element template is written for, as the core names and labels them. */
enum class TemplateEngine(val id: String, val label: String, val schemaUrl: String) {
    C7("c7", "Camunda 7", "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json"),
    C8("c8", "Camunda 8", "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json"),
}

/**
 * Kotlin copy of `newElementTemplate` in the core: IntelliJ creates template files
 * without a bridge session. `NewElementTemplatesTest` runs the core's
 * `newElementTemplate.cases.json` rows against it, so a stub change edits both.
 */
internal object NewElementTemplates {
    data class Identity(val id: String, val name: String)

    const val ENGINE_PLACEHOLDER = "Select the engine the element template is for."

    private const val FALLBACK_ID = "new-element-template"
    private val PRETTY = GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create()

    // Spelled out to match JavaScript: `\s` is ASCII-only here, `Char.isWhitespace` takes other
    // characters, and IGNORE_CASE also folds `ſ` to `s`.
    private const val JS_SPACE = """\t\n\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"""
    private val JSON_SUFFIX = Regex("""\.[jJ][sS][oO][nN]\z""")
    private val OUTER_SPACE = Regex("""^[$JS_SPACE]+|[$JS_SPACE]+\z""")
    private val INNER_SPACE = Regex("""[$JS_SPACE]+""")

    fun identity(fileName: String): Identity {
        val id =
            fileName.replace(JSON_SUFFIX, "")
                .replace(OUTER_SPACE, "")
                .replace(INNER_SPACE, "-")
                .ifEmpty { FALLBACK_ID }
        val words =
            id.substring(id.lastIndexOf('.') + 1)
                .replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
                .split(Regex("""[-_\s]+"""))
                .filter { it.isNotEmpty() }
        // A string, because `ß` uppercases to `SS` and no single char holds that.
        val name = words.joinToString(" ") { word -> word.take(1).uppercase() + word.drop(1) }
        return Identity(id, name.ifEmpty { id })
    }

    /** Formatted like the core's `JSON.stringify(template, null, 2)`, with a final newline. */
    fun stub(engine: TemplateEngine, fileName: String): String {
        val (id, name) = identity(fileName)
        val template =
            JsonObject().apply {
                addProperty("\$schema", engine.schemaUrl)
                addProperty("name", name)
                addProperty("id", id)
                addProperty("version", 1)
            }
        val body = if (engine == TemplateEngine.C7) c7Body(id) else c8Body(id)
        body.entrySet().forEach { (key, value) -> template.add(key, value) }
        return PRETTY.toJson(template) + "\n"
    }

    private fun c7Body(topic: String): JsonObject =
        JsonParser.parseString(
            """
            {
              "appliesTo": ["bpmn:ServiceTask"],
              "properties": [
                {
                  "type": "Hidden",
                  "value": "external",
                  "binding": { "type": "property", "name": "camunda:type" }
                },
                {
                  "type": "Hidden",
                  "value": ${JsonPrimitive(topic)},
                  "binding": { "type": "property", "name": "camunda:topic" }
                },
                {
                  "label": "Input",
                  "type": "String",
                  "binding": { "type": "camunda:inputParameter", "name": "input" },
                  "constraints": { "notEmpty": true }
                }
              ]
            }
            """,
        ).asJsonObject

    private fun c8Body(jobType: String): JsonObject =
        JsonParser.parseString(
            """
            {
              "appliesTo": ["bpmn:Task"],
              "elementType": { "value": "bpmn:ServiceTask" },
              "groups": [{ "id": "input", "label": "Input" }],
              "properties": [
                {
                  "type": "Hidden",
                  "value": ${JsonPrimitive(jobType)},
                  "binding": { "type": "zeebe:taskDefinition", "property": "type" }
                },
                {
                  "label": "Input",
                  "group": "input",
                  "type": "String",
                  "feel": "optional",
                  "binding": { "type": "zeebe:input", "name": "input" },
                  "constraints": { "notEmpty": true }
                }
              ]
            }
            """,
        ).asJsonObject
}
