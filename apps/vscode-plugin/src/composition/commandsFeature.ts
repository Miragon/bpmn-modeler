import { ExtensionContext } from "vscode";

import {
    BpmnLayoutService,
    BpmnMigrationService,
    CoreWriteRenderer,
} from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { CommandController } from "../modeler/bpmn/controller/CommandController";
import { SharedDeps } from "./sharedDeps";

/**
 * The palette-command feature owns the migration service because
 * `CommandController` is its sole consumer (the "migrate all diagrams" command).
 * `bpmnService` is borrowed from the editor feature, where its lifecycle lives.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        bpmnService: BpmnModelerService;
        layoutSvc: BpmnLayoutService;
        coreWriteRenderer: CoreWriteRenderer;
    },
): void {
    const migrationSvc = new BpmnMigrationService(
        deps.editorStore,
        deps.vsDocument,
        deps.vsWorkspace,
        deps.picker,
        deps.notifier,
        handles.coreWriteRenderer,
    );
    new CommandController(
        deps.editorStore,
        deps.vsDocument,
        deps.notifier,
        deps.textEditor,
        handles.bpmnService,
        migrationSvc,
        deps.picker,
        deps.pendingEdits,
        handles.layoutSvc,
    ).register(context);
}
