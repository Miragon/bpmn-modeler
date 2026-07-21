package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ New DMN Model (also Project view ▸ New) — creates a `.dmn` file and
 * opens it in the DMN modeler. The IntelliJ counterpart of the VS Code
 * `miragon.dmnModeler.newDiagram` command.
 *
 * Like [NewBpmnModelAction] the file is created **empty**: opening an empty `.dmn`
 * triggers the core's `DmnModelerService.display()` empty branch over the bridge,
 * which writes the decision-table scaffold. That keeps the seed XML single-sourced
 * in the core (`libs/modeler-core/src/modeler/dmn/domain/emptyDmn.ts`) instead of
 * replicated here in Kotlin.
 */
class NewDmnModelAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        NewModelSupport.createModelFile(
            event,
            dialogTitle = "New DMN Model",
            dialogDescription = "Create a new empty DMN decision",
            extension = "dmn",
            defaultName = "decision.dmn",
            content = "", // empty → the core scaffolds it via display()'s empty branch
        )
    }
}
