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
        hostUi.register()
    }
}
