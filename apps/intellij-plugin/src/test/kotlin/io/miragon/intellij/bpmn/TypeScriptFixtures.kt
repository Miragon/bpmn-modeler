package io.miragon.intellij.bpmn

import com.google.gson.JsonElement
import com.google.gson.JsonParser
import java.nio.file.Files
import java.nio.file.Path

/** A TypeScript-side file whose path Gradle passes in as the system property [property]. */
internal fun readTypeScriptFile(property: String): String {
    val path = requireNotNull(System.getProperty(property)) { "$property is unset; run the test through Gradle" }
    return Files.readString(Path.of(path))
}

internal fun readTypeScriptJson(property: String): JsonElement = JsonParser.parseString(readTypeScriptFile(property))
