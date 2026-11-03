package io.miragon.intellij.bpmn

import com.google.gson.JsonElement
import com.google.gson.JsonParser
import java.nio.file.Files
import java.nio.file.Path

/** A TypeScript-side JSON file whose path Gradle passes in as the system property [property]. */
internal fun readTypeScriptJson(property: String): JsonElement {
    val path = requireNotNull(System.getProperty(property)) { "$property is unset; run the test through Gradle" }
    return JsonParser.parseString(Files.readString(Path.of(path)))
}
