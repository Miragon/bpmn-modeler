import { type DaemonServerEvent, decodeWorkspaceModelId } from "@miragon/bpmn-iq-daemon-client";

import type { BpmnIqSseEvent } from "./port";

/**
 * Map a parsed daemon SSE event into the consumer's normalized
 * {@link BpmnIqSseEvent}, scoped to the local `workspaceId`.
 *
 * Two consumer concerns the lib intentionally doesn't handle:
 *  - Filter out the new `workspace-*` variants of `ModelIndexEvent`
 *    we don't consume.
 *  - Drop events targeting a different workspaceId (cross-workspace
 *    isolation — daemon may multicast on a shared SSE channel).
 *
 * Returns `null` when an event should be ignored (foreign workspace,
 * non-model kind, workspace lifecycle event, malformed model-id).
 */
export function decodeSseEvent(e: DaemonServerEvent, workspaceId: string): BpmnIqSseEvent | null {
    if (e.kind !== "model") return null;
    const ev = e.event;

    if (ev.type === "model-removed") {
        const decoded = decodeWorkspaceModelId(ev.modelId);
        if (!decoded || decoded.workspaceId !== workspaceId) return null;
        return { type: "model-removed", modelId: ev.modelId };
    }

    if (ev.type !== "model-added" && ev.type !== "model-changed") return null;
    const model = ev.model;
    if (model.workspaceId !== workspaceId) return null;
    const decoded = decodeWorkspaceModelId(model.id);
    if (!decoded) return null;

    return {
        type: ev.type,
        modelRef: {
            id: model.id,
            relPath: decoded.relPath,
            sha256: model.sha256,
        },
    };
}
