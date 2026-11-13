import { LogWarningCommand } from "@miragon/bpmn-modeler-shared";
import { formatErrors, isBlankDocument } from "@miragon/bpmn-modeler-types";
import { isEditableSurface, isModelerSurface } from "@miragon/bpmn-modeler/mode";

import type { SurfaceHandle } from "../../domain/surface";
import type { BpmnDocumentSurface } from "../../port/documentSessionPorts";
import type { HostChannel } from "../../port/hostChannel";

interface SurfaceDocumentPorts {
    getSurface(): SurfaceHandle;
    /** An import fires no command stack change, so what follows the diagram hears of it here. */
    afterImport(): void;
}

/**
 * Backs the document session with whichever surface is live; the surface's
 * `reloadDiagram` keeps the user's plane, viewbox and selection across re-imports.
 */
export function createSurfaceDocument(
    host: HostChannel,
    { getSurface, afterImport }: SurfaceDocumentPorts,
): BpmnDocumentSurface {
    async function openDocument(content: string | undefined): Promise<void> {
        const surface = getSurface();
        // The readonly viewer cannot start a blank diagram, so it always loads the host XML.
        const result =
            isBlankDocument(content) && isEditableSurface(surface)
                ? await surface.newDiagram()
                : await surface.reloadDiagram(content ?? "");
        if (result.warnings.length > 0) {
            host.postMessage(
                new LogWarningCommand(
                    `Diagram opened with following warnings: ${formatErrors(result.warnings)}`,
                ),
            );
        }
    }

    return {
        // The session calls this inside its debounced queue, so a burst of pushes imports once.
        importDocument: async (content) => {
            await openDocument(content);
            afterImport();
        },
        exportDocument: () => getSurface().exportDiagram(),
        afterSync: () => {
            const surface = getSurface();
            if (isModelerSurface(surface)) {
                surface.alignElementsToOrigin();
            }
        },
        hasPendingInput: () => {
            const surface = getSurface();
            return isEditableSurface(surface) && surface.hasPendingInput();
        },
        flushPendingInput: () => {
            const surface = getSurface();
            if (isEditableSurface(surface)) {
                surface.flushPendingInput();
            }
        },
        // bpmn-js re-invokes `translate()` for rendered elements only on a re-import.
        refreshDiagram: async () => {
            const xml = await getSurface().exportDiagram();
            await getSurface().reloadDiagram(xml);
        },
        centerOnElement: (elementId) => getSurface().viewport.centerOnElement(elementId),
    };
}
