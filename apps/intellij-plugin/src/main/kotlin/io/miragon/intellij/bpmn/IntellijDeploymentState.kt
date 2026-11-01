package io.miragon.intellij.bpmn

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

/**
 * Project-scoped persistence for the non-secret deployment state (the ad-hoc
 * connection, the active target and the freshness ledger), the IntelliJ
 * counterpart of VS Code's `VsCodeDeploymentState` (which uses `workspaceState`,
 * i.e. per-project — matched here by the *project*-scoped [PropertiesComponent]).
 *
 * The stored values cross the RPC boundary as the bridge's `deploymentState/seed`
 * param, and [applyPatch] backs `deploymentState/save`. The core owns the defaults
 * and the shape, so nothing here fills in a missing value. Secrets are out of
 * scope — they live in [IntellijSecretStore] / PasswordSafe.
 */
@Service(Service.Level.PROJECT)
class IntellijDeploymentState(private val project: Project) {
    private val props get() = PropertiesComponent.getInstance(project)

    /** What the project stores, keyed as the core's `DeploymentState`; a key never written is absent. */
    fun snapshotMap(): Map<String, Any> =
        buildMap {
            for ((field, key) in FIELD_KEYS) props.getValue(key)?.let { put(field, it) }
            props.getValue(LEDGER)?.let { put("ledger", parseLedger(it)) }
        }

    /**
     * Writes exactly the fields and ledger rows the core's `DeploymentStatePatch`
     * names. Like the core, a ledger patch removes before it puts.
     */
    fun applyPatch(patch: JsonObject) {
        for ((field, key) in FIELD_KEYS) {
            val value = patch.get(field) ?: continue
            if (value.isJsonPrimitive) props.setValue(key, value.asString)
        }
        val ledgerPatch = patch.get("ledger")?.takeIf(JsonElement::isJsonObject)?.asJsonObject ?: return
        val ledger = props.getValue(LEDGER)?.let(::parseLedger) ?: JsonObject()
        ledgerPatch.get("remove")?.takeIf(JsonElement::isJsonArray)?.asJsonArray?.forEach {
            ledger.remove(it.asString)
        }
        ledgerPatch.get("put")?.takeIf(JsonElement::isJsonObject)?.asJsonObject?.entrySet()?.forEach {
            (ledgerKey, revision) -> ledger.add(ledgerKey, revision)
        }
        props.setValue(LEDGER, ledger.toString())
    }

    private fun parseLedger(stored: String): JsonObject =
        runCatching { JsonParser.parseString(stored).asJsonObject }.getOrElse { JsonObject() }

    companion object {
        fun getInstance(project: Project): IntellijDeploymentState =
            project.getService(IntellijDeploymentState::class.java)

        // Renaming a key forgets the value earlier releases stored under it.
        private val FIELD_KEYS =
            linkedMapOf(
                "endpoint" to "bpmn-modeler.deployment.endpoint",
                "tenantId" to "bpmn-modeler.deployment.tenantId",
                "authType" to "bpmn-modeler.deployment.authType",
                "tokenEndpoint" to "bpmn-modeler.deployment.tokenEndpoint",
                "audience" to "bpmn-modeler.deployment.audience",
                "activeTargetName" to "bpmn-modeler.deployment.activeTargetName",
            )
        private const val LEDGER = "bpmn-modeler.deployment.ledger"
    }
}
