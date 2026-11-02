package io.miragon.intellij.bpmn.bridge

/**
 * Routes the portable modeler commands — the Tools-menu actions and the status
 * widgets' clicks — as outbound Host→Core notifications (mirrors
 * [MarketplaceRouter]'s notify pattern). Their results surface through the core's
 * existing ports (`picker/show`, `document/write`, notifier, `statusBar/update`),
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
        deps.channel.notify(HostToCoreMethod.MODELER_CHANGE_ENGINE_VERSION, linkedMapOf("editorId" to editorId))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `linting/toggle`, the BPMNlint widget's click. The bridge reports the
     * flipped choice back over `settings/setLintingEnabled`, which [SettingsRouter] stores.
     */
    fun toggleLinting() {
        deps.channel.notify(HostToCoreMethod.LINTING_TOGGLE, linkedMapOf<String, Any>())
        deps.ensureStartedAsync()
    }

    /**
     * Fires `migration/migrateAll` for the project's base path. Guarded on a
     * non-null basePath: `NodeWorkspace.findFiles` only globs a registered root, and
     * a light-edit project with no base path has no workspace to migrate.
     */
    fun migrateAllDiagrams() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.MIGRATION_MIGRATE_ALL, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `layout/format` for the core's active editor.
     *
     * No editorId: the core resolves the active session itself, matching how the
     * VS Code command works, so both hosts refuse identically when no diagram
     * has focus.
     */
    fun formatDiagram() {
        deps.channel.notify(HostToCoreMethod.LAYOUT_FORMAT, linkedMapOf<String, Any>())
        deps.ensureStartedAsync()
    }

    /**
     * Fires `layout/cleanup`. The core replies with a report and asks for
     * confirmation over `confirm/show` before anything is removed.
     */
    fun cleanupDiagram() {
        deps.channel.notify(HostToCoreMethod.LAYOUT_CLEANUP, linkedMapOf<String, Any>())
        deps.ensureStartedAsync()
    }

    /**
     * Fires `deployment/switchTarget` for the project root. The core shows the
     * target picker over `picker/show`, persists the choice, and refreshes the
     * status bar + an open sidebar. Guarded on a non-null basePath — the targets
     * file lives under a workspace root.
     */
    fun switchDeploymentTarget() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.DEPLOYMENT_SWITCH_TARGET, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `deployment/deployFiles` for the project root. The core resolves the
     * active target (prompting if none), opens the file picker, and deploys each.
     */
    fun deployFiles() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.DEPLOYMENT_DEPLOY_FILES, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `deployment/deployActive` for the project root. The core saves and
     * deploys the active diagram to the active target (prompting if none).
     */
    fun deployDiagram() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.DEPLOYMENT_DEPLOY_ACTIVE, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `deployment/verify` for the project root. The core reconciles the
     * active diagram's ledger row against the target's Camunda 7 engine.
     */
    fun verifyDeployment() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.DEPLOYMENT_VERIFY, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }

    /**
     * Fires `deployment/statusBarMenu` for the project root. The core renders
     * the switch/verify chooser through the generic `picker/show`.
     */
    fun deploymentStatusMenu() {
        val workspaceRoot = deps.project.basePath ?: return
        deps.channel.notify(HostToCoreMethod.DEPLOYMENT_STATUS_BAR_MENU, linkedMapOf("workspaceRoot" to workspaceRoot))
        deps.ensureStartedAsync()
    }
}
