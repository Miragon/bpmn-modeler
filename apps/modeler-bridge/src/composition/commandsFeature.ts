import { BpmnMigrationService, BpmnModelerService } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../protocol/descriptor";
import { EditorRefParams, MigrateAllParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * Wires the two portable modeler commands the IntelliJ host fires as Host→Core
 * notifications: change the active diagram's engine version, and migrate every
 * `.bpmn` in the workspace. Both reuse production core services unchanged — the
 * results surface through the existing `picker/show`, `document/write`, and
 * `notifier/*` ports, so no new Core→Host method is needed (the protocol contract
 * forbids Host→Core requests anyway).
 *
 * The engine-version change reuses the same {@link BpmnModelerService} instance the
 * editor-session feature owns (handed in via `handles`) so it shares the store and
 * document mirror. Migration gets its own {@link BpmnMigrationService} — its
 * orchestration (scope/version pickers + bulk fs writes) has no per-editor state.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: { bpmnService: BpmnModelerService },
): void {
    // Both services swallow their own errors (UserCancelledError → silent, others →
    // a notifier balloon), so these handlers just await and never need a try/catch.
    deps.rpc.on(METHODS.modelerChangeEngineVersion, async (params: EditorRefParams) => {
        await handles.bpmnService.changeEngineVersion(params.editorId);
    });

    const migrationSvc = new BpmnMigrationService(
        deps.store,
        deps.documentPort,
        deps.nodeWorkspace,
        deps.picker,
        deps.notifier,
    );
    deps.rpc.on(METHODS.migrationMigrateAll, async (params: MigrateAllParams) => {
        // Migrate can fire with no editor open, so temporarily register its root.
        // NodeWorkspace reference-counts roots, preserving any live session claim.
        deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        try {
            await migrationSvc.migrateAllDiagrams();
        } finally {
            deps.nodeWorkspace.unregisterRoot(params.workspaceRoot);
        }
    });
}
