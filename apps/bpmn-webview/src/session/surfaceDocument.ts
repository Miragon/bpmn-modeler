import { LogWarningCommand } from "@miragon/bpmn-modeler-shared";
import { formatErrors } from "@miragon/bpmn-modeler-types";

import type { WebviewStateManager } from "../state";
import { isEditableHandle, isModelerHandle, type SurfaceHandle } from "../surface";
import type { BpmnDocumentSurface } from "./documentSession";
import type { HostChannel } from "./hostChannel";

type ViewStateKeeper = Pick<WebviewStateManager, "captureViewState" | "applyViewState">;

interface SurfaceDocumentPorts {
    getSurface(): SurfaceHandle;
    /** `undefined` until the surface is bound after its first import. */
    getViewState(): ViewStateKeeper | undefined;
}

/**
 * Backs the document session with whichever surface is live, keeping the
 * user's plane, viewbox and selection across re-imports.
 */
export function createSurfaceDocument(
    host: HostChannel,
    { getSurface, getViewState }: SurfaceDocumentPorts,
): BpmnDocumentSurface {
    async function openDocument(content: string | undefined): Promise<void> {
        const surface = getSurface();
        // The readonly viewer cannot start a blank diagram, so it always loads the host XML.
        const result =
            !content && isEditableHandle(surface)
                ? await surface.newDiagram()
                : await surface.loadDiagram(content ?? "");
        if (result.warnings.length > 0) {
            host.postMessage(
                new LogWarningCommand(
                    `Diagram opened with following warnings: ${formatErrors(result.warnings)}`,
                ),
            );
        }
    }

    async function reimportPreservingView(reimport: () => Promise<void>): Promise<void> {
        const snapshot = getViewState()?.captureViewState();
        try {
            await reimport();
        } finally {
            // The import already reset the canvas to the top-level plane, so a
            // post-import throw must not strand the user there.
            if (snapshot) {
                getViewState()?.applyViewState(snapshot);
            }
        }
    }

    return {
        // The session calls this inside its debounced queue, so a burst of pushes captures once.
        importDocument: (content) => reimportPreservingView(() => openDocument(content)),
        exportDocument: () => getSurface().exportDiagram(),
        afterSync: () => {
            const surface = getSurface();
            if (isModelerHandle(surface)) {
                surface.alignElementsToOrigin();
            }
        },
        // bpmn-js re-invokes `translate()` for rendered elements only on a re-import.
        refreshDiagram: async () => {
            const xml = await getSurface().exportDiagram();
            await reimportPreservingView(async () => {
                await getSurface().loadDiagram(xml);
            });
        },
        centerOnElement: (elementId) => getSurface().viewport.centerOnElement(elementId),
    };
}
