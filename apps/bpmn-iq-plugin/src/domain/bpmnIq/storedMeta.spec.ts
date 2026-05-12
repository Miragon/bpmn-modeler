import { describe, expect, it } from "vitest";

import { parseStoredMeta } from "./storedMeta";

describe("parseStoredMeta", () => {
    it("reads the legacy `wsId` field as `workspaceId` (migration invariant)", () => {
        const json = JSON.stringify({
            wsId: "legacy-id",
            name: "Old workspace",
            createdAt: "2026-01-01T00:00:00.000Z",
        });
        expect(parseStoredMeta(json)).toEqual({
            workspaceId: "legacy-id",
            name: "Old workspace",
            createdAt: "2026-01-01T00:00:00.000Z",
            repoId: undefined,
            repoSlug: undefined,
            branch: undefined,
        });
    });

    it("prefers the modern `workspaceId` when both fields are present", () => {
        const json = JSON.stringify({
            workspaceId: "new-id",
            wsId: "legacy-id",
            name: "Migrated",
            createdAt: "2026-01-01T00:00:00.000Z",
        });
        expect(parseStoredMeta(json)?.workspaceId).toBe("new-id");
    });

    it("returns null when required fields are missing", () => {
        const noId = JSON.stringify({ name: "x", createdAt: "2026-01-01T00:00:00.000Z" });
        const noName = JSON.stringify({ workspaceId: "x", createdAt: "2026-01-01T00:00:00.000Z" });
        const noCreatedAt = JSON.stringify({ workspaceId: "x", name: "x" });
        expect(parseStoredMeta(noId)).toBeNull();
        expect(parseStoredMeta(noName)).toBeNull();
        expect(parseStoredMeta(noCreatedAt)).toBeNull();
    });

    it("returns null on malformed JSON", () => {
        expect(parseStoredMeta("{not json")).toBeNull();
    });
});
