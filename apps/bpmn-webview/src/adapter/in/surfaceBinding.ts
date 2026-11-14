import type { ModelerCapabilities } from "@miragon/bpmn-modeler";
import {
    createWebviewStateStore,
    DiagramFormattedCommand,
    type ElementTemplatesQuery,
    GetBpmnlintConfigCommand,
    GetElementTemplatesCommand,
    PropertiesPanelUiStateAdapter,
    type WebviewStateHost,
} from "@miragon/bpmn-modeler-shared";
import { type DetectedEngine, engineSupports } from "@miragon/bpmn-modeler-types";
import { isEditableSurface, isModelerSurface } from "@miragon/bpmn-modeler/mode";

import { WebviewStateManager } from "../../service/state";
import type { SurfaceHandle } from "../../domain/surface";
import type { WebviewState } from "../../port/webviewState";
import type { BpmnDocumentSession } from "../../service/documentSession";
import type { HostChannel } from "../../port/hostChannel";
import type { HostElementIdReview } from "../../service/hostElementIdReview";
import { createProcessVariablePublisher } from "../../service/processVariablePublisher";

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
    elementIdReview: Pick<HostElementIdReview, "refresh">;
}

export function createSurfaceBinder(
    host: HostChannel & WebviewStateHost<WebviewState>,
    {
        session,
        panelRoot,
        engine,
        capabilities,
        elementTemplatesReply,
        elementIdReview,
    }: SurfaceBinderPorts,
): SurfaceBinder {
    const stateStore = createWebviewStateStore(host);

    function bindSurface(handle: SurfaceHandle): SurfaceBinding {
        // The readonly viewer never schedules a sync, so a host flush finds nothing pending.
        if (isEditableSurface(handle)) {
            handle.onCommandStackChanged(() => {
                session.scheduleSync();
                elementIdReview.refresh();
            });

            // One report per format, whether the host command, the palette or the
            // canvas shortcut started it; only the host command has a caller.
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

        let cancelPendingVariablePublish = (): void => {
            // Only a scripting modeler publishes variables, so nothing else has a publish to cancel.
        };
        if (
            isModelerSurface(handle) &&
            engineSupports(engine, "inlineScripting") &&
            capabilities.scripting
        ) {
            const variables = createProcessVariablePublisher(host, handle, session);
            cancelPendingVariablePublish = variables.cancel;
            handle.onCommandStackChanged(variables.schedule);
            // An import fires no commandStack.changed, and a reloaded webview starts
            // with an empty host-side store.
            variables.schedule();
        }

        return {
            stateManager: new WebviewStateManager(
                stateStore,
                handle,
                new PropertiesPanelUiStateAdapter(stateStore, panelRoot),
            ),
            dispose: () => cancelPendingVariablePublish(),
        };
    }

    // A viewer or designer never receives templates, so the restore chain would
    // stall on a reply that never comes; the designer still lints.
    function requestSurfaceResources(handle: SurfaceHandle): void {
        // A surface built by a mode switch has its diagram by now; View mode says it cannot rename.
        elementIdReview.refresh();
        if (isModelerSurface(handle)) {
            host.postMessage(new GetElementTemplatesCommand());
        } else {
            elementTemplatesReply.done(undefined);
        }
        if (isEditableSurface(handle)) {
            host.postMessage(new GetBpmnlintConfigCommand());
        }
    }

    return { bindSurface, requestSurfaceResources };
}
