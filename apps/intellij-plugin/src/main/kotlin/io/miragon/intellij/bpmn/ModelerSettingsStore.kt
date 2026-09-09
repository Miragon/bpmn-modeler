package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

/**
 * One snapshot of the user-controllable `miragon.bpmnModeler.*` options.
 *
 * Field names and value shapes mirror the VS Code settings 1:1 — the same
 * snapshot crosses the RPC boundary into the shared modeler core regardless of
 * host, so any divergence here would silently change behaviour on only one IDE.
 */
data class ModelerSettings(
    val alignToOrigin: Boolean,
    val showTransactionBoundaries: Boolean,
    val configFolder: String,
    val persistCodeLinkMap: Boolean,
    val c8ApiVersion: String,
    val colorTheme: String,
    val defaultMode: String,
    val favouriteBpmnElements: List<String>,
    val language: String,
    val scriptingSpin: Boolean,
    /** Pasted marketplace URLs / local paths (strings-only v1); fed to the core over RPC. */
    val marketplaces: List<String>,
)

/**
 * Application-level persistence for the modeler settings, backed by
 * [PropertiesComponent].
 *
 * The settings page and the running bridges both read through this service, so a
 * single Settings ▸ apply writes here once and then fans the same snapshot out to
 * every open project's [CoreProcess]. Keys are namespaced exactly like the VS Code
 * configuration so a future shared-config layer (or a user reading idea.log) sees
 * matching names across hosts; defaults track `apps/vscode-plugin/package.json`.
 *
 * The `marketplaces` list is the exception: the app-level list held here is the
 * "all my projects" set, but [snapshotMap] emits the union with the per-project
 * [ProjectMarketplacesStore] (mirroring VS Code's User∪Workspace merge), so the
 * snapshot is always project-scoped.
 */
@Service(Service.Level.APP)
class ModelerSettingsStore {
    private val props get() = PropertiesComponent.getInstance()

    /** Reads the current persisted values, falling back to the package.json defaults. */
    fun current(): ModelerSettings =
        ModelerSettings(
            alignToOrigin = props.getBoolean(ALIGN_TO_ORIGIN, DEFAULT_ALIGN_TO_ORIGIN),
            showTransactionBoundaries = props.getBoolean(SHOW_TX_BOUNDARIES, DEFAULT_SHOW_TX_BOUNDARIES),
            configFolder = props.getValue(CONFIG_FOLDER, DEFAULT_CONFIG_FOLDER),
            persistCodeLinkMap = props.getBoolean(PERSIST_CODE_LINK_MAP, DEFAULT_PERSIST_CODE_LINK_MAP),
            c8ApiVersion = props.getValue(C8_API_VERSION, DEFAULT_C8_API_VERSION),
            colorTheme = normalizeColorTheme(props.getValue(COLOR_THEME, DEFAULT_COLOR_THEME)),
            defaultMode = normalizeDefaultMode(props.getValue(DEFAULT_MODE, DEFAULT_DEFAULT_MODE)),
            favouriteBpmnElements = props.getList(FAVOURITE_ELEMENTS) ?: DEFAULT_FAVOURITE_ELEMENTS,
            language = props.getValue(LANGUAGE, DEFAULT_LANGUAGE),
            scriptingSpin = props.getBoolean(SCRIPTING_SPIN, DEFAULT_SCRIPTING_SPIN),
            marketplaces = props.getList(MARKETPLACES) ?: emptyList(),
        )

    /** Persists the snapshot, normalising the two constrained fields so stored values stay valid. */
    fun update(settings: ModelerSettings) {
        props.setValue(ALIGN_TO_ORIGIN, settings.alignToOrigin, DEFAULT_ALIGN_TO_ORIGIN)
        props.setValue(SHOW_TX_BOUNDARIES, settings.showTransactionBoundaries, DEFAULT_SHOW_TX_BOUNDARIES)
        // An empty config folder would make discovery scan the whole tree; keep the default instead.
        props.setValue(CONFIG_FOLDER, settings.configFolder.ifBlank { DEFAULT_CONFIG_FOLDER }, DEFAULT_CONFIG_FOLDER)
        props.setValue(PERSIST_CODE_LINK_MAP, settings.persistCodeLinkMap, DEFAULT_PERSIST_CODE_LINK_MAP)
        props.setValue(C8_API_VERSION, settings.c8ApiVersion, DEFAULT_C8_API_VERSION)
        props.setValue(COLOR_THEME, normalizeColorTheme(settings.colorTheme), DEFAULT_COLOR_THEME)
        props.setValue(DEFAULT_MODE, normalizeDefaultMode(settings.defaultMode), DEFAULT_DEFAULT_MODE)
        // Cap matches the webview append-menu palette (max 6 pinned elements).
        props.setList(FAVOURITE_ELEMENTS, settings.favouriteBpmnElements.take(MAX_FAVOURITES))
        props.setValue(LANGUAGE, settings.language, DEFAULT_LANGUAGE)
        props.setValue(SCRIPTING_SPIN, settings.scriptingSpin, DEFAULT_SCRIPTING_SPIN)
        props.setList(MARKETPLACES, settings.marketplaces)
    }

