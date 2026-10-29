import { posix } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { UnreadableDotEnvError, UnresolvedEnvVariableError } from "../domain/errors";
import { createTestHost } from "../../testing";
import {
    AdHocDestination,
    DeploymentDestination,
    NamedDestination,
    TargetsLocation,
} from "../domain/deploymentDestination";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { EnvLookup, envRefsIn, expandEnvRefs, NO_ENV_VARIABLES } from "../domain/envRef";
import { EnvValueResolver } from "./EnvValueResolver";

const REFERENCES_ENV = envRefsIn("${env:MIRAGON_TOKEN}");
const NO_REFERENCES = envRefsIn("https://engine.example/rest", undefined);

const WORKSPACE_ROOT = "/ws";

function targetsLocationIn(projectDir: string, configFolder = ".camunda"): TargetsLocation {
    return {
        filePath: posix.join(projectDir, configFolder, "deployment-targets.json"),
        exists: true,
        projectDir,
    };
}

const DEV_TARGET = DeploymentTarget.create({
    name: "dev",
    engine: "c7",
    endpoint: "https://engine.example/rest",
    authType: "none",
});

function named(location = targetsLocationIn(WORKSPACE_ROOT)): NamedDestination {
    return new NamedDestination(DEV_TARGET, location);
}

const AD_HOC = new AdHocDestination("https://engine.example/rest", "");

const DESTINATIONS: [string, () => DeploymentDestination][] = [
    ["a named target", () => named()],
    ["an ad-hoc request", () => AD_HOC],
];

