import { beforeEach, describe, expect, it, vi } from "vitest";

const configStore: { files: Record<string, boolean>; search: Record<string, boolean> } = {
    files: {},
    search: {},
};

vi.mock("vscode", () => ({
    commands: { executeCommand: vi.fn() },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
    workspace: {
        getConfiguration: () => ({
            get: <T>(key: string, fallback: T): T => {
                if (key === "files.exclude") return configStore.files as T;
                if (key === "search.exclude") return configStore.search as T;
                return fallback;
            },
        }),
    },
}));

import { commands } from "vscode";

import {
    buildExcludeGlob,
    buildIdRegex,
    findExcludedRanges,
    matchesOutsideComments,
    ModelNavigationService,
} from "./ModelNavigationService";

function createMocks(files: Record<string, string>) {
    const vsWorkspace = {
        findFiles: vi.fn().mockImplementation((glob: string) => {
            const wantsBpmn = glob.endsWith(".bpmn");
            return Promise.resolve(
                Object.keys(files).filter((path) =>
                    wantsBpmn ? path.endsWith(".bpmn") : path.endsWith(".dmn"),
                ),
            );
        }),
        readFile: vi.fn().mockImplementation((path: string) => {
            if (path in files) return Promise.resolve(files[path]);
            return Promise.reject(new Error("not found"));
        }),
    };

    const vsUI = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        pickReferencedModel: vi.fn(),
    };

    const service = new ModelNavigationService(
        vsWorkspace as never,
        vsUI as never,
    );

    return { service, vsWorkspace, vsUI };
}

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

beforeEach(() => {
    vi.mocked(commands.executeCommand).mockReset();
    configStore.files = {};
    configStore.search = {};
});

