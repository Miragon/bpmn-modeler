package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import org.jetbrains.annotations.TestOnly

/**
 * A template source the user turned off, or one template id (every version) in
 * it. Gson writes the property names as the wire keys and leaves out a null
 * [templateId], as the core leaves it out for a whole source.
 */
data class TemplateSwitch(val source: String, val templateId: String? = null) {
    companion object {
        /** The switch [element] holds, or null when it is no object with a string source and, if any, a string template id. */
        fun fromJson(element: JsonElement): TemplateSwitch? {
            val row = element.takeIf { it.isJsonObject }?.asJsonObject ?: return null
            val source = row.get("source")?.takeIf(::isString) ?: return null
            val templateId = row.get("templateId")
            if (templateId != null && !isString(templateId)) return null
            return TemplateSwitch(source.asString, templateId?.asString)
        }

        private fun isString(element: JsonElement): Boolean = element.isJsonPrimitive && element.asJsonPrimitive.isString
    }
}

/** One write to one scope's switches: switches to disable and to enable, each named once. */
internal data class TemplatePreferenceChange(
    val scope: ProjectScope,
    val disable: List<TemplateSwitch>,
    val enable: List<TemplateSwitch>,
) {
    init {
        val named = disable + enable
        require(named.size == named.toSet().size) { "A template preference change names a switch twice" }
    }
}

/** One scope's stored switches with the revision they were stored at. */
data class TemplatePreferenceSnapshot(val disabled: List<TemplateSwitch>, val revision: Long)

/** What a change left stored, and whether it differs from the switches before. */
data class TemplatePreferenceChangeOutcome(val snapshot: TemplatePreferenceSnapshot, val changed: Boolean)

/**
 * Kotlin copy of the core's `templatePreferencesAfter`; `templatePreferenceChange.cases.json`
 * holds both to the same rows. Switches the change does not name keep their
 * place, every copy of an enabled one drops, a disabled one already stored stays
 * where its first copy is, and new ones append in the order the change names them.
 */
internal fun templatePreferencesAfter(stored: List<TemplateSwitch>, change: TemplatePreferenceChange): List<TemplateSwitch> {
    val enabled = change.enable.toSet()
    val pendingDisable = change.disable.associateWithTo(LinkedHashMap()) { it }
    val disabled = pendingDisable.keys.toSet()
    val kept =
        stored.flatMap { each ->
            when {
                each in enabled -> emptyList()
                each !in disabled -> listOf(each)
                else -> listOfNotNull(pendingDisable.remove(each))
            }
        }
    return kept + pendingDisable.values
}

/**
 * The template switches of one scope, in one [PropertiesComponent] value. The
 * bridges read them through `session/register` and `templatePreferences/didChange`
 * and change them through `templatePreferences/change`, which this list merges
 * under one lock, so two writers never drop each other's switches.
 */
internal abstract class TemplatePreferenceList(private val scope: ProjectScope) {
    private val log = Logger.getInstance(TemplatePreferenceList::class.java)

    protected abstract val props: PropertiesComponent

    private val gson = Gson()

    private val lock = Any()

    // In memory, per IDE run, as PluginApprovalStore's: a bridge's mirror starts below it.
    private var revision = 1L

    fun snapshot(): TemplatePreferenceSnapshot = synchronized(lock) { TemplatePreferenceSnapshot(readStored(), revision) }

    /** Reads, merges, writes and bumps the revision in one step; writes nothing when the change keeps every switch. */
    fun change(change: TemplatePreferenceChange): TemplatePreferenceChangeOutcome {
        require(change.scope == scope) { "A ${change.scope.wireName} change reached the ${scope.wireName} template switches" }
        return synchronized(lock) {
            val stored = readStored()
            val merged = templatePreferencesAfter(stored, change)
            val changed = merged.groupingBy { it }.eachCount() != stored.groupingBy { it }.eachCount()
            if (changed) write(merged)
            TemplatePreferenceChangeOutcome(TemplatePreferenceSnapshot(merged, revision), changed)
        }
    }

    @TestOnly
    fun replaceAll(switches: List<TemplateSwitch>) {
        synchronized(lock) { write(switches) }
    }

    private fun write(switches: List<TemplateSwitch>) {
        props.setValue(KEY, gson.toJson(switches))
        revision++
    }

    private fun readStored(): List<TemplateSwitch> {
        val stored = props.getValue(KEY) ?: return emptyList()
        val rows = runCatching { JsonParser.parseString(stored) }.getOrNull()?.takeIf { it.isJsonArray }?.asJsonArray
        if (rows == null) {
            log.warn("Ignoring the stored ${scope.wireName} template switches: not a JSON array")
            return emptyList()
        }
        val switches = rows.mapNotNull(TemplateSwitch::fromJson)
        if (switches.size != rows.size()) log.warn("Ignoring ${rows.size() - switches.size} malformed ${scope.wireName} template switches")
        return switches
    }

    private companion object {
        // One key in both namespaces: the project PropertiesComponent is a separate one.
        const val KEY = "miragon.bpmnModeler.templatePreferences"
    }
}

/**
 * The user's template switches for every project, kept by this IDE installation
 * out of every project file, so a repository cannot turn a teammate's templates off.
 */
@Service(Service.Level.APP)
internal class TemplatePreferenceStore : TemplatePreferenceList(ProjectScope.ALL_PROJECTS) {
    override val props: PropertiesComponent get() = PropertiesComponent.getInstance()

    companion object {
        fun getInstance(): TemplatePreferenceStore =
            ApplicationManager.getApplication().getService(TemplatePreferenceStore::class.java)
    }
}

/**
 * The user's template switches for the open project, in the project's
 * [PropertiesComponent], which `workspace.xml` keeps per user, as
 * [ProjectMarketplacesStore] keeps its registrations.
 */
@Service(Service.Level.PROJECT)
internal class ProjectTemplatePreferenceStore(private val project: Project) : TemplatePreferenceList(ProjectScope.PROJECT) {
    override val props: PropertiesComponent get() = PropertiesComponent.getInstance(project)

    companion object {
        fun getInstance(project: Project): ProjectTemplatePreferenceStore =
            project.getService(ProjectTemplatePreferenceStore::class.java)
    }
}
