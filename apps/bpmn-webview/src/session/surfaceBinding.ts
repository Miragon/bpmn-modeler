import type { ModelerCapabilities } from "@miragon/bpmn-modeler";
import {
    DiagramFormattedCommand,
    type ElementTemplatesQuery,
    GetBpmnlintConfigCommand,
    GetElementTemplatesCommand,
    type WebviewStateHost,
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
import type { HostChannel } from "./hostChannel";
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
    host: HostChannel & WebviewStateHost<WebviewState>,
    { session, panelRoot, engine, capabilities, elementTemplatesReply }: SurfaceBinderPorts,
): SurfaceBinder {
    function bindSurface(handle: SurfaceHandle): SurfaceBinding {
        // The readonly viewer never schedules a sync, so a host flush finds nothing pending.
        if (isEditableHandle(handle)) {
            handle.onCommandStackChanged(() => session.scheduleSync());
        }

        // One report per format, whether the host command, the palette or the
        // canvas shortcut started it; only the host command has a caller.
        if (isFormattableHandle(handle)) {
            handle.onFormatted((outcome) => {
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
