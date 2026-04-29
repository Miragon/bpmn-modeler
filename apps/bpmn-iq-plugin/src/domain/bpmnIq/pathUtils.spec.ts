import { describe, expect, it } from "vitest";

import {
    decodeWorkspaceModelId,
    encodeWorkspaceModelId,
    isSafeRelPath,
} from "./pathUtils";

describe("isSafeRelPath", () => {
    it.each([
        ["order-fulfillment.bpmn", true],
        ["processes/order.bpmn", true],
        ["a/b/c.bpmn", true],
    ])("accepts clean relative POSIX path %p", (input, expected) => {
        expect(isSafeRelPath(input)).toBe(expected);
    });

    it.each([
        ["", false],
        ["/absolute.bpmn", false],
        ["..", false],
        ["..\\evil.bpmn", false],
        ["a\\b.bpmn", false],
        ["processes/../secret.bpmn", false],
        ["./foo.bpmn", false],
        ["processes/./foo.bpmn", false],
        ["a//b.bpmn", false],
    ])("rejects unsafe input %p", (input, expected) => {
        expect(isSafeRelPath(input)).toBe(expected);
    });
});

describe("encodeWorkspaceModelId / decodeWorkspaceModelId", () => {
    it("round-trips a simple workspace model id", () => {
        const workspaceId = "8f3a2b14-aa22-4b01-9f1d-dbaf4fcd9f9f";
        const relPath = "processes/order.bpmn";
        const id = encodeWorkspaceModelId(workspaceId, relPath);
        expect(id).toBe(`workspace:${workspaceId}:processes%2Forder.bpmn`);
        expect(decodeWorkspaceModelId(id)).toEqual({ workspaceId, relPath });
    });

    it("escapes non-ascii chars and decodes them back", () => {
        const workspaceId = "ws1";
        const relPath = "Modelle/Übersicht.bpmn";
        const id = encodeWorkspaceModelId(workspaceId, relPath);
        expect(decodeWorkspaceModelId(id)).toEqual({ workspaceId, relPath });
    });

    it("returns null for ids that do not carry the workspace prefix", () => {
        expect(decodeWorkspaceModelId("upload:foo")).toBeNull();
        expect(decodeWorkspaceModelId("foo")).toBeNull();
    });

    it("returns null when the separator after the workspace id is missing", () => {
        expect(decodeWorkspaceModelId("workspace:bare-id")).toBeNull();
    });

    it("returns null when the workspace id section is empty", () => {
        expect(decodeWorkspaceModelId("workspace::foo")).toBeNull();
    });

    it("returns null when the relPath contains a malformed URI escape", () => {
        expect(decodeWorkspaceModelId("workspace:ws1:%FFbad")).toBeNull();
    });
});
