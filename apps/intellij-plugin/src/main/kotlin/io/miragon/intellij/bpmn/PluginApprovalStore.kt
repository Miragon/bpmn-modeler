package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger

/** One plugin the user approved, by the content it had then. Gson writes the property names as the wire keys. */
data class PluginApproval(val pluginId: String, val contentHash: String) {
    companion object {
        /** The approval [element] holds, or null when it is no object with both keys as strings. */
        fun fromJson(element: JsonElement): PluginApproval? {
            val row = element.takeIf { it.isJsonObject }?.asJsonObject ?: return null
            val pluginId = row.get("pluginId")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString } ?: return null
            val contentHash = row.get("contentHash")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString } ?: return null
            return PluginApproval(pluginId.asString, contentHash.asString)
        }
    }
}

/**
 * The plugin approvals of this IDE installation, shared by every project and
 * kept out of every project file, so a repository cannot approve its own plugins.
 * The bridges read them through `session/register` and `pluginApprovals/didChange`
 * and write them through `pluginApprovals/save`.
 */
@Service(Service.Level.APP)
class PluginApprovalStore {
    private val log = Logger.getInstance(PluginApprovalStore::class.java)

    private val props get() = PropertiesComponent.getInstance()

    private val gson = Gson()

    private val lock = Any()

    fun read(): List<PluginApproval> =
        synchronized(lock) {
            val stored = props.getValue(KEY) ?: return emptyList()
            val rows =
                runCatching { JsonParser.parseString(stored) }.getOrNull()?.takeIf { it.isJsonArray }?.asJsonArray
            if (rows == null) {
                log.warn("Ignoring the stored plugin approvals: not a JSON array")
                return emptyList()
            }
            val approvals = rows.mapNotNull(PluginApproval::fromJson)
            if (approvals.size != rows.size()) log.warn("Ignoring ${rows.size() - approvals.size} malformed plugin approvals")
            approvals
        }

    fun write(approvals: List<PluginApproval>) {
        synchronized(lock) { props.setValue(KEY, gson.toJson(approvals)) }
    }

    companion object {
        fun getInstance(): PluginApprovalStore =
            ApplicationManager.getApplication().getService(PluginApprovalStore::class.java)

        private const val KEY = "miragon.bpmnModeler.pluginApprovals"
    }
}
