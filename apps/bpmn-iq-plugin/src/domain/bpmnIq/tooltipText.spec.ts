import { describe, expect, it } from "vitest";

import type { BpmnIqSyncSnapshot } from "./BpmnIqState";
import { buildSyncTooltipMarkdown, escapeMd } from "./tooltipText";

describe("buildSyncTooltipMarkdown", () => {
    it("renders workspace name, branch and workspace id when all are present", () => {
        const snap: BpmnIqSyncSnapshot = {
            status: "syncing",
            workspaceName: "demo",
            workspaceId: "ws-123",
            branch: "main",
            modelCount: 1,
        };
        const md = buildSyncTooltipMarkdown(snap, "http://localhost:4000");
        expect(md).toContain("**Workspace**: demo");
        expect(md).toContain("**Branch**: main");
        expect(md).toContain("**Workspace ID**: `ws-123`");
        expect(md).toContain("**Web UI**: http://localhost:5173/?ws=ws-123");
    });

    it("omits the branch line when no branch is set", () => {
        const snap: BpmnIqSyncSnapshot = {
            status: "syncing",
            workspaceName: "demo",
            workspaceId: "ws-123",
            modelCount: 0,
        };
        const md = buildSyncTooltipMarkdown(snap, "http://localhost:4000");
        expect(md).not.toContain("Branch");
    });
});

describe("escapeMd", () => {
    it("escapes characters that would otherwise break tooltip markdown", () => {
        expect(escapeMd("foo *bar* [baz]")).toBe("foo \\*bar\\* \\[baz\\]");
    });
});
