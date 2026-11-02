package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

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

    private val writeLock = Any()

    /** Reads the current persisted values, falling back to the package.json defaults. */
    fun current(): ModelerSettings =
        ModelerSettings(
            alignToOrigin = props.getBoolean(ALIGN_TO_ORIGIN, DEFAULT_ALIGN_TO_ORIGIN),
            showTransactionBoundaries = props.getBoolean(SHOW_TX_BOUNDARIES, DEFAULT_SHOW_TX_BOUNDARIES),
            configFolder = props.getValue(CONFIG_FOLDER, DEFAULT_CONFIG_FOLDER),
            persistCodeLinkMap = props.getBoolean(PERSIST_CODE_LINK_MAP, DEFAULT_PERSIST_CODE_LINK_MAP),
            c8ApiVersion = props.getValue(C8_API_VERSION, DEFAULT_C8_API_VERSION),
            colorTheme = props.getValue(COLOR_THEME, DEFAULT_COLOR_THEME),
            defaultMode = props.getValue(DEFAULT_MODE, DEFAULT_DEFAULT_MODE),
            favouriteBpmnElements = props.getList(FAVOURITE_ELEMENTS) ?: DEFAULT_FAVOURITE_ELEMENTS,
            language = props.getValue(LANGUAGE, DEFAULT_LANGUAGE),
            scriptingSpin = props.getBoolean(SCRIPTING_SPIN, DEFAULT_SCRIPTING_SPIN),
            lintingEnabled = props.getBoolean(LINTING_ENABLED, DEFAULT_LINTING_ENABLED),
            marketplaces = props.getList(MARKETPLACES) ?: emptyList(),
        ).normalized()

    /**
     * Applies [change] to the values stored at write time and persists the result
     * normalised. The bridge's reader thread writes too, so the read and the write
     * share one lock with the other writers.
     */
    fun update(change: (ModelerSettings) -> ModelerSettings) {
        synchronized(writeLock) {
            val normalized = change(current()).normalized()
            props.setValue(ALIGN_TO_ORIGIN, normalized.alignToOrigin, DEFAULT_ALIGN_TO_ORIGIN)
            props.setValue(SHOW_TX_BOUNDARIES, normalized.showTransactionBoundaries, DEFAULT_SHOW_TX_BOUNDARIES)
            props.setValue(CONFIG_FOLDER, normalized.configFolder, DEFAULT_CONFIG_FOLDER)
            props.setValue(PERSIST_CODE_LINK_MAP, normalized.persistCodeLinkMap, DEFAULT_PERSIST_CODE_LINK_MAP)
            props.setValue(C8_API_VERSION, normalized.c8ApiVersion, DEFAULT_C8_API_VERSION)
            props.setValue(COLOR_THEME, normalized.colorTheme, DEFAULT_COLOR_THEME)
            props.setValue(DEFAULT_MODE, normalized.defaultMode, DEFAULT_DEFAULT_MODE)
            props.setList(FAVOURITE_ELEMENTS, normalized.favouriteBpmnElements)
            props.setValue(LANGUAGE, normalized.language, DEFAULT_LANGUAGE)
            props.setValue(SCRIPTING_SPIN, normalized.scriptingSpin, DEFAULT_SCRIPTING_SPIN)
            props.setValue(LINTING_ENABLED, normalized.lintingEnabled, DEFAULT_LINTING_ENABLED)
            props.setList(MARKETPLACES, normalized.marketplaces)
        }
    }

    /**
     * The snapshot shaped exactly as the bridge's `settings` RPC param (see the
     * core's `ModelerSettingsSnapshot` in `kernel/domain/modelerSettings.ts`).
     * Gson serialises the list as a JSON array; the core computes the per-key
     * change diff, so the host only ever sends the full set.
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
            // The RPC key is the camelCase field name matching the core's
            // `ModelerSettingsSnapshot`, NOT the dotted persisted key — a mismatch here
            // would make the gate a silent no-op.
            "scriptingSpin" to current.scriptingSpin,
            "lintingEnabled" to current.lintingEnabled,
            "marketplaces" to ProjectMarketplacesStore.getInstance(project).merged(),
        )
    }

    /** Writes the lint choice alone, so a toggle never rewrites a setting another writer just changed. */
    fun setLintingEnabled(enabled: Boolean) {
        synchronized(writeLock) {
            props.setValue(LINTING_ENABLED, enabled, DEFAULT_LINTING_ENABLED)
        }
    }

    /**
     * Appends a registration to the app-level ("all my projects") list, de-duping
     * against that list *alone*. Per the promotion rule, an entry that already
     * lives in some project's [ProjectMarketplacesStore] may still be lifted
     * app-wide, so the merged union is intentionally not consulted here — backs the
     * "Register for all projects" add scope.
     */
    fun addMarketplace(location: String) {
        synchronized(writeLock) {
            val appList = props.getList(MARKETPLACES) ?: emptyList()
            if (appList.contains(location)) return
            props.setList(MARKETPLACES, appList + location)
        }
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
        synchronized(writeLock) {
            val appList = props.getList(MARKETPLACES) ?: emptyList()
            val remaining = appList.filterNot { it in removeSet }
            if (remaining.size != appList.size) {
                props.setList(MARKETPLACES, remaining)
            }
        }
    }

    /**
     * The Kotlin copy of the core's `normalizeSettings`; `ModelerSettingsStoreTest` runs the
     * core's `settingsNormalization.cases.json` against this store.
     */
    private fun ModelerSettings.normalized(): ModelerSettings =
        copy(
            // A blank folder would make discovery scan the whole tree.
            configFolder = configFolder.ifBlank { DEFAULT_CONFIG_FOLDER },
            colorTheme = colorTheme.takeIf { it in COLOR_THEMES } ?: DEFAULT_COLOR_THEME,
            defaultMode = defaultMode.takeIf { it in DEFAULT_MODES } ?: DEFAULT_DEFAULT_MODE,
            favouriteBpmnElements = favouriteBpmnElements.take(MAX_FAVOURITES),
        )

    companion object {
        fun getInstance(): ModelerSettingsStore =
            ApplicationManager.getApplication().getService(ModelerSettingsStore::class.java)

        /** The append-menu palette pins no more. */
        const val MAX_FAVOURITES = 6

        /** In the order the Settings page offers them. */
        internal val COLOR_THEMES = listOf("automatic", "light")
        internal val DEFAULT_MODES = listOf("implement", "design", "view")

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
        private const val LINTING_ENABLED = "miragon.bpmnModeler.linting.enabled"
        private const val MARKETPLACES = "miragon.bpmnModeler.marketplaces"

        // Defaults track apps/vscode-plugin/package.json; ModelerSettingsStoreTest compares them.
        private const val DEFAULT_ALIGN_TO_ORIGIN = false
        private const val DEFAULT_SHOW_TX_BOUNDARIES = true
        private const val DEFAULT_CONFIG_FOLDER = ".camunda"
        private const val DEFAULT_PERSIST_CODE_LINK_MAP = false
        private const val DEFAULT_C8_API_VERSION = "v2"
        internal const val DEFAULT_COLOR_THEME = "automatic"
        internal const val DEFAULT_DEFAULT_MODE = "implement"
        internal const val DEFAULT_LANGUAGE = "en"
        private const val DEFAULT_SCRIPTING_SPIN = true
        private const val DEFAULT_LINTING_ENABLED = true
        private val DEFAULT_FAVOURITE_ELEMENTS =
            listOf("bpmn:ServiceTask", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:ExclusiveGateway")
    }
}
