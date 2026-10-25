import {
    type BpmnModelerSettingQuery,
    type CleanupDiagramQuery,
    CleanupReportCommand,
    DiagramFormattedCommand,
    type ElementTemplatesQuery,
    type GetDiagramAsSVGCommand,
    type HostThemeAdapter,
    type ImplementationStatusQuery,
    LogErrorCommand,
    LogWarningCommand,
    OpenScriptEditorsCommand,
    ShowInfoCommand,
    type UpdateOpenScriptEditorsQuery,
    type UpdateScriptContentQuery,
    type UpdateScriptFormatQuery,
    extractProcessVariables,
} from "@miragon/bpmn-modeler-shared";
import type { CleanupOutcome } from "@miragon/bpmn-modeler-types";

import type { HostModelerState } from "../hostModelerState";
import {
    isEditableHandle,
    isFormattableHandle,
    isModelerHandle,
    type SurfaceHandle,
} from "../surface";
import { type HostChannel, receiveErrorPrefix } from "./hostChannel";

interface SurfaceRequestHandlers {
    GetDiagramAsSVGCommand(command: GetDiagramAsSVGCommand): Promise<void>;
    OpenAllScriptTasksQuery(): void;
    FormatDiagramQuery(): Promise<void>;
    CleanupDiagramQuery(query: CleanupDiagramQuery): void;
    UpdateScriptContentQuery(query: UpdateScriptContentQuery): void;
    UpdateScriptFormatQuery(query: UpdateScriptFormatQuery): void;
    UpdateOpenScriptEditorsQuery(query: UpdateOpenScriptEditorsQuery): void;
    ImplementationStatusQuery(query: ImplementationStatusQuery): void;
    ElementTemplatesQuery(query: ElementTemplatesQuery): void;
    BpmnModelerSettingQuery(query: BpmnModelerSettingQuery): void;
}

interface ReplySink<Reply> {
    done(reply: Reply): void;
}

/** The boot restore holds the selection back until both replies' side effects have run. */
interface SurfaceRequestReplies {
    elementTemplates: ReplySink<ElementTemplatesQuery>;
    settings: ReplySink<BpmnModelerSettingQuery>;
}

export interface SurfaceRequests {
    readonly handlers: SurfaceRequestHandlers;
    reportElementTemplateErrors(errors: readonly unknown[] | undefined): void;
}

export interface ElementTemplateRejectionReport {
    readonly logLines: readonly string[];
    /** One notice for the whole batch; `undefined` when nothing was rejected. */
    readonly notice: string | undefined;
}

export function elementTemplateRejectionReport(
    errors: readonly unknown[] | undefined,
): ElementTemplateRejectionReport {
    const messages = (errors ?? []).map((error) =>
        error instanceof Error ? error.message : String(error),
    );
    return {
        logLines: messages.map((message) => `Element template rejected: ${message}`),
        notice: rejectionNotice(messages.length),
    };
}

function rejectionNotice(rejectedCount: number): string | undefined {
    if (rejectedCount === 0) {
        return undefined;
    }
    return rejectedCount === 1
        ? "An element template was rejected and is ignored. See the log for details."
        : `${rejectedCount} element templates were rejected and are ignored. See the log for details.`;
}

/**
 * A request the surface kind cannot serve is a no-op unless the host awaits an
 * answer; a handler that fails without a dedicated failure reply throws.
 */
