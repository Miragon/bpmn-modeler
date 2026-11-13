package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import io.miragon.intellij.bpmn.ProjectScope
import io.miragon.intellij.bpmn.TemplatePreferenceChange
import io.miragon.intellij.bpmn.TemplateSwitch
import io.miragon.intellij.bpmn.pushToRunningBridges
import io.miragon.intellij.bpmn.templatePreferenceListOf

/**
 * Merges the template switch changes a bridge sends into the store of their
 * scope and mirrors both scopes into the bridges that read the changed one:
 * an all-projects change into every running bridge of the IDE, a project
 * change into this project's.
 */
internal class TemplatePreferenceRouter(
    private val deps: BridgeDeps,
    // No CoreProcess runs under the test fixture, so a test observes the fan-out here.
    private val pushToRunningBridges: () -> Unit = { pushToRunningBridges(ReplicatedStateKind.TEMPLATE_PREFERENCES) },
) : ReplicatedState {
    override val kind = ReplicatedStateKind.TEMPLATE_PREFERENCES

    fun register() {
        deps.handlers.on("templatePreferences/change") { params ->
            val scope = params.string("scope")
            val disable = switchesOf(params.jsonArray("disable"))
            val enable = switchesOf(params.jsonArray("enable"))
            RpcAction { id -> handleChange(TemplatePreferenceChange(ProjectScope.ofWireName(scope), disable, enable), id) }
        }
        deps.handlers.on("templatePreferences/read") {
            RpcAction { id -> id?.let { deps.channel.reply(it, TemplatePreferencesResult.of(deps.project)) } }
        }
    }

    /**
     * Pushes before it answers, so the changing bridge's mirror never lags its
     * own change. Every frame carries each scope's revision, and no lock is
     * held while they are queued: the bridge keeps the newest of each scope.
     */
    private fun handleChange(change: TemplatePreferenceChange, id: CoreRequestId?) {
        val outcome = templatePreferenceListOf(change.scope, deps.project).change(change)
        if (outcome.changed) {
            when (change.scope) {
                ProjectScope.ALL_PROJECTS -> pushToRunningBridges()
                ProjectScope.PROJECT -> push()
            }
        }
        id?.let { deps.channel.reply(it, TemplatePreferencesResult.of(deps.project)) }
    }

    // Seeds the mirror the editor reads when it first sends its templates.
    override fun registerSeed(): Map<String, Any?> = mapOf("templatePreferences" to TemplatePreferencesResult.of(deps.project))

    /**
     * Not coalesced: all-projects changes push from each project's reader thread, so a frame
     * queued later can carry an older revision and must not replace the newer one.
     */
    override fun push() {
        if (!deps.isProcessAlive()) return
        val pair = TemplatePreferencesResult.of(deps.project)
        deps.channel.notify(
            HostToCoreMethod.TEMPLATE_PREFERENCES_DID_CHANGE,
            linkedMapOf("project" to pair.project, "allProjects" to pair.allProjects),
            reliable = true,
        )
    }

    private fun switchesOf(rows: JsonArray): List<TemplateSwitch> =
        rows.map { row -> requireNotNull(TemplateSwitch.fromJson(row)) { "Not a template switch: $row" } }
}
