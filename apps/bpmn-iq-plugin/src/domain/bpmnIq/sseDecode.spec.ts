import { describe, expect, it } from "vitest";

import { encodeWorkspaceModelId } from "./pathUtils";
import { decodeSseEvent } from "./sseDecode";

const WS_ID = "ws-mine";
const FOREIGN_WS_ID = "ws-other";

const modelEvent = (workspaceId: string, relPath: string) => ({
    event: "model",
    data: JSON.stringify({
        kind: "model",
        event: {
            type: "model-changed",
            model: {
                id: encodeWorkspaceModelId(workspaceId, relPath),
                workspaceId,
                sha256: "deadbeef",
            },
        },
    }),
});

describe("decodeSseEvent", () => {
    it("decodes a model-changed event for our workspace into a modelRef", () => {
        const decoded = decodeSseEvent(modelEvent(WS_ID, "flows/order.bpmn"), WS_ID);
        expect(decoded).toEqual({
            type: "model-changed",
            modelRef: {
                id: encodeWorkspaceModelId(WS_ID, "flows/order.bpmn"),
                relPath: "flows/order.bpmn",
                sha256: "deadbeef",
            },
        });
    });

    it("returns null for events targeting a different workspace (isolation)", () => {
        const foreign = decodeSseEvent(modelEvent(FOREIGN_WS_ID, "flows/order.bpmn"), WS_ID);
        expect(foreign).toBeNull();
    });

    it("decodes a model-removed event with the modelId preserved", () => {
        const removed = {
            event: "model",
            data: JSON.stringify({
                kind: "model",
                event: {
                    type: "model-removed",
                    modelId: encodeWorkspaceModelId(WS_ID, "flows/old.bpmn"),
                },
            }),
        };
        expect(decodeSseEvent(removed, WS_ID)).toEqual({
            type: "model-removed",
            modelId: encodeWorkspaceModelId(WS_ID, "flows/old.bpmn"),
        });
    });

    it("returns null for malformed JSON or unknown event kinds", () => {
        expect(decodeSseEvent({ event: "model", data: "{bad" }, WS_ID)).toBeNull();
        expect(
            decodeSseEvent({ event: "heartbeat", data: "{}" }, WS_ID),
        ).toBeNull();
        expect(
            decodeSseEvent(
                { event: "model", data: JSON.stringify({ kind: "other" }) },
                WS_ID,
            ),
        ).toBeNull();
    });
});
