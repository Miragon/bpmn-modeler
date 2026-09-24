import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileNotFound } from "../../shared/domain/errors";
import { EnvValueResolver } from "./EnvValueResolver";

function setup(options: {
    dotEnv?: Record<string, string> | "missing";
    processEnv?: Record<string, string>;
    workspaceRoot?: string;
    workspaceFolders?: string[];
}) {
    const readFile = vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".env")) {
            if (options.dotEnv === "missing" || options.dotEnv === undefined) {
                throw new FileNotFound(path);
            }
            return Object.entries(options.dotEnv)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n");
        }
        throw new FileNotFound(path);
    });
    const artifactService = {
        getWorkspaceRoot: vi.fn().mockResolvedValue(options.workspaceRoot ?? "/work"),
    };
    const workspace = {
        readFile,
        getWorkspaceFolderPaths: vi.fn().mockReturnValue(options.workspaceFolders ?? ["/work"]),
    };
    const env = { get: (name: string) => options.processEnv?.[name] };
    const resolver = new EnvValueResolver(
        artifactService as never,
        workspace as never,
        env as never,
    );
    return { resolver, readFile, artifactService, workspace };
}

beforeEach(() => vi.clearAllMocks());

describe("EnvValueResolver", () => {
    it("prefers a .env value over the process environment", async () => {
        const { resolver } = setup({
            dotEnv: { X: "from-dotenv" },
            processEnv: { X: "from-proc" },
        });
        const lookup = await resolver.createLookup("/work/dir");
        expect(lookup("X")).toBe("from-dotenv");
    });

    it("falls back to the process environment when .env is missing the variable", async () => {
        const { resolver } = setup({ dotEnv: {}, processEnv: { X: "from-proc" } });
        const lookup = await resolver.createLookup("/work/dir");
        expect(lookup("X")).toBe("from-proc");
    });

    it("falls back to the process environment when there is no .env file", async () => {
        const { resolver } = setup({ dotEnv: "missing", processEnv: { X: "from-proc" } });
        const lookup = await resolver.createLookup("/work/dir");
        expect(lookup("X")).toBe("from-proc");
    });

    it("returns undefined when the variable is in neither source", async () => {
        const { resolver } = setup({ dotEnv: {} });
        const lookup = await resolver.createLookup("/work/dir");
        expect(lookup("MISSING")).toBeUndefined();
    });

    it("reads .env from the document's workspace root", async () => {
        const { resolver, readFile } = setup({ dotEnv: {}, workspaceRoot: "/ws" });
        await resolver.createLookup("/ws/sub");
        expect(readFile).toHaveBeenCalledWith("/ws/.env");
    });

    it("uses the first workspace folder when no documentDir is given", async () => {
        const { resolver, artifactService, readFile } = setup({
            dotEnv: { X: "root" },
            workspaceFolders: ["/root-ws"],
        });
        const lookup = await resolver.createLookup();
        expect(lookup("X")).toBe("root");
        expect(artifactService.getWorkspaceRoot).not.toHaveBeenCalled();
        expect(readFile).toHaveBeenCalledWith("/root-ws/.env");
    });

    it("propagates .env read failures other than a missing file", async () => {
        const { resolver, workspace } = setup({});
        workspace.readFile.mockRejectedValueOnce(new Error("EACCES"));
        await expect(resolver.createLookup("/work/dir")).rejects.toThrow("EACCES");
    });
});
