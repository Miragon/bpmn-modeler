package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import org.jetbrains.annotations.TestOnly

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

/** One write to the approvals: rows to allow and ids to revoke, each id named once. */
data class PluginApprovalChange(val allow: List<PluginApproval>, val revoke: List<String>) {
    init {
        val ids = allow.map { it.pluginId } + revoke
        require(ids.size == ids.toSet().size) { "An approval change names an id twice" }
    }
}

/** The stored approvals with the revision they were stored at. */
data class PluginApprovalSnapshot(val approvals: List<PluginApproval>, val revision: Long)

/** What a change left stored, and whether it differs from the list before. */
data class PluginApprovalChangeOutcome(val snapshot: PluginApprovalSnapshot, val changed: Boolean)

/**
 * Kotlin copy of the core's `approvalsAfter`; `codeApprovalChange.cases.json`
 * holds both to the same rows. Rows of ids the change does not name keep their
 * place, every row of a revoked id drops, an allowed row replaces the first row
 * of its id in place, and new ids append in the order the change names them.
 */
internal fun approvalsAfter(stored: List<PluginApproval>, change: PluginApprovalChange): List<PluginApproval> {
    val revoked = change.revoke.toSet()
    val pendingAllow = change.allow.associateByTo(LinkedHashMap()) { it.pluginId }
    val allowedIds = pendingAllow.keys.toSet()
    val kept =
        stored.flatMap { row ->
            when {
                row.pluginId in revoked -> emptyList()
                row.pluginId !in allowedIds -> listOf(row)
                else -> listOfNotNull(pendingAllow.remove(row.pluginId))
            }
        }
    return kept + pendingAllow.values
}

/**
 * The plugin approvals of this IDE installation, shared by every project and
 * kept out of every project file, so a repository cannot approve its own plugins.
 * The bridges read them through `session/register` and `pluginApprovals/didChange`
 * and change them through `pluginApprovals/change`, which this store merges
 * under one lock, so two projects' changes never drop each other's rows.
 */
@Service(Service.Level.APP)
class PluginApprovalStore {
    private val log = Logger.getInstance(PluginApprovalStore::class.java)

    private val props get() = PropertiesComponent.getInstance()

    private val gson = Gson()

    private val lock = Any()

    // In memory, per IDE run: every bridge is a child process of this run, and
    // a bridge's mirror starts below it. Grows with each list this store writes.
    private var revision = 1L

    fun snapshot(): PluginApprovalSnapshot = synchronized(lock) { PluginApprovalSnapshot(readStored(), revision) }

    fun read(): List<PluginApproval> = snapshot().approvals

    /** Reads, merges, writes and bumps the revision in one step; writes nothing when the change keeps every row. */
    fun change(change: PluginApprovalChange): PluginApprovalChangeOutcome =
        synchronized(lock) {
            val stored = readStored()
            val merged = approvalsAfter(stored, change)
            val changed = merged.groupingBy { it }.eachCount() != stored.groupingBy { it }.eachCount()
            if (changed) write(merged)
            PluginApprovalChangeOutcome(PluginApprovalSnapshot(merged, revision), changed)
        }

    @TestOnly
    internal fun replaceAll(approvals: List<PluginApproval>) {
        synchronized(lock) { write(approvals) }
    }

    private fun write(approvals: List<PluginApproval>) {
        props.setValue(KEY, gson.toJson(approvals))
        revision++
    }

    private fun readStored(): List<PluginApproval> {
        val stored = props.getValue(KEY) ?: return emptyList()
        val rows =
            runCatching { JsonParser.parseString(stored) }.getOrNull()?.takeIf { it.isJsonArray }?.asJsonArray
        if (rows == null) {
            log.warn("Ignoring the stored plugin approvals: not a JSON array")
            return emptyList()
        }
        val approvals = rows.mapNotNull(PluginApproval::fromJson)
        if (approvals.size != rows.size()) log.warn("Ignoring ${rows.size() - approvals.size} malformed plugin approvals")
        return approvals
    }

    companion object {
        fun getInstance(): PluginApprovalStore =
            ApplicationManager.getApplication().getService(PluginApprovalStore::class.java)

        private const val KEY = "miragon.bpmnModeler.pluginApprovals"
    }
}