function dotEnvContent(variables: Record<string, string>): string {
    return Object.entries(variables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

function setup(
    options: {
        dotEnvFiles?: Record<string, Record<string, string>>;
        symbolicLinks?: string[];
        workspaceFolders?: string[];
    } = {},
) {
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
    const resolver = new EnvValueResolver(inMemoryWorkspace);
    return { resolver, workspace };
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
            DESTINATIONS.flatMap(([kind, destination]) => [
                [
                    kind,
                    destination,
                    "subjects without references",
                    [NO_REFERENCES, NO_REFERENCES],
                ] as const,
                [kind, destination, "no subjects", []] as const,
            ]),
        )(
            "returns the empty lookup without any IO for %s with %s",
            async (_kind, destination, _case, subjects) => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
                });

                const lookup = await resolver.createLookup(
                    destination(),
                    "/ws/processes",
                    ...subjects,
                );

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
                expect(workspace.getWorkspaceFolderPaths).not.toHaveBeenCalled();
                expectNoDotEnvRead(workspace);
            },
        );
    });

    describe("for a named target", () => {
        it("reads the .env beside a root targets file", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "root-secret" } },
            });

            const lookup = await resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("root-secret");
            expect(lookup.source).toBe("/ws/.env");
            expect(workspace.isSymbolicLink).toHaveBeenCalledWith("/ws/.env");
            expect(workspace.readFile).toHaveBeenCalledWith("/ws/.env");
        });

        it("reads the .env of the nested project whose targets file is in use", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/sub/.env": { MIRAGON_TOKEN: "nested-secret" },
                },
            });

            const lookup = await resolver.createLookup(
                named(targetsLocationIn("/ws/sub")),
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("nested-secret");
            expect(lookup.source).toBe("/ws/sub/.env");
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/sub/.env");
        });

        it("reads the .env beside the targets file the target came from, not one nearer the document", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/sub/.env": { MIRAGON_TOKEN: "nested-secret" },
                },
            });

            const lookup = await resolver.createLookup(
                named(targetsLocationIn("/ws")),
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("root-secret");
            expect(lookup.source).toBe("/ws/.env");
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/.env");
        });

        it("does not fall back to the root .env when the nested project's .env lacks a variable", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/sub/.env": { MIRAGON_OTHER: "unrelated" },
                },
            });

            const lookup = await resolver.createLookup(
                named(targetsLocationIn("/ws/sub")),
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
                named(),
                "/ws/processes",
                NO_REFERENCES,
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("secret");
            expect(workspace.readFile).toHaveBeenCalledWith("/ws/.env");
        });

        it("reads the .env of a targets file in the first workspace folder when no documentDir is given", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/first/.env": { MIRAGON_TOKEN: "first-folder" } },
                workspaceFolders: ["/first", "/second"],
            });

            const lookup = await resolver.createLookup(
                named(targetsLocationIn("/first")),
                undefined,
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("first-folder");
            expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/first/.env");
        });

        it("returns the empty lookup when no workspace folder is open", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "secret" } },
                workspaceFolders: [],
            });

            const lookup = await resolver.createLookup(named(), undefined, REFERENCES_ENV);

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
                });

                const lookup = await resolver.createLookup(
                    named({ filePath, exists: true, projectDir: "/ws/sub" }),
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
            });

            const lookup = await resolver.createLookup(
                named(targetsLocationIn("/ws/sub", "..cfg")),
                "/ws/sub/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("nested-secret");
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/ws/sub/.env");
        });

        describe("for a document outside every workspace folder", () => {
            it("returns the empty lookup without reading any .env", async () => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: { "/loose/.env": { MIRAGON_TOKEN: "untrusted" } },
                });

                const lookup = await resolver.createLookup(
                    named(targetsLocationIn("/loose")),
                    "/loose",
                    REFERENCES_ENV,
                );

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expect(workspace.findWorkspaceFolderForDocument).toHaveBeenCalledWith("/loose");
                expectNoDotEnvRead(workspace);
            });

            it("explains that references only resolve inside a workspace folder", async () => {
                const { resolver } = setup();

                const lookup = await resolver.createLookup(named(), "/loose", REFERENCES_ENV);

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

    describe("for an ad-hoc request", () => {
        it("reads the workspace folder's .env, not one nearer the document", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/ws/.env": { MIRAGON_TOKEN: "root-secret" },
                    "/ws/vendor/lib/.env": { MIRAGON_TOKEN: "nested-secret" },
                },
            });

            const lookup = await resolver.createLookup(AD_HOC, "/ws/vendor/lib", REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("root-secret");
            expect(lookup.source).toBe("/ws/.env");
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

            const lookup = await resolver.createLookup(AD_HOC, "/second/processes", REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("second-folder");
            expect(workspace.findWorkspaceFolderForDocument).toHaveBeenCalledWith(
                "/second/processes",
            );
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/second/.env");
        });

        it("reads the .env of a workspace folder on a UNC share", async () => {
            const { resolver } = setup({
                dotEnvFiles: { "//server/share/ws/.env": { MIRAGON_TOKEN: "share-secret" } },
                workspaceFolders: ["//server/share/ws"],
            });

            const lookup = await resolver.createLookup(
                AD_HOC,
                "//server/share/ws/processes",
                REFERENCES_ENV,
            );

            expect(lookup("MIRAGON_TOKEN")).toBe("share-secret");
            expect(lookup.source).toBe("//server/share/ws/.env");
        });

        it("uses the first workspace folder when no documentDir is given", async () => {
            const { resolver, workspace } = setup({
                dotEnvFiles: {
                    "/first/.env": { MIRAGON_TOKEN: "first-folder" },
                    "/second/.env": { MIRAGON_TOKEN: "second-folder" },
                },
                workspaceFolders: ["/first", "/second"],
            });

            const lookup = await resolver.createLookup(AD_HOC, undefined, REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("first-folder");
            expect(workspace.findWorkspaceFolderForDocument).not.toHaveBeenCalled();
            expect(workspace.readFile).toHaveBeenCalledExactlyOnceWith("/first/.env");
        });

        it.each([
            ["a document outside every workspace folder", "/loose", [WORKSPACE_ROOT]],
            ["no documentDir and no workspace folder", undefined, []],
        ])(
            "returns the empty lookup without any IO for %s",
            async (_case, documentDir, workspaceFolders) => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: {
                        "/ws/.env": { MIRAGON_TOKEN: "secret" },
                        "/loose/.env": { MIRAGON_TOKEN: "untrusted" },
                    },
                    workspaceFolders,
                });

                const lookup = await resolver.createLookup(AD_HOC, documentDir, REFERENCES_ENV);

                expect(lookup).toBe(NO_ENV_VARIABLES);
                expectNoDotEnvRead(workspace);
            },
        );

        it("returns a lookup naming the workspace folder's .env when it is missing", async () => {
            const { resolver } = setup();

            const lookup = await resolver.createLookup(AD_HOC, "/ws/sub/processes", REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
            expect(lookup.source).toBe("/ws/.env");
        });
    });

    describe("when the project has no .env", () => {
        it("returns a lookup that resolves nothing and names the searched path", async () => {
            const { resolver } = setup();

            const lookup = await resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
            expect(lookup.source).toBe("/ws/.env");
        });

        it("points an unresolved reference at the missing .env", async () => {
            const { resolver } = setup();

            const lookup = await resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

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

            const lookup = await resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

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

            const lookup = await resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

            expect(process.env.MIRAGON_FROM_PROCESS).toBe("ambient");
            expect(lookup("MIRAGON_FROM_PROCESS")).toBeUndefined();
        });
    });

    describe("when .env cannot be read safely", () => {
        it.each(DESTINATIONS)(
            "refuses a symlinked .env without reading it for %s",
            async (_kind, destination) => {
                const { resolver, workspace } = setup({
                    dotEnvFiles: { "/ws/.env": { MIRAGON_TOKEN: "elsewhere" } },
                    symbolicLinks: ["/ws/.env"],
                });

                const result = resolver.createLookup(
                    destination(),
                    "/ws/processes",
                    REFERENCES_ENV,
                );

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

                const result = resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

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

            const result = resolver.createLookup(named(), "/ws/processes", REFERENCES_ENV);

            await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
            await expect(result).rejects.toMatchObject({ path: "/ws/.env" });
            expect(workspace.readFile).not.toHaveBeenCalled();
        });
    });
});
