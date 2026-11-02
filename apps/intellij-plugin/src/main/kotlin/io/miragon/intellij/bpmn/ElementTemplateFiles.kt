package io.miragon.intellij.bpmn

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile

/**
 * Kotlin copy of `elementTemplateFolder` and `isElementTemplateFile` in
 * `libs/modeler-types`: a JSON file that names a template schema near its start, or
 * sits where the template loader reads. `ElementTemplateFilesTest` runs the
 * TypeScript rules' rows against it.
 */
internal object ElementTemplateFiles {
    // `$schema` is conventionally the first key; the head keeps data-URI icons out of the scan.
    private const val TEXT_HEAD_LENGTH = 4096
    private val SCHEMA_PROPERTY = Regex(""""\${'$'}schema"\s*:\s*"[^"]*element-templates-json-schema[^"]*"""")
    private val PATH_SEPARATORS = Regex("""[\\/]+""")

    fun folder(configFolder: String): String = (pathSegments(configFolder) + "element-templates").joinToString("/")

    fun isTemplateFile(path: String, text: CharSequence, configFolder: String): Boolean {
        val inTemplateFolder = "/${pathSegments(path).joinToString("/")}".contains("/${folder(configFolder)}/")
        return path.endsWith(".json") &&
            (inTemplateFolder || SCHEMA_PROPERTY.containsMatchIn(text.take(TEXT_HEAD_LENGTH)))
    }

    private fun pathSegments(path: String): List<String> =
        path.split(PATH_SEPARATORS).filter { it.isNotEmpty() && it != "." }

    /** Reads an open document's unsaved text in preference to the file on disk. */
    fun isTemplateFile(file: VirtualFile): Boolean {
        if (file.isDirectory || !file.name.endsWith(".json")) return false
        val text =
            FileDocumentManager.getInstance().getCachedDocument(file)?.charsSequence
                ?: runCatching { file.inputStream.use { String(it.readNBytes(TEXT_HEAD_LENGTH), file.charset) } }
                    .getOrDefault("")
        return isTemplateFile(file.path, text, ModelerSettingsStore.getInstance().current().configFolder)
    }
}
