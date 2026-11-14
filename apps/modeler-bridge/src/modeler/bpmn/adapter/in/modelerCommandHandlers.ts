import {
    BpmnLayoutService,
    BpmnMigrationService,
    EngineVersionSelectionService,
    EditorSessionStore,
    ElementIdsService,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
    NotifierPort,
    ModelerLanguageService,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../../protocol/domain/rpcHandler";
import { EditorRefParams, MigrateAllParams } from "../../../../protocol/domain/types";
import { WorkspaceRoots } from "../../../../kernel/port/WorkspaceRoots";

/**
 * RPC (Host → Core): modeler/changeEngineVersion, modeler/changeLanguage, layout/format,
 * layout/cleanup, elementIds/generate, migration/migrateAll.
 */
export function modelerCommandHandlers({
    engineSelection,
    layout,
    elementIds,
    migration,
    store,
    notifier,
    workspaceRoots,
    language,
}: {
    engineSelection: EngineVersionSelectionService;
    layout: BpmnLayoutService;
    elementIds: ElementIdsService;
    migration: BpmnMigrationService;
    store: EditorSessionStore;
    notifier: NotifierPort;
    workspaceRoots: WorkspaceRoots;
    language: ModelerLanguageService;
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
        [METHODS.modelerChangeLanguage]: async () => {
            try {
                await language.changeLanguage();
            } catch (error) {
                notifier.logError(error instanceof Error ? error : new Error(String(error)));
            }
        },
        // Both services swallow their own errors (a dismissed prompt → silent, others →
        // a notifier balloon), so these handlers just await and never need a try/catch.
        [METHODS.modelerChangeEngineVersion]: async (params: EditorRefParams) => {
            await engineSelection.changeEngineVersion(params.editorId);
        },
        // Formatting and cleanup: the host fires them as notifications and the
        // outcome comes back over the webview channel, which the BPMN editor routes.
        [METHODS.layoutFormat]: () => withActiveEditor((id) => layout.format(id)),
        [METHODS.layoutCleanup]: () => withActiveEditor((id) => layout.inspectCleanup(id)),
        [METHODS.elementIdsGenerate]: () => withActiveEditor((id) => elementIds.generate(id)),
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
