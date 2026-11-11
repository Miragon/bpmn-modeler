import { ExtensionContext } from "vscode";

import {
    BpmnLayoutService,
    BpmnMigrationService,
    CoreWriteRenderer,
    ElementIdsService,
    FormModelerService,
    ModelerLanguageService,
    EngineVersionSelectionService,
} from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { CommandController } from "../modeler/bpmn/adapter/in/CommandController";
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
        formService: FormModelerService;
        layoutSvc: BpmnLayoutService;
        elementIds: ElementIdsService;
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
        new EngineVersionSelectionService(deps.editorStore, deps.vsDocument, {
            ".bpmn": (id) => handles.bpmnService.changeEngineVersion(id),
            ".form": (id) => handles.formService.changeEngineVersion(id),
        }),
        migrationSvc,
        deps.picker,
        deps.pendingEdits,
        handles.layoutSvc,
        handles.elementIds,
        deps.preferences,
        new ModelerLanguageService(deps.picker, deps.preferences, deps.notifier),
    ).register(context);
}