    /**
     * The snapshot shaped exactly as the bridge's `settings` RPC param (see the
     * TS `SettingsSnapshot`). Gson serialises the list as a JSON array; the core
     * computes the per-key change diff, so the host only ever sends the full set.
     *
     * `project` is required so the `marketplaces` key is the app ∪ project union
     * from [ProjectMarketplacesStore] rather than the app-only list — the core
     * only ever sees the merged set, so no caller can accidentally ship the
     * narrower one.
     */
    fun snapshotMap(project: Project): Map<String, Any> {
        val current = current()
        return linkedMapOf(
            "alignToOrigin" to current.alignToOrigin,
            "showTransactionBoundaries" to current.showTransactionBoundaries,
            "configFolder" to current.configFolder,
            "persistCodeLinkMap" to current.persistCodeLinkMap,
            "c8ApiVersion" to current.c8ApiVersion,
            "colorTheme" to current.colorTheme,
            "defaultMode" to current.defaultMode,
            "favouriteBpmnElements" to current.favouriteBpmnElements,
            "language" to current.language,
            // The RPC key is the camelCase field name matching the bridge's
            // `SettingsSnapshot`, NOT the dotted persisted key — a mismatch here
            // would make the gate a silent no-op.
            "scriptingSpin" to current.scriptingSpin,
            "marketplaces" to ProjectMarketplacesStore.getInstance(project).merged(),
        )
    }

    /**
     * Appends a registration to the app-level ("all my projects") list, de-duping
     * against that list *alone*. Per the promotion rule, an entry that already
     * lives in some project's [ProjectMarketplacesStore] may still be lifted
     * app-wide, so the merged union is intentionally not consulted here — backs the
     * "Register for all projects" add scope.
     */
    fun addMarketplace(location: String) {
        val appList = props.getList(MARKETPLACES) ?: emptyList()
        if (appList.contains(location)) return
        props.setList(MARKETPLACES, appList + location)
    }

    /**
     * Unregisters the given locations from the app-level ("all my projects") list,
     * backing the app-level side of Tools ▸ Remove Template Marketplace. Only
     * writes when the list actually shrank, so removing entries that lived solely
     * per-project leaves this list — and its persisted `workspace.xml` value —
     * untouched.
     */
    fun removeMarketplaces(locations: Collection<String>) {
        val removeSet = locations.toSet()
        val appList = props.getList(MARKETPLACES) ?: emptyList()
        val remaining = appList.filterNot { it in removeSet }
        if (remaining.size != appList.size) {
            props.setList(MARKETPLACES, remaining)
        }
    }

    /** Constrains the theme to the two values the core's `SettingsPort` accepts. */
    private fun normalizeColorTheme(value: String): String = if (value == "light") "light" else "automatic"

    /** Constrains the default mode to the three values the core's `SettingsPort` accepts. */
    private fun normalizeDefaultMode(value: String): String =
        if (value == "view" || value == "design") value else "implement"

    companion object {
        fun getInstance(): ModelerSettingsStore =
            ApplicationManager.getApplication().getService(ModelerSettingsStore::class.java)

        const val MAX_FAVOURITES = 6

        // Keys mirror the VS Code `miragon.bpmnModeler.*` namespace.
        private const val ALIGN_TO_ORIGIN = "miragon.bpmnModeler.alignToOrigin"
        private const val SHOW_TX_BOUNDARIES = "miragon.bpmnModeler.showTransactionBoundaries"
        private const val CONFIG_FOLDER = "miragon.bpmnModeler.configFolder"
        private const val PERSIST_CODE_LINK_MAP = "miragon.bpmnModeler.persistCodeLinkMap"
        private const val C8_API_VERSION = "miragon.bpmnModeler.c8ApiVersion"
        private const val COLOR_THEME = "miragon.bpmnModeler.colorTheme"
        private const val DEFAULT_MODE = "miragon.bpmnModeler.defaultMode"
        private const val FAVOURITE_ELEMENTS = "miragon.bpmnModeler.favouriteBpmnElements"
        private const val LANGUAGE = "miragon.bpmnModeler.language"
        private const val SCRIPTING_SPIN = "miragon.bpmnModeler.scripting.spin"
        private const val MARKETPLACES = "miragon.bpmnModeler.marketplaces"

        // Defaults track apps/vscode-plugin/package.json.
        private const val DEFAULT_ALIGN_TO_ORIGIN = false
        private const val DEFAULT_SHOW_TX_BOUNDARIES = true
        private const val DEFAULT_CONFIG_FOLDER = ".camunda"
        private const val DEFAULT_PERSIST_CODE_LINK_MAP = false
        private const val DEFAULT_C8_API_VERSION = "v2"
        private const val DEFAULT_COLOR_THEME = "automatic"
        private const val DEFAULT_DEFAULT_MODE = "implement"
        private const val DEFAULT_LANGUAGE = "en"
        private const val DEFAULT_SCRIPTING_SPIN = true
        private val DEFAULT_FAVOURITE_ELEMENTS =
            listOf("bpmn:ServiceTask", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:ExclusiveGateway")
    }
}
