package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile

/**
 * Tools ▸ New Element Template… (also Project view ▸ New) — the IntelliJ
 * counterpart of the VS Code `bpmn-modeler.newElementTemplate` command. Names the
 * file, then picks the engine, so a cancel at either step writes nothing; the
 * template opens with its preview beside it.
 */
class NewElementTemplateAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val target =
            NewModelSupport.chooseTarget(
                project,
                dialogTitle = "New Element Template",
                dialogDescription = "Create an element template for Camunda 7 or Camunda 8",
                extension = "json",
                dir = templateFolder(project) ?: NewModelSupport.defaultDir(event, project),
                defaultName = "new-element-template.json",
            ) ?: return

        val engines = TemplateEngine.values()
        HostPicker.show(
            project,
            title = "New Element Template",
            placeholder = "Select the engine the element template is for.",
            canPickMany = false,
            items = engines.mapIndexed { index, engine -> HostPicker.PickItem(index, engine.label, null) },
        ) { selected ->
            val engine = selected?.firstOrNull()?.let(engines::get) ?: return@show
            NewModelSupport.createAndOpen(project, target, NewElementTemplates.stub(engine, target.name))
        }
    }

    /**
     * The template folder the chooser loads from at the project root. Created up
     * front: the save dialog needs an existing folder, and an empty template folder
     * is a cheaper leftover than a template saved where the chooser never finds it.
     */
    private fun templateFolder(project: Project): VirtualFile? {
        val root = project.guessProjectDir() ?: return null
        val configFolder = ModelerSettingsStore.getInstance().current().configFolder
        return runCatching {
            WriteAction.computeAndWait<VirtualFile?, Throwable> {
                VfsUtil.createDirectoryIfMissing(root, "$configFolder/element-templates")
            }
        }.getOrNull()
    }
}
