import {
    BpmnLayoutService,
    BpmnMigrationService,
    BpmnModelerService,
    EditorSessionStore,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
    NotifierPort,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../../protocol/domain/rpcHandler";
import { EditorRefParams, MigrateAllParams } from "../../../../protocol/domain/types";
import { WorkspaceRoots } from "../../../../kernel/port/WorkspaceRoots";

/**
 * RPC (Host → Core): modeler/changeEngineVersion, layout/format,
 * layout/cleanup, migration/migrateAll.
 */
export function modelerCommandHandlers({
    bpmnService,
    layout,
    migration,
    store,
    notifier,
    workspaceRoots,
}: {
    bpmnService: BpmnModelerService;
    layout: BpmnLayoutService;
    migration: BpmnMigrationService;
    store: EditorSessionStore;
    notifier: NotifierPort;
    workspaceRoots: WorkspaceRoots;
}): RpcHandlerTable {
    const withActiveEditor = async (action: (editorId: string) => Promise<void>): Promise<void> => {
        try {
            await action(store.getActiveEditorId());
        } catch (error) {
            notifier.logError(error as Error);
            notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
        }
    };

    return {
        // Both services swallow their own errors (a dismissed prompt → silent, others →
        // a notifier balloon), so these handlers just await and never need a try/catch.
        [METHODS.modelerChangeEngineVersion]: async (params: EditorRefParams) => {
            await bpmnService.changeEngineVersion(params.editorId);
        },
        // Formatting and cleanup: the host fires them as notifications and the
        // outcome comes back over the webview channel, which the BPMN editor routes.
        [METHODS.layoutFormat]: () => withActiveEditor((id) => layout.format(id)),
        [METHODS.layoutCleanup]: () => withActiveEditor((id) => layout.inspectCleanup(id)),
        [METHODS.migrationMigrateAll]: async (params: MigrateAllParams) => {
            // Migrate can fire with no editor open, so temporarily register its root.
            // NodeWorkspace reference-counts roots, preserving any live session claim.
            workspaceRoots.registerRoot(params.workspaceRoot);
            try {
                await migration.migrateAllDiagrams();
            } finally {
                workspaceRoots.unregisterRoot(params.workspaceRoot);
            }
        },
    };
}
