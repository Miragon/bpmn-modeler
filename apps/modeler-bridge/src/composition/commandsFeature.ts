import {
    BpmnLayoutService,
    BpmnMigrationService,
    BpmnModelerService,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
} from "@miragon/bpmn-modeler-core";
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
 * The engine-version change and the layout commands reuse the BPMN editor's
 * {@link BpmnModelerService} and {@link BpmnLayoutService} (handed in via
 * `handles`) so they share the store and document mirror. Migration gets its own
 * {@link BpmnMigrationService} — its orchestration (scope/version pickers + bulk
 * fs writes) has no per-editor state.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: { bpmnService: BpmnModelerService; layout: BpmnLayoutService },
): void {
    // Both services swallow their own errors (a dismissed prompt → silent, others →
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
    // Formatting and cleanup: the host fires them as notifications and the
    // outcome comes back over the webview channel, which the BPMN editor routes.
    // `confirm/show` is the one new Core→Host request the pair needs — deleting
    // on the user's behalf has to wait for an answer, and requests only run in
    // that direction.
    const layoutSvc = handles.layout;

    const withActiveEditor = async (action: (editorId: string) => Promise<void>): Promise<void> => {
        try {
            await action(deps.store.getActiveEditorId());
        } catch (error) {
            deps.notifier.logError(error as Error);
            deps.notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
        }
    };

    deps.rpc.on(METHODS.layoutFormat, () => withActiveEditor((id) => layoutSvc.format(id)));
    deps.rpc.on(METHODS.layoutCleanup, () =>
        withActiveEditor((id) => layoutSvc.inspectCleanup(id)),
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
