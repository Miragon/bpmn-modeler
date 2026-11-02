package io.miragon.intellij.bpmn

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
    /** The editor's lint toggle; the Settings page has no field for it. */
    val lintingEnabled: Boolean,
    /** Pasted marketplace URLs / local paths (strings-only v1); fed to the core over RPC. */
    val marketplaces: List<String>,
) {
    /**
     * Applies only what changed from [loaded] to [edited] onto these stored values,
     * so a value another writer stored after [loaded] was read survives. Marketplaces
     * merge per entry: an add or removal on either side survives the other.
     */
    fun withEdits(loaded: ModelerSettings, edited: ModelerSettings): ModelerSettings {
        fun <T> editedOrStored(field: ModelerSettings.() -> T): T =
            if (edited.field() != loaded.field()) edited.field() else field()

        return ModelerSettings(
            alignToOrigin = editedOrStored { alignToOrigin },
            showTransactionBoundaries = editedOrStored { showTransactionBoundaries },
            configFolder = editedOrStored { configFolder },
            persistCodeLinkMap = editedOrStored { persistCodeLinkMap },
            c8ApiVersion = editedOrStored { c8ApiVersion },
            colorTheme = editedOrStored { colorTheme },
            defaultMode = editedOrStored { defaultMode },
            favouriteBpmnElements = editedOrStored { favouriteBpmnElements },
            language = editedOrStored { language },
            scriptingSpin = editedOrStored { scriptingSpin },
            lintingEnabled = editedOrStored { lintingEnabled },
            marketplaces = mergeMarketplaces(loaded.marketplaces, edited.marketplaces),
        )
    }

    private fun mergeMarketplaces(loaded: List<String>, edited: List<String>): List<String> {
        val removedMeanwhile = loaded.toSet() - marketplaces.toSet()
        val addedMeanwhile = marketplaces.filter { it !in loaded && it !in edited }
        return edited.filterNot { it in removedMeanwhile } + addedMeanwhile
    }
}