export function createSurfaceRequests(
    host: HostChannel,
    getSurface: () => SurfaceHandle,
    {
        hostModelerState,
        theme,
        replies,
    }: {
        hostModelerState: Pick<HostModelerState, "rememberSettings" | "rememberOpenScripts">;
        theme: Pick<HostThemeAdapter, "setMode">;
        replies: SurfaceRequestReplies;
    },
): SurfaceRequests {
    return {
        handlers: {
            GetDiagramAsSVGCommand: async (command) => {
                command.svg = await getSurface().getDiagramSvg();
                host.postMessage(command);
            },
            OpenAllScriptTasksQuery: () => {
                // One bulk reply so the host opens the scripts sequentially; the
                // variable model is the same for every script, so it is extracted once.
                const surface = getSurface();
                if (isModelerHandle(surface)) {
                    const scripts = surface.collectInlineScriptTasks();
                    host.postMessage(
                        new OpenScriptEditorsCommand(
                            scripts,
                            extractProcessVariables(surface.getDefinitions()),
                        ),
                    );
                }
            },
            FormatDiagramQuery: async () => {
                try {
                    const surface = getSurface();
                    if (isFormattableHandle(surface)) {
                        // The outcome is reported by the `layout.formatted`
                        // subscription in `bindSurface`, so the keyboard
                        // shortcut and this command report through one path.
                        await surface.formatDiagram();
                    } else {
                        host.postMessage(
                            new DiagramFormattedCommand("failed", [], "UNSUPPORTED_SURFACE"),
                        );
                    }
                } catch (error) {
                    host.postMessage(
                        new DiagramFormattedCommand(
                            "failed",
                            [],
                            "ENGINE_FAILED",
                            (error as Error).message,
                        ),
                    );
                }
            },
            CleanupDiagramQuery: (query) => {
                const { apply } = query;
                const errorPrefix = receiveErrorPrefix(query.type);
                try {
                    const surface = getSurface();
                    // A surface without the capability is a failure to report,
                    // not a clean diagram — an empty report would be shown as
                    // "nothing to clean up".
                    const outcome: CleanupOutcome = isFormattableHandle(surface)
                        ? surface.cleanupDiagram({ apply })
                        : {
                              status: "failed",
                              items: [],
                              message: "this surface cannot be cleaned up",
                          };
                    if (outcome.status === "failed" && outcome.message) {
                        host.postMessage(new LogErrorCommand(errorPrefix + outcome.message));
                    }
                    host.postMessage(new CleanupReportCommand(outcome, apply));
                } catch (error) {
                    const message = (error as Error).message;
                    host.postMessage(new LogErrorCommand(errorPrefix + message));
                    // Always reply: the host holds a one-shot subscription that
                    // would otherwise leak waiting for a report.
                    host.postMessage(
                        new CleanupReportCommand({ status: "failed", items: [], message }, apply),
                    );
                }
            },
            UpdateScriptContentQuery: (query) => {
                const surface = getSurface();
                if (isModelerHandle(surface)) {
                    surface.updateScriptContent(
                        query.elementId,
                        query.kind,
                        query.listenerIndex,
                        query.content,
                    );
                }
            },
            UpdateScriptFormatQuery: (query) => {
                const surface = getSurface();
                if (isModelerHandle(surface)) {
                    surface.updateScriptFormat(
                        query.elementId,
                        query.kind,
                        query.listenerIndex,
                        query.scriptFormat,
                    );
                }
            },
            UpdateOpenScriptEditorsQuery: (query) => {
                hostModelerState.rememberOpenScripts(query.openScripts);
                const surface = getSurface();
                if (isModelerHandle(surface)) {
                    surface.applyOpenScriptEditors(query.openScripts);
                }
            },
            ImplementationStatusQuery: (query) => {
                const surface = getSurface();
                if (isModelerHandle(surface)) {
                    surface.applyImplementationStatus(query.resolved);
                }
            },
            ElementTemplatesQuery: (query) => {
                try {
                    console.debug("Received element templates: ", query.elementTemplates);
                    const surface = getSurface();
                    if (isModelerHandle(surface)) {
                        surface.setElementTemplates(query.elementTemplates);
                    }
                } finally {
                    // Resolve even on a facade throw — otherwise the boot
                    // restore starves and startPersisting never runs.
                    replies.elementTemplates.done(query);
                }
            },
            BpmnModelerSettingQuery: (query) => {
                hostModelerState.rememberSettings(query.setting);
                try {
                    // Theme is host policy: the package's setSettings does not
                    // apply `colorTheme`, so the host adapter drives it.
                    theme.setMode(query.setting.colorTheme);
                    // Of the rest, the designer honours only the favourites and
                    // the viewer nothing.
                    const surface = getSurface();
                    const favourites = query.setting.favouriteBpmnElements;
                    if (isModelerHandle(surface)) {
                        surface.setSettings(query.setting);
                    } else if (isEditableHandle(surface) && favourites) {
                        surface.setFavouriteBpmnElements(favourites);
                    }
                } finally {
                    // Resolve even on a facade throw — otherwise the boot
                    // restore starves and startPersisting never runs.
                    replies.settings.done(query);
                }
            },
        },
        reportElementTemplateErrors: (errors) => {
            const report = elementTemplateRejectionReport(errors);
            for (const logLine of report.logLines) {
                host.postMessage(new LogWarningCommand(logLine));
            }
            if (report.notice) {
                host.postMessage(new ShowInfoCommand(report.notice));
            }
        },
    };
}
