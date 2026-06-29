package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType

/**
 * Associates the bundled `*.bpmn.vars.json` JSON Schema with process-variable
 * manifest files, giving authors validation, completion, and hover docs as they
 * edit — the IntelliJ counterpart of VS Code's `contributes.jsonValidation`.
 *
 * The schema is the same file shipped to VS Code (single source of truth in
 * `libs/shared`, staged into resources by the Gradle `copySchema` task), so both
 * hosts validate against an identical contract. Scoped by the `.bpmn.vars.json`
 * suffix rather than a path glob because the manifest's location under
 * `<configFolder>/vars/` is user-configurable.
 */
class VarsManifestJsonSchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): List<JsonSchemaFileProvider> =
        listOf(VarsManifestSchemaProvider())

    private class VarsManifestSchemaProvider : JsonSchemaFileProvider {
        override fun getName(): String = "BPMN Variable Manifest"

        override fun isAvailable(file: VirtualFile): Boolean =
            file.name.endsWith(".bpmn.vars.json")

        // Loaded from the plugin classpath; the Gradle build stages the shared
        // schema here. Returns null if absent so the JSON plugin degrades to no
        // validation rather than throwing.
        override fun getSchemaFile(): VirtualFile? =
            JsonSchemaProviderFactory.getResourceFile(javaClass, "/schemas/bpmn-vars.schema.json")

        // Bundled in the plugin (not a user mapping or a remote URL).
        override fun getSchemaType(): SchemaType = SchemaType.embeddedSchema
    }
}
