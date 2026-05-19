import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeWorkspaceFolder {
    uri: { scheme: string; path: string; fsPath: string };
}

const workspaceState: {
    folders: FakeWorkspaceFolder[];
    folderForUri: (uri: { path: string }) => FakeWorkspaceFolder | undefined;
} = {
    folders: [{ uri: { scheme: "file", path: "/", fsPath: "/" } }],
    folderForUri: () => ({ uri: { scheme: "file", path: "/", fsPath: "/" } }),
};

vi.mock("vscode", () => ({
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
    workspace: {
        get workspaceFolders() {
            return workspaceState.folders;
        },
        getWorkspaceFolder: (uri: { path: string }) => workspaceState.folderForUri(uri),
    },
}));

import { ReferencedModelLocator } from "./ReferencedModelLocator";

const bpmnWithProcess = (id: string) =>
    `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="${id}" isExecutable="true"/>
</bpmn:definitions>`;

const dmnWithDecision = (id: string) =>
    `<?xml version="1.0"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/">
  <decision id="${id}" name="d"/>
</definitions>`;

/**
 * `tree` describes a directory layout:
 *   { "/work": ["parent.bpmn", { name: "sub", type: "directory" }],
 *     "/work/sub": ["child.bpmn"] }
 * Every file path that appears as a key in `fileContents` is readable.
 */
type DirTree = Record<string, Array<string | { name: string; type: "directory" }>>;

function createLocator(opts: { fileContents: Record<string, string>; tree?: DirTree }) {
    const { fileContents, tree = {} } = opts;
    const vsWorkspace = {
        findFiles: vi.fn().mockImplementation((glob: string) => {
            const wantsBpmn = glob.endsWith(".bpmn");
            return Promise.resolve(
                Object.keys(fileContents).filter((path) =>
                    wantsBpmn ? path.endsWith(".bpmn") : path.endsWith(".dmn"),
                ),
            );
        }),
        readDirectory: vi.fn().mockImplementation((dir: string) => {
            const entries = tree[dir];
            if (!entries) return Promise.reject(new Error("ENOENT"));
            return Promise.resolve(
                entries.map((e) => (typeof e === "string" ? [e, "file"] : [e.name, e.type])),
            );
        }),
        readFile: vi.fn().mockImplementation((path: string) => {
            if (path in fileContents) return Promise.resolve(fileContents[path]);
            return Promise.reject(new Error("not found"));
        }),
    };
    const vsUI = { logInfo: vi.fn(), logWarning: vi.fn() };
    const locator = new ReferencedModelLocator(vsWorkspace as never, vsUI as never);
    return { locator, vsWorkspace, vsUI };
}

beforeEach(() => {
    workspaceState.folders = [{ uri: { scheme: "file", path: "/", fsPath: "/" } }];
    workspaceState.folderForUri = () => ({
        uri: { scheme: "file", path: "/", fsPath: "/" },
    });
});

