import { ExtensionContext } from "vscode";

import { BpmnMigrationService } from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { CommandController, DocumentFlusher } from "../modeler/bpmn/controller/CommandController";
import { SharedDeps } from "./sharedDeps";

/**
 * The palette-command feature owns the migration service because
 * `CommandController` is its sole consumer (the "migrate all diagrams" command).
 * `bpmnService` is borrowed from the editor feature, where its lifecycle lives.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: { bpmnService: BpmnModelerService; documentFlush: DocumentFlusher },
): void {
    const migrationSvc = new BpmnMigrationService(
        deps.editorStore,
        deps.vsDocument,
        deps.vsWorkspace,
        deps.picker,
        deps.notifier,
    );
    new CommandController(
        deps.editorStore,
        deps.vsDocument,
        deps.notifier,
        deps.textEditor,
        handles.bpmnService,
        migrationSvc,
        deps.picker,
        handles.documentFlush,
    ).register(context);
}
