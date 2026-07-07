package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

/**
 * Tools ▸ Remove Template Marketplace — multi-select unregister of registered
 * marketplaces, the IntelliJ analogue of VS Code's `bpmn-modeler.removeMarketplace`.
 *
 * The pick's OK is the confirmation (re-adding is cheap), so there is no extra
 * dialog. Selected entries are removed from every store they live in (app-level
 * "all my projects" and/or this project's list), then the core prunes their
 * orphaned cache slots **without** re-fetching the survivors and refreshes open
 * editors so the templates disappear at once. An app-level removal changed every
 * window's merged list, so the fresh snapshot fans out to the other windows too
 * (mirroring the app-wide Add).
 */
class RemoveMarketplaceAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return

        val appList = ModelerSettingsStore.getInstance().current().marketplaces
        val projectList = ProjectMarketplacesStore.getInstance(project).list()
        val entries = registeredEntries(appList, projectList)
        if (entries.isEmpty()) {
            Messages.showInfoMessage(project, "No marketplaces registered.", "Remove Template Marketplace")
            return
        }

        val dialog = RemoveMarketplaceDialog(project, entries)
        if (!dialog.showAndGet()) return
        val chosen = dialog.chosen
        // OK with nothing checked is a cancel, matching the VS Code convention.
        if (chosen.isEmpty()) return

        val chosenLocations = chosen.map { it.location }.toSet()
        val appChanged = appList.any { it in chosenLocations }
        ModelerSettingsStore.getInstance().removeMarketplaces(chosenLocations)
        ProjectMarketplacesStore.getInstance(project).remove(chosenLocations)

        // Prune the orphaned caches + refresh this window's editors, reporting the
        // selection count. getService (not getServiceIfCreated): the user asked to
        // remove, so spawn the bridge on demand if this window never opened a .bpmn.
        project.getService(CoreProcess::class.java).removeMarketplaces(chosen.size)
        // The app-level list is shared, so its change touched every window's merged
        // list — sync the rest so their open editors see the reduced set.
        if (appChanged) pushSettingsToRunningBridges()
    }

    /**
     * The deduped union of registered marketplaces, each annotated with the
     * scope(s) it lives in — app-level list first (matching the merged-union
     * order), so a shared entry reads "all projects and this project".
     */
    private fun registeredEntries(appList: List<String>, projectList: List<String>): List<MarketplaceEntry> {
        val projectSet = projectList.toSet()
        val appSet = appList.toSet()
        return (appList + projectList).distinct().map { location ->
            MarketplaceEntry(
                location = location,
                inApp = location in appSet,
                inProject = location in projectSet,
            )
        }
    }
}

/**
 * One registered marketplace for the remove picker. IntelliJ marketplaces are
 * plain URL/path strings (strings-only v1), so the location doubles as the label.
 */
private data class MarketplaceEntry(
    val location: String,
    val inApp: Boolean,
    val inProject: Boolean,
) {
    /** Where the entry lives, shown so the user knows what removal will touch. */
    val scopeDescription: String
        get() = when {
            inApp && inProject -> "All projects and this project"
            inApp -> "All projects"
            else -> "This project"
        }
}

/**
 * The multi-select prompt: one checkbox per registered marketplace, built with
 * the Kotlin UI DSL so its bindings populate [chosen] on OK the same way
 * [AddMarketplaceDialog] populates its fields. A [BooleanArray] indexed in
 * lockstep with [entries] holds each checkbox's state.
 */
private class RemoveMarketplaceDialog(
    project: Project,
    private val entries: List<MarketplaceEntry>,
) : DialogWrapper(project) {
    private val selected = BooleanArray(entries.size)

    init {
        title = "Remove Template Marketplace"
        init()
    }

    /** The entries the user checked; empty when OK is pressed with nothing selected. */
    val chosen: List<MarketplaceEntry>
        get() = entries.filterIndexed { index, _ -> selected[index] }

    override fun createCenterPanel(): JComponent =
        panel {
            row { label("Select the marketplaces to remove:") }
            entries.forEachIndexed { index, entry ->
                row {
                    checkBox(entry.location)
                        .bindSelected({ selected[index] }, { selected[index] = it })
                        .comment(entry.scopeDescription)
                }
            }
        }
}
