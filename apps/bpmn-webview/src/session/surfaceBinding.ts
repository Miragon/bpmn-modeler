import type { ModelerCapabilities } from "@miragon/bpmn-modeler";
import { LAYOUT_FORMATTED_EVENT, type LayoutOutcome } from "@miragon/bpmn-modeler-layout";
import {
    type Command,
    DiagramFormattedCommand,
    type ElementTemplatesQuery,
    GetBpmnlintConfigCommand,
    GetElementTemplatesCommand,
    type HostApi,
    type Query,
} from "@miragon/bpmn-modeler-shared";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

import { WebviewStateManager } from "../state";
import {
    isEditableHandle,
    isFormattableHandle,
    isLintingHandle,
    isModelerHandle,
    type SurfaceHandle,
} from "../surface";
import type { WebviewState } from "../webviewState";
import type { BpmnDocumentSession } from "./documentSession";
import { createProcessVariablePublisher } from "./processVariablePublisher";

export interface SurfaceBinding {
    readonly stateManager: WebviewStateManager;
    /** The subscriptions die with the surface; this drops the work they already scheduled. */
    dispose(): void;
}

export interface SurfaceBinder {
    /** A (re)created surface left unbound silently stops syncing and persisting. */
    bindSurface(handle: SurfaceHandle): SurfaceBinding;
    requestSurfaceResources(handle: SurfaceHandle): void;
}

interface SurfaceBinderPorts {
    session: Pick<BpmnDocumentSession, "scheduleSync" | "isReloadingForEngine">;
    panelRoot: HTMLElement;
    engine: DetectedEngine;
    capabilities: Pick<ModelerCapabilities, "scripting">;
    elementTemplatesReply: { done(reply: ElementTemplatesQuery | undefined): void };
}

export function createSurfaceBinder(
    host: HostApi<WebviewState, Command | Query>,
    { session, panelRoot, engine, capabilities, elementTemplatesReply }: SurfaceBinderPorts,
): SurfaceBinder {
    function bindSurface(handle: SurfaceHandle): SurfaceBinding {
        // The readonly viewer never schedules a sync, so a host flush finds nothing pending.
        if (isModelerHandle(handle)) {
            handle.onCommandStackChanged(() => session.scheduleSync());
        } else if (isEditableHandle(handle)) {
            handle
                .getService<{ on(event: string, cb: () => void): void }>("eventBus")
                .on("commandStack.changed", () => session.scheduleSync());
        }

        // The canvas shortcut and the host command both end in `Layouter.format`,
        // which announces every outcome here instead of returning it to either caller.
        if (isFormattableHandle(handle)) {
            handle
                .getService<{
                    on(event: string, cb: (outcome: LayoutOutcome) => void): void;
                }>("eventBus")
                .on(LAYOUT_FORMATTED_EVENT, (outcome) => {
                    host.postMessage(
                        new DiagramFormattedCommand(
                            outcome.status,
                            outcome.diagnostics,
                            outcome.code,
                            outcome.message,
                        ),
                    );
                });
        }

        let cancelPendingVariablePublish = (): void => {};
        // Scripting is a C7 cluster, so only a C7 modeler with the scripting port publishes.
        if (isModelerHandle(handle) && engine === "c7" && capabilities.scripting) {
            const variables = createProcessVariablePublisher(host, handle, session);
            cancelPendingVariablePublish = variables.cancel;
            handle.onCommandStackChanged(variables.schedule);
            // An import fires no commandStack.changed, and a reloaded webview starts
            // with an empty host-side store.
            variables.schedule();
        }

        return {
            stateManager: new WebviewStateManager(host, handle, panelRoot),
            dispose: () => cancelPendingVariablePublish(),
        };
    }

    // A viewer or designer never receives templates, so the restore chain would
    // stall on a reply that never comes; the designer still lints.
    function requestSurfaceResources(handle: SurfaceHandle): void {
        if (isModelerHandle(handle)) {
            host.postMessage(new GetElementTemplatesCommand());
        } else {
            elementTemplatesReply.done(undefined);
        }
        if (isLintingHandle(handle)) {
            host.postMessage(new GetBpmnlintConfigCommand());
        }
    }

    return { bindSurface, requestSurfaceResources };
}
