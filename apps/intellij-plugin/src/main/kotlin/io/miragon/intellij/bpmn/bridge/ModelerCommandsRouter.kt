package io.miragon.intellij.bpmn.bridge

/**
 * Routes the two portable modeler commands as outbound Host→Core notifications
 * (mirrors [MarketplaceRouter]'s notify pattern): change the active diagram's
 * engine version, and migrate every `.bpmn` in the workspace. Both results surface
 * through the core's existing ports (`picker/show`, `document/write`, notifier),
 * so this router only sends — it registers no inbound handlers.
 *
 * Each notify buffers in the outbound queue until the bridge is up, so the trailing
 * [ensureStartedAsync][BridgeDeps.ensureStartedAsync] is enough to guarantee delivery.
 */
internal class ModelerCommandsRouter(private val deps: BridgeDeps) {
    /**
     * Fires `modeler/changeEngineVersion` for one editor. [editorId] is the session
     * key (the file url), passed explicitly rather than relying on the core's
     * active-editor pointer so the right session is targeted with several open.
     */
    fun changeEngineVersion(editorId: String) {
        deps.channel.notify(METHODS_CHANGE_ENGINE_VERSION, linkedMapOf("editorId" to editorId))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `migration/migrateAll` for the project's base path. Guarded on a
     * non-null basePath: `NodeWorkspace.findFiles` only globs a registered root, and
     * a light-edit project with no base path has no workspace to migrate.
     */
    fun migrateAllDiagrams() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(METHODS_MIGRATE_ALL, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    private companion object {
        // Mirrors METHODS.modelerChangeEngineVersion / migrationMigrateAll in
        // apps/modeler-bridge/src/protocol/descriptor.ts (the protocol.json snapshot
        // keeps the two sides honest).
        const val METHODS_CHANGE_ENGINE_VERSION = "modeler/changeEngineVersion"
        const val METHODS_MIGRATE_ALL = "migration/migrateAll"
    }
}
