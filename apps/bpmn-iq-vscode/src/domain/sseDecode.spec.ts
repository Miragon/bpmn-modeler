import { describe, expect, it } from "vitest";

import {
    type DaemonServerEvent,
    type StoredModel,
    type WorkspaceMeta,
    encodeWorkspaceModelId,
} from "@miragon/bpmn-iq-daemon-client";

import { decodeSseEvent } from "./sseDecode";

const WS_ID = "ws-mine";
const FOREIGN_WS_ID = "ws-other";

const storedModel = (workspaceId: string, relPath: string): StoredModel => ({
    id: encodeWorkspaceModelId(workspaceId, relPath),
    source: "workspace",
    fileName: relPath,
    workspaceId,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    sizeBytes: 42,
    sha256: "deadbeef",
});

const modelChanged = (workspaceId: string, relPath: string): DaemonServerEvent => ({
    kind: "model",
    event: { type: "model-changed", model: storedModel(workspaceId, relPath) },
});

const workspaceMeta: WorkspaceMeta = {
    workspaceId: WS_ID,
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
};

describe("decodeSseEvent", () => {
    it("decodes a model-changed event for our workspace into a modelRef", () => {
        const decoded = decodeSseEvent(modelChanged(WS_ID, "flows/order.bpmn"), WS_ID);
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
        const foreign = decodeSseEvent(modelChanged(FOREIGN_WS_ID, "flows/order.bpmn"), WS_ID);
        expect(foreign).toBeNull();
    });

    it("decodes a model-removed event with the modelId preserved", () => {
        const removed: DaemonServerEvent = {
            kind: "model",
            event: {
                type: "model-removed",
                modelId: encodeWorkspaceModelId(WS_ID, "flows/old.bpmn"),
            },
        };
        expect(decodeSseEvent(removed, WS_ID)).toEqual({
            type: "model-removed",
            modelId: encodeWorkspaceModelId(WS_ID, "flows/old.bpmn"),
        });
    });

    it("returns null for model-removed events targeting a foreign workspace", () => {
        const removed: DaemonServerEvent = {
            kind: "model",
            event: {
                type: "model-removed",
                modelId: encodeWorkspaceModelId(FOREIGN_WS_ID, "flows/old.bpmn"),
            },
        };
        expect(decodeSseEvent(removed, WS_ID)).toBeNull();
    });

    it("returns null for non-model event kinds (hello/session/todo/ping)", () => {
        expect(decodeSseEvent({ kind: "hello", now: "now" }, WS_ID)).toBeNull();
        expect(decodeSseEvent({ kind: "ping" }, WS_ID)).toBeNull();
        expect(
            decodeSseEvent(
                {
                    kind: "session",
                    state: { activeModelId: "x", updatedAt: "now" },
                },
                WS_ID,
            ),
        ).toBeNull();
    });

    it("ignores workspace-lifecycle variants of ModelIndexEvent", () => {
        const wsAdded: DaemonServerEvent = {
            kind: "model",
            event: { type: "workspace-added", workspace: workspaceMeta },
        };
        const wsRemoved: DaemonServerEvent = {
            kind: "model",
            event: { type: "workspace-removed", workspaceId: WS_ID },
        };
        expect(decodeSseEvent(wsAdded, WS_ID)).toBeNull();
        expect(decodeSseEvent(wsRemoved, WS_ID)).toBeNull();
    });

    it("returns null when the model id doesn't decode (not workspace-scoped)", () => {
        const event: DaemonServerEvent = {
            kind: "model",
            event: {
                type: "model-added",
                model: {
                    ...storedModel(WS_ID, "ignored"),
                    id: "upload:not-a-workspace-id",
                },
            },
        };
        expect(decodeSseEvent(event, WS_ID)).toBeNull();
    });
});
