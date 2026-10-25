import { posix } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { UnreadableDotEnvError, UnresolvedEnvVariableError } from "../../shared/domain/errors";
import { createTestHost } from "../../testing";
import { EnvLookup, envRefsIn, expandEnvRefs, NO_ENV_VARIABLES } from "../domain/envRef";
import { TargetsLocation } from "./DeploymentTargetService";
import { EnvScope, EnvValueResolver } from "./EnvValueResolver";

const REFERENCES_ENV = envRefsIn("${env:MIRAGON_TOKEN}");
const NO_REFERENCES = envRefsIn("https://engine.example/rest", undefined);

const WORKSPACE_ROOT = "/ws";
const SCOPES: EnvScope[] = ["targetsFile", "workspaceFolder"];

function targetsLocationIn(projectDir: string, configFolder = ".camunda"): TargetsLocation {
    return {
        filePath: posix.join(projectDir, configFolder, "deployment-targets.json"),
        exists: true,
        projectDir,
    };
}

function dotEnvContent(variables: Record<string, string>): string {
    return Object.entries(variables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

function setup(
    options: {
        dotEnvFiles?: Record<string, Record<string, string>>;
        symbolicLinks?: string[];
        targetsLocation?: TargetsLocation;
        workspaceFolders?: string[];
    } = {},
) {
    const targetsLocator = {
        locateTargetsFile: vi
            .fn<(documentDir?: string) => Promise<TargetsLocation | undefined>>()
            .mockResolvedValue(options.targetsLocation ?? targetsLocationIn(WORKSPACE_ROOT)),
    };
    const { workspace: inMemoryWorkspace } = createTestHost({
        folders: options.workspaceFolders ?? [WORKSPACE_ROOT],
        files: Object.fromEntries(
            Object.entries(options.dotEnvFiles ?? {}).map(([path, variables]) => [
                path,
                dotEnvContent(variables),
            ]),
        ),
    });
    for (const path of options.symbolicLinks ?? []) {
        inMemoryWorkspace.symbolicLinks.add(path);
    }
    const workspace = {
        getWorkspaceFolderPaths: vi.spyOn(inMemoryWorkspace, "getWorkspaceFolderPaths"),
        findWorkspaceFolderForDocument: vi.spyOn(
            inMemoryWorkspace,
            "findWorkspaceFolderForDocument",
        ),
        isSymbolicLink: vi.spyOn(inMemoryWorkspace, "isSymbolicLink"),
        readFile: vi.spyOn(inMemoryWorkspace, "readFile"),
    };
    const resolver = new EnvValueResolver(targetsLocator, inMemoryWorkspace);
    return { resolver, targetsLocator, workspace };
}

function expectNoDotEnvRead(workspace: ReturnType<typeof setup>["workspace"]): void {
    expect(workspace.isSymbolicLink).not.toHaveBeenCalled();
    expect(workspace.readFile).not.toHaveBeenCalled();
}

function expansionErrorOf(lookup: EnvLookup, field: string): unknown {
    try {
        expandEnvRefs("${env:MIRAGON_TOKEN}", lookup, field);
    } catch (error) {
        return error;
    }
    throw new Error("expected the expansion to fail");
}

function errnoError(code: string, message: string): Error {
    return Object.assign(new Error(`${code}: ${message}`), { code });
}

afterEach(() => vi.unstubAllEnvs());

describe("EnvValueResolver", () => {
    describe("when no subject references env", () => {
        it.each(
            SCOPES.flatMap((scope) => [
                [scope, "subjects without references", [NO_REFERENCES, NO_REFERENCES]] as const,
                [scope, "no subjects", []] as const,
            ]),
        )(
            "returns the empty lookup without any IO in the %s scope for %s",
            async (scope, _case, subjects) => {
                const { resolver, targetsLocator, workspace } = setup({
                    dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
                });

                const lookup = await resolver.createLookup(scope, "/ws/processes", ...subjects);

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
                expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
                expect(workspace.getWorkspaceFolderPaths).not.toHaveBeenCalled();
                expectNoDotEnvRead(workspace);
            },
        );
    });

    describe('with the "targetsFile" scope', () => {
        it("reads the .env beside a root targets file", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "root-secret" } },
                targetsLocation: targetsLocationIn("/ws"),
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("root-secret");
            expect(lookup.source).toBe("/ws/.env");
            expect(targetsLocator.locateTargetsFile).toHaveBeenCalledExactlyOnceWith(
                "/ws/processes",
            );
            expect(workspace.isSymbolicLink).toHaveBeenCalledWith("/ws/.env");
            expect(workspace.readFile).toHaveBeenCalledWith("/ws/.env");
        });

        it("reads the .env of the nested project whose targets file is in use", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/sub/.env": { MIRAGON_TOKEN: "nested-secret" },
                },
                targetsLocation: targetsLocationIn("/ws/sub"),
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("nested-secret");
            expect(lookup.source).toBe("/ws/sub/.env");
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/sub/.env");
        });

        it("does not fall back to the root .env when the nested project's .env lacks a variable", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/sub/.env": { MIRAGON_OTHER: "unrelated" },
                },
                targetsLocation: targetsLocationIn("/ws/sub"),
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
            expect(workspace.readFile).not.toHaveBeenCalledWith("/ws/.env");
            const error = expansionErrorOf(lookup, "auth.password");
            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({
                variable: "MIRAGON_TOKEN",
                field: "auth.password",
                message: expect.stringContaining("/ws/sub/.env"),
            });
        });

        it("reads .env when any one of several subjects references env", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                NO_REFERENCES,
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("secret");
            expect(workspace.readFile).toHaveBeenCalledWith("/ws/.env");
        });

        it("uses the targets file of the first workspace folder when no documentDir is given", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: { "/first/.env": { MIRAGON_TOKEN: "first-folder" } },
                targetsLocation: targetsLocationIn("/first"),
                workspaceFolders: ["/first", "/second"],
            });

            const lookup = await resolver.createLookup("targetsFile", undefined, REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("first-folder");
            expect(targetsLocator.locateTargetsFile).toHaveBeenCalledExactlyOnceWith(undefined);
            expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/first/.env");
        });

        it("returns the empty lookup without locating a targets file when no workspace folder is open", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
                workspaceFolders: [],
            });

            const lookup = await resolver.createLookup("targetsFile", undefined, REFERENCES_ENV);

            expect(lookup).toBe(NO_ENV_VARIABLES);
            expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
            expectNoDotEnvRead(workspace);
        });

        it("returns the empty lookup when no targets file can be located", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
            });
            targetsLocator.locateTargetsFile.mockResolvedValueOnce(undefined);

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            expect(lookup).toBe(NO_ENV_VARIABLES);
            expectNoDotEnvRead(workspace);
        });

        it.each([
            ["../cfg", "/ws/cfg/deployment-targets.json"],
            ["../../elsewhere", "/elsewhere/deployment-targets.json"],
        ])(
            "reads no .env when config folder %s places the targets file outside its project",
            async (_configFolder, filePath) => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: {
                        "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                        "/ws/sub/.env": { MIRAGON_TOKEN: "nested-secret" },
                    },
                    targetsLocation: { filePath, exists: true, projectDir: "/ws/sub" },
                });

                const lookup = await resolver.createLookup(
                    "targetsFile",
                    "/ws/sub/processes",
                    REFERENCES_ENV,
                );

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expectNoDotEnvRead(workspace);
            },
        );

        it("reads the project's .env for a config folder whose name merely starts with dots", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/ws/sub/.env": { MIRAGON_TOKEN: "nested-secret" } },
                targetsLocation: targetsLocationIn("/ws/sub", "..cfg"),
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("nested-secret");
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/sub/.env");
        });

        describe("for a document outside every workspace folder", () => {
            it("returns the empty lookup without locating or reading any .env", async () => {
                const { resolver, targetsLocator, workspace } = setup({
                    dotEnvFiles: { "/loose/.env": { MIRAGON_TOKEN: "untrusted" } },
                    targetsLocation: targetsLocationIn("/loose"),
                });

                const lookup = await resolver.createLookup("targetsFile", "/loose", REFERENCES_ENV);

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expect(workspace.findWorkspaceFolderForDocument).toHaveBeenCalledWith("/loose");
                expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
                expectNoDotEnvRead(workspace);
            });

            it("explains that references only resolve inside a workspace folder", async () => {
                const { resolver } = setup();

                const lookup = await resolver.createLookup("targetsFile", "/loose", REFERENCES_ENV);

                const error = expansionErrorOf(lookup, "endpoint");
                expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
                expect(error).toMatchObject({
                    variable: "MIRAGON_TOKEN",
                    field: "endpoint",
                    message: expect.stringContaining("inside a workspace folder"),
                });
            });
        });
    });

    describe('with the "workspaceFolder" scope', () => {
        it("reads the workspace folder's .env even when a nested targets file is nearer", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/vendor/lib/.env": { MIRAGON_TOKEN: "nested-secret" },
                },
                targetsLocation: targetsLocationIn("/ws/vendor/lib"),
            });

            const lookup = await resolver.createLookup(
                "workspaceFolder",
                "/ws/vendor/lib",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("root-secret");
            expect(lookup.source).toBe("/ws/.env");
            expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/.env");
        });

        it("reads the .env of the workspace folder enclosing the document", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/first/.env": { MIRAGON_TOKEN: "first-folder" },
                    "/second/.env": { MIRAGON_TOKEN: "second-folder" },
                },
                workspaceFolders: ["/first", "/second"],
            });

            const lookup = await resolver.createLookup(
                "workspaceFolder",
                "/second/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("second-folder");
            expect(workspace.findWorkspaceFolderForDocument).toHaveBeenCalledWith(
                "/second/processes",
            );
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/second/.env");
        });

        it("uses the first workspace folder when no documentDir is given", async () => {
            const { resolver, targetsLocator, workspace } = setup({
                dotEnvFiles: {
                    "/first/.env": { MIRAGON_TOKEN: "first-folder" },
                    "/second/.env": { MIRAGON_TOKEN: "second-folder" },
                },
                workspaceFolders: ["/first", "/second"],
            });

            const lookup = await resolver.createLookup(
                "workspaceFolder",
                undefined,
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("first-folder");
            expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
            expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/first/.env");
        });

        it.each([
            ["a document outside every workspace folder", "/loose", [WORKSPACE_ROOT]],
            ["no documentDir and no workspace folder", undefined, []],
        ])(
            "returns the empty lookup without any IO for %s",
            async (_case, documentDir, workspaceFolders) => {
                const { resolver, targetsLocator, workspace } = setup({
                    dotEnvFiles: {
                        "/ws/.env": { MIRAGON_TOKEN: "secret" },
                        "/loose/.env": { MIRAGON_TOKEN: "untrusted" },
                    },
                    workspaceFolders,
                });

                const lookup = await resolver.createLookup(
                    "workspaceFolder",
                    documentDir,
                    REFERENCES_ENV,
                );

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expect(targetsLocator.locateTargetsFile).not.toHaveBeenCalled();
                expectNoDotEnvRead(workspace);
            },
        );

        it("returns a lookup naming the workspace folder's .env when it is missing", async () => {
            const { resolver } = setup({ targetsLocation: targetsLocationIn("/ws/sub") });

            const lookup = await resolver.createLookup(
                "workspaceFolder",
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
            expect(lookup.source).toBe("/ws/.env");
        });
    });

    describe("when the project has no .env", () => {
        it("returns a lookup that resolves nothing and names the searched path", async () => {
            const { resolver } = setup({ targetsLocation: targetsLocationIn("/ws") });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
            expect(lookup.source).toBe("/ws/.env");
        });

        it("points an unresolved reference at the missing .env", async () => {
            const { resolver } = setup({ targetsLocation: targetsLocationIn("/ws") });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            const error = expansionErrorOf(lookup, "auth.password");
            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({
                variable: "MIRAGON_TOKEN",
                field: "auth.password",
                message: expect.stringContaining("/ws/.env"),
            });
        });
    });

    describe("which variables it exposes", () => {
        it("drops .env entries without the MIRAGON_ prefix", async () => {
            const { resolver } = setup({
                dotEnvFiles: {
                    "/ws/.env": {
                        MIRAGON_TOKEN: "modeler-secret",
                        AWS_SECRET_ACCESS_KEY: "foreign",
                        miragon_lowercase: "foreign",
                    },
                },
            });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("modeler-secret");
            expect(lookup("AWS_SECRET_ACCESS_KEY")).toBeUndefined();
            expect(lookup("miragon_lowercase")).toBeUndefined();
        });

        it.each([
            ["a .env without the variable", { "/ws/.env": { MIRAGON_TOKEN: "secret" } }],
            ["no .env", {}],
        ])("never consults the process environment with %s", async (_case, dotEnvFiles) => {
            vi.stubEnv("MIRAGON_FROM_PROCESS", "ambient");
            const { resolver } = setup({ dotEnvFiles });

            const lookup = await resolver.createLookup(
                "targetsFile",
                "/ws/processes",
                REFERENCES_ENV,
            );

            expect(process.env.MIRAGON_FROM_PROCESS).toBe("ambient");
            expect(lookup("MIRAGON_FROM_PROCESS")).toBeUndefined();
        });
    });

    describe("when .env cannot be read safely", () => {
        it.each(SCOPES)(
            "refuses a symlinked .env without reading it in the %s scope",
            async (scope) => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "elsewhere" } },
                    symbolicLinks: ["/ws/.env"],
                });

                const result = resolver.createLookup(scope, "/ws/processes", REFERENCES_ENV);

                await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
                await expect(result).rejects.toMatchObject({
                    path: "/ws/.env",
                    message: "Could not read /ws/.env: symbolic links are not followed",
                });
                expect(workspace.isSymbolicLink).toHaveBeenCalledWith("/ws/.env");
                expect(workspace.readFile).not.toHaveBeenCalled();
            },
        );

        it.each([
            [
                "a directory",
                errnoError("EISDIR", "illegal operation on a directory, read"),
                "EISDIR: illegal operation on a directory, read",
            ],
            [
                "an unreadable file",
                errnoError("EACCES", "permission denied, open '/ws/.env'"),
                "EACCES: permission denied, open '/ws/.env'",
            ],
            ["a non-Error rejection", "disk unplugged", "disk unplugged"],
        ])(
            "wraps the read failure of %s in UnreadableDotEnvError",
            async (_case, readFailure, reason) => {
                const { resolver, workspace } = setup();
                workspace.readFile.mockRejectedValueOnce(readFailure);

                const result = resolver.createLookup(
                    "targetsFile",
                    "/ws/processes",
                    REFERENCES_ENV,
                );

                await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
                await expect(result).rejects.toMatchObject({
                    path: "/ws/.env",
                    message: `Could not read /ws/.env: ${reason}`,
                });
            },
        );

        it("wraps a failing symbolic-link check in UnreadableDotEnvError", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
            });
            workspace.isSymbolicLink.mockRejectedValueOnce(errnoError("EACCES", "lstat"));

            const result = resolver.createLookup("targetsFile", "/ws/processes", REFERENCES_ENV);

            await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
            await expect(result).rejects.toMatchObject({ path: "/ws/.env" });
            expect(workspace.readFile).not.toHaveBeenCalled();
        });
    });
});