describe("ModelNavigationService.navigate", () => {
    it("shows an info notification when no match is found", async () => {
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("Other"),
        });

        await service.navigate("Missing", "process");

        expect(vsUI.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("Missing"),
        );
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("opens the unique match directly via vscode.open", async () => {
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
            "/b.bpmn": bpmnWithProcess("Other"),
        });

        await service.navigate("ProcessB", "process");

        expect(vsUI.pickReferencedModel).not.toHaveBeenCalled();
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/a.bpmn" }),
        );
    });

    it("opens the chosen file when multiple matches exist", async () => {
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("Shared"),
            "/b.bpmn": bpmnWithProcess("Shared"),
        });
        vsUI.pickReferencedModel.mockResolvedValue("/b.bpmn");

        await service.navigate("Shared", "process");

        expect(vsUI.pickReferencedModel).toHaveBeenCalledWith([
            "/a.bpmn",
            "/b.bpmn",
        ]);
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/b.bpmn" }),
        );
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("Shared"),
            "/b.bpmn": bpmnWithProcess("Shared"),
        });
        vsUI.pickReferencedModel.mockResolvedValue(undefined);

        await service.navigate("Shared", "process");

        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("matches DMN decisions via the .dmn glob", async () => {
        const { service } = createMocks({
            "/a.dmn": dmnWithDecision("Decision_1"),
            "/b.bpmn": bpmnWithProcess("Decision_1"),
        });

        await service.navigate("Decision_1", "decision");

        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/a.dmn" }),
        );
    });

    it("skips files that fail to read but keeps looking", async () => {
        const { service, vsWorkspace, vsUI } = createMocks({
            "/bad.bpmn": bpmnWithProcess("anything"),
            "/good.bpmn": bpmnWithProcess("ProcessB"),
        });
        vsWorkspace.readFile.mockImplementationOnce(() =>
            Promise.reject(new Error("EACCES")),
        );

        await service.navigate("ProcessB", "process");

        expect(vsUI.logWarning).toHaveBeenCalled();
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/good.bpmn" }),
        );
    });

    it("shows an error notification when every candidate is unreadable", async () => {
        const { service, vsWorkspace, vsUI } = createMocks({
            "/bad.bpmn": bpmnWithProcess("ProcessB"),
        });
        vsWorkspace.readFile.mockRejectedValue(new Error("EACCES"));

        await service.navigate("ProcessB", "process");

        expect(vsUI.showError).toHaveBeenCalledWith(
            expect.stringContaining("none of the candidate files were readable"),
        );
        expect(vsUI.showInfo).not.toHaveBeenCalled();
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("ignores commented-out process tags", async () => {
        const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <!-- <bpmn:process id="ProcessB"/> -->
  <bpmn:process id="Other"/>
</bpmn:definitions>`;
        const { service, vsUI } = createMocks({ "/a.bpmn": xml });

        await service.navigate("ProcessB", "process");

        expect(vsUI.showInfo).toHaveBeenCalled();
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("ignores process tags inside CDATA blocks", async () => {
        const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <docs><![CDATA[<bpmn:process id="ProcessB"/>]]></docs>
  <bpmn:process id="Other"/>
</bpmn:definitions>`;
        const { service, vsUI } = createMocks({ "/a.bpmn": xml });

        await service.navigate("ProcessB", "process");

        expect(vsUI.showInfo).toHaveBeenCalled();
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("surfaces an error when vscode.open rejects", async () => {
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
        });
        vi.mocked(commands.executeCommand).mockRejectedValueOnce(
            new Error("File not found"),
        );

        await service.navigate("ProcessB", "process");

        expect(vsUI.showError).toHaveBeenCalledWith(
            expect.stringContaining("File not found"),
        );
        expect(vsUI.logError).toHaveBeenCalled();
    });

    it("truncates very long reference ids in the no-match notification", async () => {
        const huge = "x".repeat(500);
        const { service, vsUI } = createMocks({
            "/a.bpmn": bpmnWithProcess("Other"),
        });

        await service.navigate(huge, "process");

        const message = vsUI.showInfo.mock.calls[0][0] as string;
        expect(message.length).toBeLessThan(200);
        expect(message).toContain("…");
    });

    it("forwards the source document URI to getConfiguration", async () => {
        const { service } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
        });
        const { workspace: vscodeWorkspace } = await import("vscode");
        const spy = vi.spyOn(vscodeWorkspace, "getConfiguration");
        const documentUri = { scheme: "file", path: "/src/a.bpmn" } as never;

        await service.navigate("ProcessB", "process", documentUri);

        expect(spy).toHaveBeenCalledWith(undefined, documentUri);
        spy.mockRestore();
    });

    it("reads candidate files in parallel, not serially", async () => {
        // Arrange a deferred resolution for each path.  If reads were serial,
        // the second readFile would only START after the first resolves —
        // therefore `pendingResolvers.length` would be 1 at any time.  With
        // parallel reads it reaches the file count before any resolves.
        const { service, vsWorkspace } = createMocks({
            "/a.bpmn": "<doc/>",
            "/b.bpmn": "<doc/>",
            "/c.bpmn": "<doc/>",
        });
        const pendingResolvers: ((value: string) => void)[] = [];
        vsWorkspace.readFile.mockImplementation(
            () => new Promise<string>((resolve) => pendingResolvers.push(resolve)),
        );

        const navigation = service.navigate("ProcessB", "process");
        // Microtask queue drained — all three readFile() calls should have
        // landed in pendingResolvers if reads are parallel.
        await Promise.resolve();
        await Promise.resolve();

        expect(pendingResolvers).toHaveLength(3);

        // Resolve everything so the navigate promise settles cleanly.
        pendingResolvers.forEach((resolve) => resolve("<doc/>"));
        await navigation;
    });

    it("shows the no-match info notification when the workspace contains no .bpmn files", async () => {
        const { service, vsUI } = createMocks({});

        await service.navigate("ProcessB", "process");

        expect(vsUI.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("No model declaring"),
        );
        // Empty workspace must NOT trigger the "all unreadable" error path.
        expect(vsUI.showError).not.toHaveBeenCalled();
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });
});

