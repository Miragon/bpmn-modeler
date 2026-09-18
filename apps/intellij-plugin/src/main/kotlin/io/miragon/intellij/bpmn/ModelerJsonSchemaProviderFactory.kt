package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType

/**
 * Associates the bundled JSON Schemas with the modeler's convention files, giving
 * authors validation, completion, and hover docs as they edit — the IntelliJ
 * counterpart of VS Code's `contributes.jsonValidation`:
 *
 * - `*.bpmn.vars.json` process-variable manifests
 * - `deployment-targets.json` named deployment targets
 *
 * The schemas are the same files shipped to VS Code (single source of truth in
 * `libs/shared`, staged into resources by the Gradle `copySchema` task), so both
 * hosts validate against an identical contract. Scoped by file name rather than a
 * path glob because the `<configFolder>` location is user-configurable.
 */
class ModelerJsonSchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): List<JsonSchemaFileProvider> =
        listOf(
            BundledSchemaProvider("BPMN Variable Manifest", "/schemas/bpmn-vars.schema.json") {
                it.name.endsWith(".bpmn.vars.json")
            },
            BundledSchemaProvider("BPMN Deployment Targets", "/schemas/deployment-targets.schema.json") {
                it.name == "deployment-targets.json"
            },
        )

    private class BundledSchemaProvider(
        private val name: String,
        private val resourcePath: String,
        private val matches: (VirtualFile) -> Boolean,
    ) : JsonSchemaFileProvider {
        override fun getName(): String = name

        override fun isAvailable(file: VirtualFile): Boolean = matches(file)

        // Loaded from the plugin classpath; the Gradle build stages the shared
        // schema here. Returns null if absent so the JSON plugin degrades to no
        // validation rather than throwing.
        override fun getSchemaFile(): VirtualFile? =
            JsonSchemaProviderFactory.getResourceFile(javaClass, resourcePath)

        // Bundled in the plugin (not a user mapping or a remote URL).
        override fun getSchemaType(): SchemaType = SchemaType.embeddedSchema
    }
}
