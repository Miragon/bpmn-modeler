import { describe, expect, it } from "vitest";

import { isWorkspaceKind } from "./workspaceKinds";

describe("isWorkspaceKind", () => {
    it.each(["hexagonal", "diagram-js", "flat"])("accepts %s", (kind) => {
        expect(isWorkspaceKind(kind)).toBe(true);
    });

    it.each([undefined, "", "layered", "toString"])("rejects %s", (kind) => {
        expect(isWorkspaceKind(kind)).toBe(false);
    });
});
