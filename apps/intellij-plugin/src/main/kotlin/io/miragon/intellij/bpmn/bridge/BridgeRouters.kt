package io.miragon.intellij.bpmn.bridge

/**
 * The feature routers of one bridge. [register] is the only place that decides
 * which core→host methods the host handles, and [replicatedStates] the only
 * place that decides which host state the bridge mirrors.
 */
internal class BridgeRouters(deps: BridgeDeps) {
    val editor = EditorSessionRouter(deps, replicatedStateSeed = ::replicatedStateSeed)
    val deployment = DeploymentRouter(deps)
    val diff = DiffRouter(deps)
    val script = ScriptRouter(deps)
    val secretStore = SecretStoreRouter(deps)
    val settings = SettingsRouter(deps)
    val marketplace = MarketplaceRouter(deps, pushToOwnBridge = settings::push)
    val pluginApprovals = PluginApprovalRouter(deps)
    val templatePreferences = TemplatePreferenceRouter(deps)
    val workspaceTrust = WorkspaceTrustRouter(deps)
    val addOns = AddOnsRouter(deps)

    // Outbound only: it sends host→core notifications and handles no method.
    val modelerCommands = ModelerCommandsRouter(deps)
    val hostUi = HostUiRouter(deps)

    /** Every state the host mirrors into this bridge, in the order a spawn seeds them. */
    val replicatedStates: List<ReplicatedState> =
        listOf(deployment, settings, templatePreferences, pluginApprovals, workspaceTrust)

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
     * queued before it read the replicated states when it was queued, and a push
     * while the process was starting was dropped, so each is pushed again here.
     * The add-ons view opens after the settings and the trust, so it never lists
     * from an older config folder.
     */
    fun seedAfterSpawn() {
        replicatedStates.forEach { it.push() }
        deployment.followNewProcess()
        addOns.followNewProcess()
    }

    fun pushReplicatedState(kind: ReplicatedStateKind) = replicatedStates.single { it.kind == kind }.push()

    /** The trust goes first: adding a Trusted Location announces no change of the project's trust. */
    fun refreshAddOns() {
        workspaceTrust.push()
        addOns.refresh()
    }

    private fun replicatedStateSeed(): Map<String, Any?> = buildMap { replicatedStates.forEach { putAll(it.registerSeed()) } }
}
