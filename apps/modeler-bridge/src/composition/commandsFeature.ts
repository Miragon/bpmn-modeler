import {
    BpmnLayoutService,
    BpmnMigrationService,
    BpmnModelerService,
    CoreWriteRenderer,
} from "@miragon/bpmn-modeler-core";

import { modelerCommandHandlers } from "../modeler/bpmn/adapter/in/modelerCommandHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * Wires the two portable modeler commands the IntelliJ host fires as Host→Core
 * notifications: change the active diagram's engine version, and migrate every
 * `.bpmn` in the workspace. Both reuse production core services unchanged — the
 * results surface through the existing `picker/show`, `document/write`, and
 * `notifier/*` ports, so no new Core→Host method is needed (the protocol contract
 * forbids Host→Core requests anyway).
 *
 * The engine-version change and the layout commands reuse the BPMN editor's
 * {@link BpmnModelerService} and {@link BpmnLayoutService} (handed in via
 * `handles`) so they share the store and document mirror. Migration gets its own
 * {@link BpmnMigrationService} — its orchestration (scope/version pickers + bulk
 * fs writes) has no per-editor state.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        bpmnService: BpmnModelerService;
        layout: BpmnLayoutService;
        coreWriteRenderer: CoreWriteRenderer;
    },
): void {
    // `confirm/show` is the one Core→Host request layout cleanup needs — deleting
    // on the user's behalf has to wait for an answer, and requests only run in
    // that direction.
    const migration = new BpmnMigrationService(
        deps.store,
        deps.documentPort,
        deps.nodeWorkspace,
        deps.picker,
        deps.notifier,
        handles.coreWriteRenderer,
    );
    bindHandlers(
        deps.rpc,
        modelerCommandHandlers({
            bpmnService: handles.bpmnService,
            layout: handles.layout,
            migration,
            store: deps.store,
            notifier: deps.notifier,
            workspaceRoots: deps.nodeWorkspace,
        }),
    );
}
