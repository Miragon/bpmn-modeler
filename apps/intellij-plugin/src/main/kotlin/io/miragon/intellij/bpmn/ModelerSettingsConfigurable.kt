package io.miragon.intellij.bpmn

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import javax.swing.JComponent

/**
 * Settings ▸ Tools ▸ Miragon BPMN Modeler — the IntelliJ analogue of the VS Code
 * `miragon.bpmnModeler.*` configuration.
 *
 * On [apply] the edited values are persisted via [ModelerSettingsStore] and then pushed
 * to every project that already has a running bridge, so an open `.bpmn` editor
 * updates live (language re-renders, a configFolder change reloads element
 * templates) without reopening the file. Projects with no bridge yet are skipped —
 * they pick the new values up from the snapshot seeded on their next register.
 */
class ModelerSettingsConfigurable : Configurable {
    /**
     * UI-bound mutable mirror of the persisted settings. The Kotlin UI DSL binds
     * components to these fields; [reset]/[apply] move values between this state
     * and [ModelerSettingsStore]. `favouritesText` is the textarea form (one BPMN type
     * per line) of the persisted list.
     */
    private class UiState(
        var alignToOrigin: Boolean,
        var showTransactionBoundaries: Boolean,
        var configFolder: String,
        var persistCodeLinkMap: Boolean,
        var c8ApiVersion: String,
        var colorTheme: String,
        var favouritesText: String,
        var language: String,
        var scriptingSpin: Boolean,
    )

    private val state = loadState()
    private var dialogPanel: DialogPanel? = null

    override fun getDisplayName(): String = "Miragon BPMN Modeler"

    override fun createComponent(): JComponent {
        val builtPanel =
            panel {
                row {
                    checkBox("Align diagram to origin when opening")
                        .bindSelected({ state.alignToOrigin }, { state.alignToOrigin = it })
                }
                row {
                    checkBox("Show transaction boundaries (Camunda 7 only)")
                        .bindSelected(
                            { state.showTransactionBoundaries },
                            { state.showTransactionBoundaries = it },
                        )
                }
                row("Config folder:") {
                    textField()
                        .bindText({ state.configFolder }, { state.configFolder = it })
                        .comment(
                            "Folder searched at each level from the BPMN file up to the project root. " +
                                "Element templates live under <code>&lt;config&gt;/element-templates/</code>.",
                        )
                }
                row {
                    checkBox("Persist activity→code map to disk")
                        .bindSelected(
                            { state.persistCodeLinkMap },
                            { state.persistCodeLinkMap = it },
                        )
                        .comment(
                            "Writes the activity→code map to " +
                                "<code>&lt;config&gt;/code-link/&lt;file&gt;.json</code> as an opt-in warm " +
                                "cache (faster re-open) and a machine-readable artifact for external/AI " +
                                "tooling. The <b>Go to implementation</b> entry works in memory either way.",
                        )
                }
                row("Camunda 8 API version:") {
                    textField().bindText({ state.c8ApiVersion }, { state.c8ApiVersion = it })
                }
                row("Color theme:") {
                    comboBox(COLOR_THEMES)
                        .bindItem({ state.colorTheme }, { state.colorTheme = it ?: DEFAULT_THEME })
                }
                row("Language:") {
                    comboBox(
                        LOCALE_CODES,
                        textListCellRenderer<String?> { code -> code?.let { LOCALE_LABELS[it] ?: it } ?: "" },
                    ).bindItem({ state.language }, { state.language = it ?: DEFAULT_LOCALE })
                }
                row {
                    checkBox("Enable Camunda SPIN script completion")
                        .bindSelected({ state.scriptingSpin }, { state.scriptingSpin = it })
                        .comment(
                            "Offer Camunda SPIN globals (<code>S(…)</code>, <code>JSON(…)</code>) and " +
                                "SpinJsonNode member completion in inline Camunda 7 scripts. Disable if " +
                                "your project does not have camunda-spin on the classpath.",
                        )
                }
                group("Favourite Elements") {
                    row {
                        textArea()
                            .align(AlignX.FILL)
                            .bindText({ state.favouritesText }, { state.favouritesText = it })
                            .applyToComponent { rows = FAVOURITES_ROWS }
                            .comment(
                                "BPMN element types pinned at the top of the append menu (max " +
                                    "${ModelerSettingsStore.MAX_FAVOURITES}), one per line — e.g. " +
                                    "<code>bpmn:ServiceTask</code>.",
                            )
                    }
                }
            }
        dialogPanel = builtPanel
        return builtPanel
    }

