package io.miragon.intellij.bpmn

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile

/**
 * Kotlin copy of `isElementTemplateFile` in `libs/modeler-types`: a JSON file that
 * names a template schema near its start, or sits in an `element-templates` folder.
 * `ElementTemplateFilesTest` runs the TypeScript rule's rows against it.
 */
internal object ElementTemplateFiles {
    // `$schema` is conventionally the first key; the head keeps data-URI icons out of the scan.
    private const val TEXT_HEAD_LENGTH = 4096
    private val SCHEMA_PROPERTY = Regex(""""\${'$'}schema"\s*:\s*"[^"]*element-templates-json-schema[^"]*"""")
    private val TEMPLATE_FOLDER = Regex("""[\\/]element-templates[\\/]""")

    fun isTemplateFile(path: String, text: CharSequence): Boolean =
        path.endsWith(".json") &&
            (TEMPLATE_FOLDER.containsMatchIn(path) || SCHEMA_PROPERTY.containsMatchIn(text.take(TEXT_HEAD_LENGTH)))

    /** Reads an open document's unsaved text in preference to the file on disk. */
    fun isTemplateFile(file: VirtualFile): Boolean {
        if (file.isDirectory || !file.name.endsWith(".json")) return false
        val text =
            FileDocumentManager.getInstance().getCachedDocument(file)?.charsSequence
                ?: runCatching { file.inputStream.use { String(it.readNBytes(TEXT_HEAD_LENGTH), file.charset) } }
                    .getOrDefault("")
        return isTemplateFile(file.path, text)
    }
}
