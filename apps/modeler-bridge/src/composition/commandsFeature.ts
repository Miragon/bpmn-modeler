import {
    BpmnLayoutService,
    BpmnMigrationService,
    BpmnModelerService,
    CoreWriteRenderer,
    ElementIdsService,
    ModelerLanguageService,
    EngineVersionSelectionService,
} from "@miragon/bpmn-modeler-core";

import { modelerCommandHandlers } from "../modeler/bpmn/adapter/in/modelerCommandHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";
import { RpcLanguagePreference } from "../modelerSettings/adapter/out/RpcLanguagePreference";

/**
 * Wires portable modeler commands as Host→Core notifications. Core services
 * choose through the generic picker and persist through host ports.
 *
 * The engine-version change, the layout commands and Generate IDs from Names
 * reuse the BPMN editor's {@link BpmnModelerService}, {@link BpmnLayoutService}
 * and {@link ElementIdsService} (handed in via `handles`) so they share the
 * store and document mirror. Migration gets its own
 * {@link BpmnMigrationService} — its orchestration (scope/version pickers + bulk
 * fs writes) has no per-editor state.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        bpmnService: BpmnModelerService;
        layout: BpmnLayoutService;
        elementIds: ElementIdsService;
        coreWriteRenderer: CoreWriteRenderer;
    },
): void {
    // `confirm/show` is the one Core→Host request layout cleanup needs — deleting
    // on the user's behalf has to wait for an answer, and requests only run in
    // that direction.
    const migration = new BpmnMigrationService(
        deps.store,
        deps.documents,
        deps.nodeWorkspace,
        deps.picker,
        deps.notifier,
        handles.coreWriteRenderer,
    );
    bindHandlers(
        deps.rpc,
        modelerCommandHandlers({
            language: new ModelerLanguageService(
                deps.picker,
                new RpcLanguagePreference(deps.rpc),
                deps.notifier,
            ),
            engineSelection: new EngineVersionSelectionService(deps.store, deps.documents, {
                ".bpmn": (id) => handles.bpmnService.changeEngineVersion(id),
            }),
            layout: handles.layout,
            elementIds: handles.elementIds,
            migration,
            store: deps.store,
            notifier: deps.notifier,
            workspaceRoots: deps.nodeWorkspace,
        }),
    );
}
