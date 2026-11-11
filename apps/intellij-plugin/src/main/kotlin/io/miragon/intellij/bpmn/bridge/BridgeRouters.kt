package io.miragon.intellij.bpmn.bridge

/**
 * The feature routers of one bridge. [register] is the only place that decides
 * which core→host methods the host handles.
 */
internal class BridgeRouters(deps: BridgeDeps) {
    val editor = EditorSessionRouter(deps)
    val deployment = DeploymentRouter(deps)
    val diff = DiffRouter(deps)
    val script = ScriptRouter(deps)
    val secretStore = SecretStoreRouter(deps)
    val marketplace = MarketplaceRouter(deps)
    val settings = SettingsRouter(deps)
    val pluginApprovals = PluginApprovalRouter(deps)
    val templatePreferences = TemplatePreferenceRouter(deps)
    val workspaceTrust = WorkspaceTrustRouter(deps)
    val addOns = AddOnsRouter(deps)

    // Outbound only: it sends host→core notifications and handles no method.
    val modelerCommands = ModelerCommandsRouter(deps)
    val hostUi = HostUiRouter(deps)

    fun register() {
        editor.register()
        deployment.register()
        diff.register()
        script.register()
        secretStore.register()
        marketplace.register()
        settings.register()
        pluginApprovals.register()
        templatePreferences.register()
        workspaceTrust.register()
        addOns.register()
        hostUi.register()
    }

    /**
     * Runs once the bridge's writer is attached, after every spawn. A register
     * queued before it read the settings, switches, approvals and trust when it
     * was queued, and a push while the process was starting was dropped, so each
     * is read again here. The add-ons view opens after the settings, so it never
     * lists from an older config folder.
     */
    fun seedAfterSpawn() {
        deployment.sendSeed()
        deployment.followNewProcess()
        editor.pushSettings()
        templatePreferences.push()
        pluginApprovals.pushStored()
        workspaceTrust.push()
        addOns.followNewProcess()
    }
}
