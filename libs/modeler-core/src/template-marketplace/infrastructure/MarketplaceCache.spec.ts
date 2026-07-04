import { describe, expect, it, vi } from "vitest";

import { WorkspacePort } from "../../shared/domain/hostPorts";
import { MarketplaceCache } from "./MarketplaceCache";

/**
 * Minimal `WorkspacePort` double capturing only `writeFile` — the sole port
 * method `write` touches.
 */
function createWorkspace() {
    return {
        writeFile: vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue(),
    } as unknown as WorkspacePort & { writeFile: ReturnType<typeof vi.fn> };
}

describe("MarketplaceCache.write", () => {
    it("writes a normal path under <root>/<id>/<index>/<contentType>/<path>", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.write("acme", 0, "element-templates", "templates/a.json", "{}");

        expect(workspace.writeFile).toHaveBeenCalledWith(
            "/cache/acme/0/element-templates/templates/a.json",
            "{}",
        );
    });

    it.each([
        ["a parent-traversal path", "../../../settings.json"],
        ["an absolute posix path", "/etc/passwd"],
        ["a backslash traversal path", "..\\..\\settings.json"],
    ])("rejects %s and never writes", async (_label, repoPath) => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await expect(cache.write("acme", 0, "element-templates", repoPath, "{}")).rejects.toThrow(
            /unsafe template path/,
        );
        expect(workspace.writeFile).not.toHaveBeenCalled();
    });
});
