package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages

/**
 * Tools ▸ Add Template Marketplace — prompts for a repository URL or local folder
 * and hands it to the core, which parses, fetches, and (on success) persists it.
 *
 * The dialog only rejects a *blank* entry: the core's `parseMarketplaceUrl` stays
 * the single validation authority, so an unsupported-but-non-blank URL is accepted
 * here and surfaces as the core's `notifyError` balloon — keeping the accepted
 * forms from drifting between the host prompt and what the service resolves.
 */
class AddMarketplaceAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val input =
            Messages.showInputDialog(
                project,
                "GitHub or GitLab repository, or a local folder, holding a marketplace.json.\n" +
                    "Self-hosted hosts go in Settings ▸ Tools ▸ Miragon BPMN Modeler.",
                "Add Template Marketplace",
                null,
                "",
                NON_BLANK_VALIDATOR,
            ) ?: return
        val location = input.trim()
        if (location.isEmpty()) return
        // getService (not getServiceIfCreated): spawn the bridge on demand — the
        // user explicitly asked to add, and the notify buffers until it is up.
        project.getService(CoreProcess::class.java).addMarketplace(location)
    }

    private companion object {
        val NON_BLANK_VALIDATOR =
            object : InputValidator {
                override fun checkInput(inputString: String?): Boolean = !inputString.isNullOrBlank()

                override fun canClose(inputString: String?): Boolean = !inputString.isNullOrBlank()
            }
    }
}
