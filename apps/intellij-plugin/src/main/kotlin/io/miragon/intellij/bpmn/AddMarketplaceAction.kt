package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

/**
 * Tools ▸ Add Template Marketplace — prompts for a repository URL or local folder
 * and hands it to the core, which parses, fetches, and (on success) persists it.
 *
 * The "Register for all projects" checkbox chooses the persist scope: unchecked
 * (default) stores the entry per project; checked promotes it to the app-level
 * "all my projects" list (also visible in Settings ▸ Tools ▸ Miragon BPMN Modeler).
 */
class AddMarketplaceAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val dialog = AddMarketplaceDialog(project)
        if (!dialog.showAndGet()) return
        val location = dialog.location.trim()
        if (location.isEmpty()) return
        // getService (not getServiceIfCreated): spawn the bridge on demand — the
        // user explicitly asked to add, and the notify buffers until it is up.
        project.getService(CoreProcess::class.java).addMarketplace(location, dialog.appWide)
    }
}

/**
 * The URL-plus-scope prompt, built with the Kotlin UI DSL so it can host the
 * checkbox a bare `Messages.showInputDialog` cannot. DialogWrapper applies the
 * bindings and runs `validationOnApply` on OK when `createCenterPanel` returns a
 * DialogPanel, so [location]/[appWide] are populated by the time [showAndGet]
 * returns `true`.
 *
 * Validation rejects only a *blank* entry: the core's `parseMarketplaceUrl` stays
 * the single validation authority, so an unsupported-but-non-blank URL is accepted
 * here and surfaces as the core's `notifyError` balloon — keeping the accepted
 * forms from drifting between the host prompt and what the service resolves.
 */
private class AddMarketplaceDialog(project: Project) : DialogWrapper(project) {
    var location: String = ""
    var appWide: Boolean = false

    init {
        title = "Add Template Marketplace"
        init()
    }

    override fun createCenterPanel(): JComponent =
        panel {
            row("Marketplace:") {
                textField()
                    .bindText({ location }, { location = it })
                    .comment(
                        "GitHub or GitLab repository, or a local folder, holding a " +
                            "<code>marketplace.json</code>. Self-hosted hosts go in " +
                            "Settings ▸ Tools ▸ Miragon BPMN Modeler.",
                    )
                    .validationOnApply {
                        if (it.text.isBlank()) error("Enter a marketplace URL or folder.") else null
                    }
            }
            row {
                checkBox("Register for all projects")
                    .bindSelected({ appWide }, { appWide = it })
                    .comment(
                        "Also shown in Settings ▸ Tools ▸ Miragon BPMN Modeler and applied to " +
                            "every project. Leave unchecked to register for this project only.",
                    )
            }
        }
}
