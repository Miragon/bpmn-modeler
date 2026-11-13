import {
    type BpmnModelerSettingQuery,
    type CleanupDiagramQuery,
    CleanupReportCommand,
    DiagramFormattedCommand,
    type ElementTemplatesQuery,
    type GetDiagramAsSVGCommand,
    type HiddenElementTemplatesQuery,
    type HostThemeAdapter,
    type ImplementationStatusQuery,
    LogErrorCommand,
    OpenScriptEditorsCommand,
    type UpdateOpenScriptEditorsQuery,
    type UpdateScriptContentQuery,
    type UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";
import {
    type CleanupOutcome,
    DEFAULT_FORM_PREVIEW_AUTOMATIC,
    extractProcessVariables,
} from "@miragon/bpmn-modeler-types";
import { isEditableSurface, isModelerSurface } from "@miragon/bpmn-modeler/mode";

import type { HostModelerState } from "../../domain/hostModelerState";
import type { SurfaceHandle } from "../../domain/surface";
import { receiveErrorPrefix } from "../../domain/receiveErrorPrefix";
import type { HostChannel } from "../../port/hostChannel";

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
    HiddenElementTemplatesQuery(query: HiddenElementTemplatesQuery): void;
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
        setFormPreviewAutomatic,
    }: {
        hostModelerState: Pick<HostModelerState, "rememberSettings" | "rememberOpenScripts">;
        theme: Pick<HostThemeAdapter, "setMode">;
        replies: SurfaceRequestReplies;
        setFormPreviewAutomatic: (enabled: boolean) => void;
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
                if (isModelerSurface(surface)) {
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
                    if (isEditableSurface(surface)) {
                        // The outcome is reported by the `onFormatted`
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
                    const outcome: CleanupOutcome = isEditableSurface(surface)
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
                if (isModelerSurface(surface)) {
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
                if (isModelerSurface(surface)) {
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
                if (isModelerSurface(surface)) {
                    surface.applyOpenScriptEditors(query.openScripts);
                }
            },
            ImplementationStatusQuery: (query) => {
                const surface = getSurface();
                if (isModelerSurface(surface)) {
                    surface.applyImplementationStatus(query.resolved);
                }
            },
            ElementTemplatesQuery: (query) => {
                try {
                    console.debug("Received element templates: ", query.elementTemplates);
                    const surface = getSurface();
                    if (isModelerSurface(surface)) {
                        surface.setHiddenElementTemplates(query.hiddenTemplates);
                        surface.setElementTemplates(query.elementTemplates);
                    }
                } finally {
                    // Resolve even on a facade throw — otherwise the boot
                    // restore starves and startPersisting never runs.
                    replies.elementTemplates.done(query);
                }
            },
            HiddenElementTemplatesQuery: (query) => {
                // Another surface needs nothing: a modeler built later asks for both.
                const surface = getSurface();
                if (isModelerSurface(surface)) {
                    surface.setHiddenElementTemplates(query.hiddenTemplates);
                }
            },
            BpmnModelerSettingQuery: (query) => {
                hostModelerState.rememberSettings(query.setting);
                try {
                    setFormPreviewAutomatic(
                        query.formPreviewAutomatic ?? DEFAULT_FORM_PREVIEW_AUTOMATIC,
                    );
                    // Theme is host policy: the package's setSettings does not
                    // apply `colorTheme`, so the host adapter drives it.
                    theme.setMode(query.setting.colorTheme);
                    // Of the rest, the designer honours only the favourites and
                    // the viewer nothing.
                    const surface = getSurface();
                    const favourites = query.setting.favouriteBpmnElements;
                    if (isModelerSurface(surface)) {
                        surface.setSettings(query.setting);
                    } else if (isEditableSurface(surface) && favourites) {
                        surface.setFavouriteBpmnElements(favourites);
                    }
                } finally {
                    // Resolve even on a facade throw — otherwise the boot
                    // restore starves and startPersisting never runs.
                    replies.settings.done(query);
                }
            },
        },
    };
}