describe("findDeclaringFiles — workspace folder open (findFiles path)", () => {
    it("returns the single matching path", async () => {
        const { locator } = createLocator({
            fileContents: {
                "/a.bpmn": bpmnWithProcess("ProcessB"),
                "/b.bpmn": bpmnWithProcess("Other"),
            },
        });

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });
    });

    it("returns multiple matches in workspace order", async () => {
        const { locator } = createLocator({
            fileContents: {
                "/a.bpmn": bpmnWithProcess("Shared"),
                "/b.bpmn": bpmnWithProcess("Shared"),
            },
        });

        const result = await locator.findDeclaringFiles("Shared", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/a.bpmn", "/b.bpmn"]);
        }
    });

    it("matches DMN decisions via the .dmn extension", async () => {
        const { locator } = createLocator({
            fileContents: {
                "/a.dmn": dmnWithDecision("Decision_1"),
                "/b.bpmn": bpmnWithProcess("Decision_1"),
            },
        });

        const result = await locator.findDeclaringFiles("Decision_1", "decision");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/a.dmn"]);
        }
    });

    it("returns no matches when nothing declares the id (empty paths array)", async () => {
        const { locator } = createLocator({
            fileContents: { "/a.bpmn": bpmnWithProcess("Other") },
        });

        const result = await locator.findDeclaringFiles("Missing", "process");

        expect(result).toEqual({
            kind: "matches",
            paths: [],
            readFailures: [],
        });
    });

    it("passes undefined as exclude — VS Code layers files.exclude and search.exclude", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: { "/a.bpmn": bpmnWithProcess("ProcessB") },
        });

        await locator.findDeclaringFiles("ProcessB", "process");

        /**
         * Only one positional arg → second is implicitly undefined.
         */
        expect(vsWorkspace.findFiles).toHaveBeenCalledWith("**/*.bpmn");
    });

    it("filters out paths inside build/output dirs that VS Code defaults miss", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/work/wanted.bpmn": bpmnWithProcess("Wanted"),
                "/work/dist/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/build/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/out/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/target/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/coverage/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/node_modules/lib/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/nested/dist/deep.bpmn": bpmnWithProcess("Wanted"),
            },
        });

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/wanted.bpmn"]);
        }
        /**
         * Excluded paths should not even be read.
         */
        expect(vsWorkspace.readFile).toHaveBeenCalledTimes(1);
        expect(vsWorkspace.readFile).toHaveBeenCalledWith("/work/wanted.bpmn");
    });

    it("falls back to fs-walk when every findFiles result is excluded", async () => {
        workspaceState.folders = [{ uri: { scheme: "file", path: "/work", fsPath: "/work" } }];
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/work/dist/stale.bpmn": bpmnWithProcess("Wanted"),
                "/work/src/real.bpmn": bpmnWithProcess("Wanted"),
            },
            tree: {
                "/work": [
                    { name: "dist", type: "directory" },
                    { name: "src", type: "directory" },
                ],
                "/work/src": ["real.bpmn"],
            },
        });
        vsWorkspace.findFiles.mockResolvedValue(["/work/dist/stale.bpmn"]);

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(vsWorkspace.readDirectory).toHaveBeenCalledWith("/work");
        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/src/real.bpmn"]);
        }
    });

    it("returns kind=all-unreadable when every candidate read fails", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: { "/bad.bpmn": bpmnWithProcess("ProcessB") },
        });
        vsWorkspace.readFile.mockRejectedValue(new Error("EACCES"));

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result.kind).toBe("all-unreadable");
        if (result.kind === "all-unreadable") {
            expect(result.attempted).toBe(1);
            expect(result.failures[0]).toContain("EACCES");
        }
    });

    it("includes partial read failures alongside successful matches", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/bad.bpmn": bpmnWithProcess("anything"),
                "/good.bpmn": bpmnWithProcess("ProcessB"),
            },
        });
        vsWorkspace.readFile.mockImplementationOnce(() => Promise.reject(new Error("EACCES")));

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/good.bpmn"]);
            expect(result.readFailures).toHaveLength(1);
        }
    });

    it("ignores commented-out and CDATA-wrapped declarations", async () => {
        const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <!-- <bpmn:process id="ProcessB"/> -->
  <docs><![CDATA[<bpmn:process id="ProcessB"/>]]></docs>
  <bpmn:process id="Other"/>
</bpmn:definitions>`;
        const { locator } = createLocator({ fileContents: { "/a.bpmn": xml } });

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
    });

    it("reads candidate files in parallel", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/a.bpmn": "<doc/>",
                "/b.bpmn": "<doc/>",
                "/c.bpmn": "<doc/>",
            },
        });
        const pending: ((value: string) => void)[] = [];
        vsWorkspace.readFile.mockImplementation(
            () => new Promise<string>((resolve) => pending.push(resolve)),
        );

        const inFlight = locator.findDeclaringFiles("ProcessB", "process");
        for (let i = 0; i < 20 && pending.length < 3; i++) {
            await Promise.resolve();
        }

        expect(pending).toHaveLength(3);
        pending.forEach((resolve) => resolve("<doc/>"));
        await inFlight;
    });
});

describe("findDeclaringFiles — walk-fallback (ripgrep silently failed)", () => {
    it("falls back to fs walk when findFiles returns [] and a workspace folder is open", async () => {
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/work/parent.bpmn": bpmnWithProcess("Parent"),
                "/work/child.bpmn": bpmnWithProcess("ChildProcess"),
            },
            tree: { "/work": ["parent.bpmn", "child.bpmn"] },
        });
        vsWorkspace.findFiles.mockResolvedValue([]);
        workspaceState.folderForUri = () => ({
            uri: { scheme: "file", path: "/work", fsPath: "/work" },
        });
        const documentUri = {
            scheme: "file",
            path: "/work/parent.bpmn",
            fsPath: "/work/parent.bpmn",
        } as never;

        const result = await locator.findDeclaringFiles("ChildProcess", "process", documentUri);

        expect(vsWorkspace.findFiles).toHaveBeenCalledTimes(1);
        expect(vsWorkspace.readDirectory).toHaveBeenCalledWith("/work");
        expect(result).toEqual({
            kind: "matches",
            paths: ["/work/child.bpmn"],
            readFailures: [],
        });
    });

    it("recurses into subdirectories", async () => {
        workspaceState.folders = [{ uri: { scheme: "file", path: "/work", fsPath: "/work" } }];
        const { locator, vsWorkspace } = createLocator({
            fileContents: { "/work/sub/child.bpmn": bpmnWithProcess("Nested") },
            tree: {
                "/work": [{ name: "sub", type: "directory" }],
                "/work/sub": ["child.bpmn"],
            },
        });
        vsWorkspace.findFiles.mockResolvedValue([]);

        const result = await locator.findDeclaringFiles("Nested", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/sub/child.bpmn"]);
        }
    });

    it("skips baseline-excluded directories (node_modules, dist, .git, …)", async () => {
        workspaceState.folders = [{ uri: { scheme: "file", path: "/work", fsPath: "/work" } }];
        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/work/wanted.bpmn": bpmnWithProcess("Wanted"),
                "/work/node_modules/inner.bpmn": bpmnWithProcess("Wanted"),
            },
            tree: {
                "/work": ["wanted.bpmn", { name: "node_modules", type: "directory" }],
                "/work/node_modules": ["inner.bpmn"],
            },
        });
        vsWorkspace.findFiles.mockResolvedValue([]);

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(vsWorkspace.readDirectory).not.toHaveBeenCalledWith("/work/node_modules");
        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/wanted.bpmn"]);
        }
    });

    it("tolerates unreadable subdirectories", async () => {
        workspaceState.folders = [{ uri: { scheme: "file", path: "/work", fsPath: "/work" } }];
        const { locator, vsWorkspace } = createLocator({
            fileContents: { "/work/ok.bpmn": bpmnWithProcess("Wanted") },
            tree: {
                "/work": ["ok.bpmn", { name: "denied", type: "directory" }],
                // "/work/denied" intentionally absent → readDirectory rejects
            },
        });
        vsWorkspace.findFiles.mockResolvedValue([]);

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/ok.bpmn"]);
        }
    });
});

describe("findDeclaringFiles — loose file (no workspace folder)", () => {
    it("walks the source document's directory via readDirectory (not findFiles)", async () => {
        workspaceState.folders = [];
        workspaceState.folderForUri = () => undefined;

        const { locator, vsWorkspace } = createLocator({
            fileContents: {
                "/work/parent.bpmn": bpmnWithProcess("Parent"),
                "/work/child.bpmn": bpmnWithProcess("ChildProcess"),
            },
            tree: { "/work": ["parent.bpmn", "child.bpmn"] },
        });
        const documentUri = {
            scheme: "file",
            path: "/work/parent.bpmn",
            fsPath: "/work/parent.bpmn",
        } as never;

        const result = await locator.findDeclaringFiles("ChildProcess", "process", documentUri);

        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
        expect(vsWorkspace.readDirectory).toHaveBeenCalledWith("/work");
        expect(result).toEqual({
            kind: "matches",
            paths: ["/work/child.bpmn"],
            readFailures: [],
        });
    });

    it("returns no-search-scope when no source URI and no workspace folders", async () => {
        workspaceState.folders = [];
        workspaceState.folderForUri = () => undefined;

        const { locator, vsWorkspace } = createLocator({
            fileContents: { "/a.bpmn": bpmnWithProcess("ProcessB") },
        });

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({ kind: "no-search-scope" });
        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
        expect(vsWorkspace.readDirectory).not.toHaveBeenCalled();
    });
});

describe("id regex semantics", () => {
    const expectFinds = (id: string, xml: string, kind: "process" | "decision") => {
        const { locator } = createLocator({
            fileContents: { "/a.bpmn": xml, "/a.dmn": xml },
        });
        return locator.findDeclaringFiles(id, kind);
    };

    it("matches namespaced and non-namespaced process tags", async () => {
        await expect(
            expectFinds("ProcessB", `<bpmn:process id="ProcessB"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
        await expect(
            expectFinds("ProcessB", `<process id="ProcessB"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
        await expect(
            expectFinds("ProcessB", `<bpmn2:process id='ProcessB'>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
    });

    it("does not match an id with the same prefix but a longer value", async () => {
        await expect(
            expectFinds("ProcessB", `<bpmn:process id="ProcessB_v2"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: [] });
    });

    it("does not confuse <process> with <participant>", async () => {
        await expect(
            expectFinds(
                "ProcessB",
                `<bpmn:participant id="ProcessB" processRef="ProcessB"/>`,
                "process",
            ),
        ).resolves.toMatchObject({ kind: "matches", paths: [] });
    });

    it("matches decision tags with optional dmn: prefix", async () => {
        await expect(
            expectFinds("Decision_1", `<decision id="Decision_1"/>`, "decision"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.dmn"] });
        await expect(
            expectFinds("Decision_1", `<dmn:decision id="Decision_1">`, "decision"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.dmn"] });
    });

    it("escapes regex metacharacters in the id", async () => {
        await expect(
            expectFinds("a.b+c", `<bpmn:process id="a.b+c"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
        await expect(
            expectFinds("a.b+c", `<bpmn:process id="aXbZc"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: [] });
    });

    it("tolerates whitespace around the = in id=", async () => {
        await expect(
            expectFinds("ProcessB", `<bpmn:process id = "ProcessB"/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
        await expect(
            expectFinds("ProcessB", `<bpmn:process id\t=\t'ProcessB'/>`, "process"),
        ).resolves.toMatchObject({ kind: "matches", paths: ["/a.bpmn"] });
    });
});
