import type { SourcedModel } from "@miragon/bpmn-iq-daemon-client";

import type { BpmnIqSseEvent } from "./BpmnIqPort";
import { decodeWorkspaceModelId } from "./pathUtils";

/** Shape of a daemon-client SSE message at the wire level. */
export interface RawSseMessage {
    event: string;
    data: string;
}

interface RawServerEvent {
    kind: string;
    event?: {
        type: "model-added" | "model-changed" | "model-removed";
        model?: SourcedModel;
        modelId?: string;
    };
}

/**
 * Decode a raw daemon SSE message into a normalized {@link BpmnIqSseEvent},
 * scoped to the local `workspaceId`.
 *
 * Returns `null` for:
 *   - non-`model` events
 *   - events targeting a different workspaceId (cross-workspace isolation)
 *   - malformed JSON
 *   - unknown event kinds / missing required payload fields
 *
 * Pure function — no network, no vscode, easy to unit-test.
 */
export function decodeSseEvent(
    raw: RawSseMessage,
    workspaceId: string,
): BpmnIqSseEvent | null {
    if (raw.event !== "model") return null;

    let payload: RawServerEvent;
    try {
        payload = JSON.parse(raw.data) as RawServerEvent;
    } catch {
        return null;
    }
    if (payload.kind !== "model" || !payload.event) return null;

    const ev = payload.event;
    if (ev.type === "model-removed") {
        if (!ev.modelId) return null;
        const decoded = decodeWorkspaceModelId(ev.modelId);
        if (!decoded || decoded.workspaceId !== workspaceId) return null;
        return { type: "model-removed", modelId: ev.modelId };
    }

    const model = ev.model;
    if (!model || model.workspaceId !== workspaceId) return null;
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
