package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

internal class SettingsRouter(
    private val deps: BridgeDeps,
    private val pushToRunningBridges: () -> Unit = ::pushSettingsToRunningBridges,
) {
    fun register() {}
}
