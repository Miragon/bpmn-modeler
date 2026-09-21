import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileNotFound, UnresolvedEnvVariableError } from "../../shared/domain/errors";
import { BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
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
        await expect(resolver.resolveValue("${env:X}", "f", "/work/dir")).resolves.toBe(
            "from-dotenv",
        );
    });

    it("falls back to the process environment when .env is missing the variable", async () => {
        const { resolver } = setup({ dotEnv: {}, processEnv: { X: "from-proc" } });
        await expect(resolver.resolveValue("${env:X}", "f", "/work/dir")).resolves.toBe(
            "from-proc",
        );
    });

    it("falls back to the process environment when there is no .env file", async () => {
        const { resolver } = setup({ dotEnv: "missing", processEnv: { X: "from-proc" } });
        await expect(resolver.resolveValue("${env:X}", "f", "/work/dir")).resolves.toBe(
            "from-proc",
        );
    });

    it("throws when the variable is in neither source", async () => {
        const { resolver } = setup({ dotEnv: {} });
        await expect(
            resolver.resolveValue("${env:MISSING}", "endpoint", "/work/dir"),
        ).rejects.toThrow(UnresolvedEnvVariableError);
    });

    it("uses the first workspace folder when no documentDir is given", async () => {
        const { resolver, artifactService, readFile } = setup({
            dotEnv: { X: "root" },
            workspaceFolders: ["/root-ws"],
        });
        await expect(resolver.resolveValue("${env:X}", "f")).resolves.toBe("root");
        expect(artifactService.getWorkspaceRoot).not.toHaveBeenCalled();
        expect(readFile).toHaveBeenCalledWith("/root-ws/.env");
    });

    it("does no file I/O when the value has no ref (fast path)", async () => {
        const { resolver, readFile } = setup({ dotEnv: { X: "v" } });
        await expect(resolver.resolveValue("plain", "f", "/work/dir")).resolves.toBe("plain");
        expect(readFile).not.toHaveBeenCalled();
    });

    it("does no file I/O when the auth has no ref (fast path)", async () => {
        const { resolver, readFile } = setup({ dotEnv: { X: "v" } });
        await resolver.resolveAuth(new BasicAuth("admin", "literal"), "/work/dir");
        expect(readFile).not.toHaveBeenCalled();
    });

    it("returns NoAuth untouched", async () => {
        const { resolver } = setup({ dotEnv: {} });
        const auth = new NoAuth();
        await expect(resolver.resolveAuth(auth, "/work/dir")).resolves.toBe(auth);
    });

    it("resolves every ref-bearing oauth2 field", async () => {
        const { resolver } = setup({
            dotEnv: { CID: "cid", SECRET: "sec", AUD: "aud" },
            processEnv: {},
        });
        const resolved = (await resolver.resolveAuth(
            new OAuth2Auth("${env:CID}", "${env:SECRET}", "https://idp/token", "${env:AUD}"),
            "/work/dir",
        )) as OAuth2Auth;
        expect(resolved.clientId).toBe("cid");
        expect(resolved.clientSecret).toBe("sec");
        expect(resolved.tokenEndpoint).toBe("https://idp/token");
        expect(resolved.audience).toBe("aud");
    });
});