describe("ModelNavigationService.navigate — exclude glob", () => {
    it("forwards the composed exclude glob to vsWorkspace.findFiles", async () => {
        const { service, vsWorkspace } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
        });

        await service.navigate("ProcessB", "process");

        expect(vsWorkspace.findFiles).toHaveBeenCalledTimes(1);
        const [glob, exclude] = vsWorkspace.findFiles.mock.calls[0];
        expect(glob).toBe("**/*.bpmn");
        expect(typeof exclude).toBe("string");
        expect(exclude).toMatch(/\*\*\/dist\/\*\*/);
        expect(exclude).toMatch(/\*\*\/node_modules\/\*\*/);
    });

    it("merges files.exclude entries into the glob", async () => {
        configStore.files = { "**/private/**": true, "**/draft/**": false };
        const { service, vsWorkspace } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
        });

        await service.navigate("ProcessB", "process");

        const exclude = vsWorkspace.findFiles.mock.calls[0][1] as string;
        expect(exclude).toContain("**/private/**");
        expect(exclude).not.toContain("**/draft/**");
    });

    it("merges search.exclude entries into the glob", async () => {
        configStore.search = { "**/generated/**": true };
        const { service, vsWorkspace } = createMocks({
            "/a.bpmn": bpmnWithProcess("ProcessB"),
        });

        await service.navigate("ProcessB", "process");

        const exclude = vsWorkspace.findFiles.mock.calls[0][1] as string;
        expect(exclude).toContain("**/generated/**");
    });
});

describe("buildExcludeGlob", () => {
    it("returns a brace-glob containing the baseline even when configs are empty", () => {
        const config = {
            get: <T>(_key: string, fallback: T): T => fallback,
        } as never;

        const result = buildExcludeGlob(config);

        expect(result.startsWith("{")).toBe(true);
        expect(result.endsWith("}")).toBe(true);
        for (const name of [
            "node_modules",
            "dist",
            "build",
            "out",
            "target",
            "coverage",
        ]) {
            expect(result).toContain(`**/${name}/**`);
        }
    });

    it("deduplicates patterns that appear in both settings and baseline", () => {
        const config = {
            get: <T>(key: string, fallback: T): T => {
                if (key === "files.exclude") return { "**/dist/**": true } as T;
                if (key === "search.exclude") return {} as T;
                return fallback;
            },
        } as never;

        const result = buildExcludeGlob(config);
        const occurrences = result.split("**/dist/**").length - 1;
        expect(occurrences).toBe(1);
    });

    it("ignores disabled patterns (value === false)", () => {
        const config = {
            get: <T>(key: string, fallback: T): T => {
                if (key === "files.exclude") return { "**/keep-me/**": false } as T;
                if (key === "search.exclude") return {} as T;
                return fallback;
            },
        } as never;

        const result = buildExcludeGlob(config);
        expect(result).not.toContain("**/keep-me/**");
    });

    it("drops patterns containing comma or brace to keep the brace-group well-formed", () => {
        const config = {
            get: <T>(key: string, fallback: T): T => {
                if (key === "files.exclude")
                    return {
                        "**/{a,b}/**": true,
                        "src,test/**": true,
                        "**/safe/**": true,
                    } as T;
                if (key === "search.exclude") return {} as T;
                return fallback;
            },
        } as never;

        const result = buildExcludeGlob(config);
        expect(result).toContain("**/safe/**");
        expect(result).not.toContain("**/{a,b}/**");
        expect(result).not.toContain("src,test/**");
    });

    it("drops patterns containing only a stray close-brace (would unbalance the group)", () => {
        // `}` is the inverse of `{`: a literal close-brace would terminate
        // the wrapping brace-group prematurely.  Although `isBraceSafe`
        // primarily filters `,` and `{`, this test pins the close-brace
        // behaviour so a future refactor can't silently regress it.
        const config = {
            get: <T>(key: string, fallback: T): T => {
                if (key === "files.exclude")
                    return {
                        "**/weird}/**": true,
                        "**/normal/**": true,
                    } as T;
                if (key === "search.exclude") return {} as T;
                return fallback;
            },
        } as never;

        const result = buildExcludeGlob(config);
        // The "normal" pattern must survive.
        expect(result).toContain("**/normal/**");
        // The wrapping outer braces must be exactly one open and one close.
        const openBraces = (result.match(/\{/g) ?? []).length;
        const closeBraces = (result.match(/\}/g) ?? []).length;
        expect(openBraces).toBe(1);
        expect(closeBraces).toBe(1);
    });
});

