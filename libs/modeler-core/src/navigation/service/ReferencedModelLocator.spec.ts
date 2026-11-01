import { describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace, RecordingNotifier } from "../../testing";
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

function createLocator(opts: { files: Record<string, string>; folders?: string[] }) {
    const workspace = new InMemoryWorkspace(opts.folders ?? ["/"], opts.files);
    const notifier = new RecordingNotifier();
    const locator = new ReferencedModelLocator(workspace, notifier);
    return { locator, workspace, notifier };
}

describe("findDeclaringFiles — workspace folder open (findFiles path)", () => {
    it("returns the single matching path", async () => {
        const { locator } = createLocator({
            files: {
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
            files: {
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
            files: {
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

    it("matches an exact top-level form id via the .form extension", async () => {
        const { locator } = createLocator({
            files: {
                "/request.form": JSON.stringify({ id: "Form_Request", components: [] }),
                "/other.form": JSON.stringify({ id: "Form_Other", components: [] }),
            },
        });

        const result = await locator.findDeclaringFiles("Form_Request", "form");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/request.form"],
            readFailures: [],
        });
    });

    it("ignores malformed JSON, nested ids, and empty top-level form ids", async () => {
        const { locator } = createLocator({
            files: {
                "/malformed.form": "{",
                "/nested.form": JSON.stringify({ components: [{ id: "Form_Request" }] }),
                "/empty.form": JSON.stringify({ id: "" }),
            },
        });

        const result = await locator.findDeclaringFiles("Form_Request", "form");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
    });

    it("returns all duplicate form-id declarations for picker disambiguation", async () => {
        const { locator } = createLocator({
            files: {
                "/a.form": JSON.stringify({ id: "Form_Shared" }),
                "/b.form": JSON.stringify({ id: "Form_Shared" }),
            },
        });

        const result = await locator.findDeclaringFiles("Form_Shared", "form");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") expect(result.paths).toEqual(["/a.form", "/b.form"]);
    });

    it("returns no matches when nothing declares the id (empty paths array)", async () => {
        const { locator } = createLocator({
            files: { "/a.bpmn": bpmnWithProcess("Other") },
        });

        const result = await locator.findDeclaringFiles("Missing", "process");

        expect(result).toEqual({
            kind: "matches",
            paths: [],
            readFailures: [],
        });
    });

    it("filters out paths inside build/output dirs that VS Code defaults miss", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/work/wanted.bpmn": bpmnWithProcess("Wanted"),
                "/work/dist/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/build/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/out/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/target/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/service/bin/test/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/coverage/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/node_modules/lib/inner.bpmn": bpmnWithProcess("Wanted"),
                "/work/nested/dist/deep.bpmn": bpmnWithProcess("Wanted"),
            },
        });
        const readFile = vi.spyOn(workspace, "readFile");

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/wanted.bpmn"]);
        }
        // Excluded paths should not even be read.
        expect(readFile.mock.calls).toEqual([["/work/wanted.bpmn"]]);
    });

    it("walks every workspace root when findFiles fails silently", async () => {
        const { locator, workspace } = createLocator({
            folders: ["/first", "/second"],
            files: {
                "/first/a.form": JSON.stringify({ id: "Form_A" }),
                "/second/b.form": JSON.stringify({ id: "Form_B" }),
            },
        });
        vi.spyOn(workspace, "findFiles").mockResolvedValue([]);

        const result = await locator.findFormDeclarations("/first/process.bpmn");

        expect(result).toEqual({
            kind: "matches",
            declarations: [
                { id: "Form_A", path: "/first/a.form" },
                { id: "Form_B", path: "/second/b.form" },
            ],
            readFailures: [],
        });
    });

    it("returns kind=all-unreadable when every candidate read fails", async () => {
        const { locator, workspace } = createLocator({
            files: { "/bad.bpmn": bpmnWithProcess("ProcessB") },
        });
        vi.spyOn(workspace, "readFile").mockRejectedValue(new Error("EACCES"));

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({
            kind: "all-unreadable",
            failures: [expect.stringContaining("EACCES")],
        });
    });

    it("returns kind=all-unreadable when every form fails to read", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/a.form": JSON.stringify({ id: "Form_A" }),
                "/b.form": JSON.stringify({ id: "Form_B" }),
            },
        });
        vi.spyOn(workspace, "readFile").mockRejectedValue(new Error("EACCES"));

        expect(await locator.findFormDeclarations()).toEqual({
            kind: "all-unreadable",
            failures: ["Could not read /a.form: EACCES", "Could not read /b.form: EACCES"],
        });
    });

    it("keeps the readable form declarations next to a form that failed to read", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/a.form": JSON.stringify({ id: "Form_A" }),
                "/b.form": JSON.stringify({ id: "Form_B" }),
            },
        });
        vi.spyOn(workspace, "readFile").mockRejectedValueOnce(new Error("EACCES"));

        expect(await locator.findFormDeclarations()).toEqual({
            kind: "matches",
            declarations: [{ id: "Form_B", path: "/b.form" }],
            readFailures: ["Could not read /a.form: EACCES"],
        });
    });

    it("includes partial read failures alongside successful matches", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/bad.bpmn": bpmnWithProcess("anything"),
                "/good.bpmn": bpmnWithProcess("ProcessB"),
            },
        });
        vi.spyOn(workspace, "readFile").mockRejectedValueOnce(new Error("EACCES"));

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
        const { locator } = createLocator({ files: { "/a.bpmn": xml } });

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
    });

    it("finds a process after a CDATA script that holds a comment opener", async () => {
        const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Parent">
    <bpmn:scriptTask id="Script"><bpmn:script><![CDATA[log("<!--");]]></bpmn:script></bpmn:scriptTask>
  </bpmn:process>
  <bpmn:process id="ProcessB"/>
  <!-- generated -->
</bpmn:definitions>`;
        const { locator } = createLocator({ files: { "/a.bpmn": xml } });

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({ kind: "matches", paths: ["/a.bpmn"], readFailures: [] });
    });

    it("reads candidate files in parallel", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/a.bpmn": "<doc/>",
                "/b.bpmn": "<doc/>",
                "/c.bpmn": "<doc/>",
            },
        });
        const pending: ((value: string) => void)[] = [];
        vi.spyOn(workspace, "readFile").mockImplementation(
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
        const { locator, workspace } = createLocator({
            folders: ["/work"],
            files: {
                "/work/parent.bpmn": bpmnWithProcess("Parent"),
                "/work/child.bpmn": bpmnWithProcess("ChildProcess"),
            },
        });
        const findFiles = vi.spyOn(workspace, "findFiles").mockResolvedValue([]);
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        const result = await locator.findDeclaringFiles(
            "ChildProcess",
            "process",
            "/work/parent.bpmn",
        );

        expect(findFiles).toHaveBeenCalledTimes(1);
        expect(readDirectory).toHaveBeenCalledWith("/work");
        expect(result).toEqual({
            kind: "matches",
            paths: ["/work/child.bpmn"],
            readFailures: [],
        });
    });

    it("recurses into subdirectories", async () => {
        const { locator, workspace } = createLocator({
            folders: ["/work"],
            files: { "/work/sub/child.bpmn": bpmnWithProcess("Nested") },
        });
        vi.spyOn(workspace, "findFiles").mockResolvedValue([]);

        const result = await locator.findDeclaringFiles("Nested", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/sub/child.bpmn"]);
        }
    });

    it("skips baseline-excluded directories (node_modules, dist, .git, …)", async () => {
        const { locator, workspace } = createLocator({
            folders: ["/work"],
            files: {
                "/work/wanted.bpmn": bpmnWithProcess("Wanted"),
                "/work/node_modules/inner.bpmn": bpmnWithProcess("Wanted"),
            },
        });
        vi.spyOn(workspace, "findFiles").mockResolvedValue([]);
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(readDirectory).not.toHaveBeenCalledWith("/work/node_modules");
        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/wanted.bpmn"]);
        }
    });

    it("tolerates unreadable subdirectories", async () => {
        const { locator, workspace } = createLocator({
            folders: ["/work"],
            files: {
                "/work/ok.bpmn": bpmnWithProcess("Wanted"),
                "/work/denied/hidden.bpmn": bpmnWithProcess("Wanted"),
            },
        });
        vi.spyOn(workspace, "findFiles").mockResolvedValue([]);
        const readDirectory = workspace.readDirectory.bind(workspace);
        vi.spyOn(workspace, "readDirectory").mockImplementation((path) =>
            path === "/work/denied" ? Promise.reject(new Error("EACCES")) : readDirectory(path),
        );

        const result = await locator.findDeclaringFiles("Wanted", "process");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/work/ok.bpmn"]);
        }
    });
});

describe("findDeclaringFiles — loose file (no workspace folder)", () => {
    it("walks the source document's directory via readDirectory (not findFiles)", async () => {
        const { locator, workspace } = createLocator({
            folders: [],
            files: {
                "/work/parent.bpmn": bpmnWithProcess("Parent"),
                "/work/child.bpmn": bpmnWithProcess("ChildProcess"),
            },
        });
        const findFiles = vi.spyOn(workspace, "findFiles");
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        const result = await locator.findDeclaringFiles(
            "ChildProcess",
            "process",
            "/work/parent.bpmn",
        );

        expect(findFiles).not.toHaveBeenCalled();
        expect(readDirectory).toHaveBeenCalledWith("/work");
        expect(result).toEqual({
            kind: "matches",
            paths: ["/work/child.bpmn"],
            readFailures: [],
        });
    });

    it("keeps the UNC root of the files it walks next to a loose file on a share", async () => {
        const { locator } = createLocator({
            folders: [],
            files: {
                "//server/share/work/parent.bpmn": bpmnWithProcess("Parent"),
                "//server/share/work/child.bpmn": bpmnWithProcess("ChildProcess"),
            },
        });

        const result = await locator.findDeclaringFiles(
            "ChildProcess",
            "process",
            "//server/share/work/parent.bpmn",
        );

        expect(result).toEqual({
            kind: "matches",
            paths: ["//server/share/work/child.bpmn"],
            readFailures: [],
        });
    });

    it("returns no-search-scope when no source URI and no workspace folders", async () => {
        const { locator, workspace } = createLocator({
            folders: [],
            files: { "/a.bpmn": bpmnWithProcess("ProcessB") },
        });
        const findFiles = vi.spyOn(workspace, "findFiles");
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        const result = await locator.findDeclaringFiles("ProcessB", "process");

        expect(result).toEqual({ kind: "no-search-scope" });
        expect(findFiles).not.toHaveBeenCalled();
        expect(readDirectory).not.toHaveBeenCalled();
    });
});

describe("findDeclaringFiles — logging", () => {
    it("shortens a long id in its log line like every echoed reference", async () => {
        const { locator, notifier } = createLocator({ files: {} });

        await locator.findDeclaringFiles("p".repeat(110), "process");

        expect(notifier.logged("info")[0]).toBe(
            `[nav] resolving process id="${"p".repeat(99)}…" sourceUri=<none>`,
        );
    });
});

describe("id regex semantics", () => {
    const expectFinds = (id: string, xml: string, kind: "process" | "decision") => {
        const { locator } = createLocator({
            files: { "/a.bpmn": xml, "/a.dmn": xml },
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