    override fun isModified(): Boolean = dialogPanel?.isModified() ?: false

    override fun apply() {
        // Push UI → state, persist, then propagate to live bridges.
        dialogPanel?.apply()
        ModelerSettingsStore.getInstance().update(state.toSettings())
        pushToRunningBridges()
    }

    override fun reset() {
        // Refresh the bound state from disk in place (the panel's getters read these
        // fields), then let the DSL repaint the components and clear the modified flag.
        state.copyFrom(loadState())
        dialogPanel?.reset()
    }

    override fun disposeUIResources() {
        dialogPanel = null
    }

    /**
     * Notifies every open project that has already spawned its bridge.
     * `getServiceIfCreated` is deliberate: instantiating [CoreProcess] here would
     * spawn a bridge for projects that never opened a `.bpmn` file.
     */
    private fun pushToRunningBridges() {
        for (project in ProjectManager.getInstance().openProjects) {
            if (project.isDisposed) continue
            project.getServiceIfCreated(CoreProcess::class.java)?.pushSettings()
        }
    }

    private fun UiState.toSettings(): ModelerSettings =
        ModelerSettings(
            alignToOrigin = alignToOrigin,
            showTransactionBoundaries = showTransactionBoundaries,
            configFolder = configFolder.trim(),
            persistCodeLinkMap = persistCodeLinkMap,
            c8ApiVersion = c8ApiVersion.trim(),
            colorTheme = colorTheme,
            favouriteBpmnElements = parseFavourites(favouritesText),
            language = language,
            scriptingSpin = scriptingSpin,
        )

    private fun UiState.copyFrom(other: UiState) {
        alignToOrigin = other.alignToOrigin
        showTransactionBoundaries = other.showTransactionBoundaries
        configFolder = other.configFolder
        persistCodeLinkMap = other.persistCodeLinkMap
        c8ApiVersion = other.c8ApiVersion
        colorTheme = other.colorTheme
        favouritesText = other.favouritesText
        language = other.language
        scriptingSpin = other.scriptingSpin
    }

    private fun loadState(): UiState {
        val settings = ModelerSettingsStore.getInstance().current()
        return UiState(
            alignToOrigin = settings.alignToOrigin,
            showTransactionBoundaries = settings.showTransactionBoundaries,
            configFolder = settings.configFolder,
            persistCodeLinkMap = settings.persistCodeLinkMap,
            c8ApiVersion = settings.c8ApiVersion,
            colorTheme = settings.colorTheme,
            favouritesText = settings.favouriteBpmnElements.joinToString("\n"),
            language = settings.language,
            scriptingSpin = settings.scriptingSpin,
        )
    }

    /** Splits the textarea into trimmed, non-blank BPMN type lines (cap applied on persist). */
    private fun parseFavourites(text: String): List<String> =
        text.lines().map { it.trim() }.filter { it.isNotEmpty() }

    private companion object {
        const val FAVOURITES_ROWS = 5
        const val DEFAULT_THEME = "automatic"
        const val DEFAULT_LOCALE = "en"

        val COLOR_THEMES = listOf("automatic", "light")

        // Locale codes + labels mirror apps/vscode-plugin/package.json.
        val LOCALE_CODES = listOf("de", "en", "es", "fr", "nl-nl", "pt-br", "ru", "zh-Hans", "zh-Hant")
        val LOCALE_LABELS =
            mapOf(
                "de" to "Deutsch",
                "en" to "English",
                "es" to "Español",
                "fr" to "Français",
                "nl-nl" to "Nederlands",
                "pt-br" to "Português (Brasil)",
                "ru" to "Русский",
                "zh-Hans" to "简体中文",
                "zh-Hant" to "繁体中文",
            )
    }
}