describe("findExcludedRanges", () => {
    it("returns comment offsets", () => {
        const xml = `<a/><!--hide--><b/>`;
        const ranges = findExcludedRanges(xml);

        expect(ranges).toHaveLength(1);
        expect(xml.slice(ranges[0][0], ranges[0][1])).toBe("<!--hide-->");
    });

    it("returns CDATA offsets", () => {
        const xml = `<a><![CDATA[<bpmn:process id="X"/>]]></a>`;
        const ranges = findExcludedRanges(xml);

        expect(ranges).toHaveLength(1);
        expect(xml.slice(ranges[0][0], ranges[0][1])).toContain("CDATA");
    });

    it("returns empty array when nothing matches", () => {
        expect(findExcludedRanges("<a/>")).toEqual([]);
    });
});

describe("matchesOutsideComments", () => {
    const idRe = (id: string) => new RegExp(`<process id="${id}"/>`);

    it("returns true when the id occurs in plain XML", () => {
        expect(matchesOutsideComments("<process id=\"X\"/>", idRe("X"))).toBe(true);
    });

    it("returns false when the only occurrence is inside a comment", () => {
        const xml = `<a/><!-- <process id="X"/> --><b/>`;
        expect(matchesOutsideComments(xml, idRe("X"))).toBe(false);
    });

    it("returns false when the only occurrence is inside CDATA", () => {
        const xml = `<a><![CDATA[<process id="X"/>]]></a>`;
        expect(matchesOutsideComments(xml, idRe("X"))).toBe(false);
    });

    it("returns true when a real match exists alongside a commented decoy", () => {
        const xml = `<!-- <process id="X"/> --><process id="X"/>`;
        expect(matchesOutsideComments(xml, idRe("X"))).toBe(true);
    });
});

describe("buildIdRegex", () => {
    it("matches namespaced and non-namespaced process tags", () => {
        const re = buildIdRegex("ProcessB", "process");

        expect(re.test("<bpmn:process id=\"ProcessB\" >")).toBe(true);
        expect(re.test("<process id=\"ProcessB\"/>")).toBe(true);
        expect(re.test("<bpmn2:process  id='ProcessB'>")).toBe(true);
    });

    it("does not match an id with the same prefix but a longer value", () => {
        const re = buildIdRegex("ProcessB", "process");

        expect(re.test("<bpmn:process id=\"ProcessB_v2\"/>")).toBe(false);
    });

    it("does not confuse <process> with <participant>", () => {
        const re = buildIdRegex("ProcessB", "process");

        expect(re.test("<bpmn:participant id=\"ProcessB\" processRef=\"ProcessB\"/>")).toBe(
            false,
        );
    });

    it("matches decision tags with optional dmn: prefix", () => {
        const re = buildIdRegex("Decision_1", "decision");

        expect(re.test("<decision id=\"Decision_1\"/>")).toBe(true);
        expect(re.test("<dmn:decision id=\"Decision_1\">")).toBe(true);
    });

    it("escapes regex metacharacters in the id", () => {
        const re = buildIdRegex("a.b+c", "process");

        expect(re.test("<bpmn:process id=\"a.b+c\"/>")).toBe(true);
        expect(re.test("<bpmn:process id=\"aXbZc\"/>")).toBe(false);
    });

    it("tolerates whitespace around the = in id=", () => {
        const re = buildIdRegex("ProcessB", "process");

        expect(re.test("<bpmn:process id = \"ProcessB\"/>")).toBe(true);
        expect(re.test("<bpmn:process id\t=\t'ProcessB'/>")).toBe(true);
    });
});
