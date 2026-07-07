package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

/**
 * Project-level persistence for template-marketplace registrations, the IntelliJ
 * analogue of VS Code's Workspace-scoped `miragon.bpmnModeler.marketplaces`.
 *
 * Backed by the *project* [PropertiesComponent], which is a namespace distinct
 * from the application one [ModelerSettingsStore] uses — so the same key holds a
 * separate per-project list. Registrations added via Tools ▸ Add Template
 * Marketplace land here (per project), while the app-level list stays the
 * "all my projects" set; [merged] is the union the core actually fetches.
 *
 * Persists to `workspace.xml` (per-user, gitignored) — not team-shareable; a
 * `PersistentStateComponent` with `.idea/` storage is a possible follow-up.
 */
@Service(Service.Level.PROJECT)
class ProjectMarketplacesStore(private val project: Project) {
    private val props get() = PropertiesComponent.getInstance(project)

    /** The project-level registrations only (excludes the app-level list). */
    fun list(): List<String> = props.getList(MARKETPLACES) ?: emptyList()

    /**
     * Appends a registration, de-duping against [merged] so re-adding one that
     * already lives in the app-level list is a no-op — it would otherwise fetch
     * the same repo twice into the same cache slot.
     */
    fun add(location: String) {
        if (merged().contains(location)) return
        props.setList(MARKETPLACES, list() + location)
    }

    /**
     * The union the core fetches: the app-level list first (shared across
     * projects), then this project's own entries. Deduped so an entry present in
     * both scopes is fetched once.
     */
    fun merged(): List<String> {
        val app = ModelerSettingsStore.getInstance().current().marketplaces
        return (app + list()).distinct()
    }

    companion object {
        fun getInstance(project: Project): ProjectMarketplacesStore =
            project.getService(ProjectMarketplacesStore::class.java)

        // Same key as the app-level store; the project PropertiesComponent is a
        // separate namespace, so there is no collision.
        private const val MARKETPLACES = "miragon.bpmnModeler.marketplaces"
    }
}
