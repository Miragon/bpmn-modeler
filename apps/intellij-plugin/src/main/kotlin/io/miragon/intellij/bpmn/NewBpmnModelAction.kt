package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ New BPMN Model (also Project view ▸ New) — creates an empty `.bpmn`
 * file and opens it in the modeler. The IntelliJ counterpart of the VS Code
 * `miragon.bpmnModeler.newDiagram` command.
 *
 * The file is created **empty** on purpose: opening an empty `.bpmn` triggers the
 * core's `display()` empty branch over the bridge, which drives the native engine
 * picker and writes the scaffold. That keeps the engine list and scaffold XML
 * single-sourced in the core instead of replicated in Kotlin.
 *
 * Tradeoff: cancelling the engine picker leaves an empty `.bpmn` on disk — the
 * same outcome as opening any empty `.bpmn` today.
 */
class NewBpmnModelAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        NewModelSupport.createModelFile(
            event,
            dialogTitle = "New BPMN Model",
            dialogDescription = "Create a new empty BPMN diagram",
            extension = "bpmn",
            defaultName = "diagram.bpmn",
            content = "", // empty → the core scaffolds it via the engine picker
        )
    }
}
