package io.miragon.intellij.bpmn

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.jupiter.api.Named
import java.nio.file.Files
import java.nio.file.Path

/** A TypeScript-side file whose path Gradle passes in as the system property [property]. */
internal fun readTypeScriptFile(property: String): String {
    val path = requireNotNull(System.getProperty(property)) { "$property is unset; run the test through Gradle" }
    return Files.readString(Path.of(path))
}

internal fun readTypeScriptJson(property: String): JsonElement = JsonParser.parseString(readTypeScriptFile(property))

/** The `cases` of the case file behind [property], each named by its `name`. */
internal fun readTypeScriptCases(property: String): List<Named<JsonObject>> =
    readTypeScriptJson(property).asJsonObject.getAsJsonArray("cases").map {
        val case = it.asJsonObject
        Named.of(case.get("name").asString, case)
    }

/** The string literals of the array literal the file behind [property] exports as `const [name]`. */
internal fun readTypeScriptStringArray(property: String, name: String): List<String> {
    val source = readTypeScriptFile(property)
    val entries =
        requireNotNull(Regex("""export const $name\b[^=]*=\s*\[([^\]]*)]""").find(source)) {
            "$property declares no $name array literal"
        }.groupValues[1]
    return Regex(""""([^"]+)"""").findAll(entries).map { it.groupValues[1] }.toList()
}
