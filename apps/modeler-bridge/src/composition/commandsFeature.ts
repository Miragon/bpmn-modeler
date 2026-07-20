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
        // Migrate can fire with no editor open, so no session/register has registered
        // this root — and NodeWorkspace.findFiles only globs registered roots. Not
        // unregistered afterwards: roots are a Set with no refcount, and the session
        // dispose path already unregisters, so pulling it eagerly could break a live
        // template watcher on a still-open editor under the same root.
        deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        await migrationSvc.migrateAllDiagrams();
    });
}
