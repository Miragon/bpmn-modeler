import { describe, expect, it, vi } from "vitest";

import { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { InMemoryWorkspace, RecordingNotifier } from "../../testing";
import { ImplementationLocator } from "./ImplementationLocator";
import { SourceIndex } from "./SourceIndex";

function createLocator(opts: { files?: Record<string, string>; folders?: string[] } = {}) {
    const workspace = new InMemoryWorkspace(opts.folders ?? ["/"], opts.files);
    const notifier = new RecordingNotifier();
    const locator = new ImplementationLocator(workspace, notifier);
    return { locator, workspace, notifier };
}

describe("ImplementationLocator — javaClass", () => {
    it("resolves the FQCN to the matching class file without reading content", async () => {
        const { locator, workspace } = createLocator({
            files: { "/src/main/java/com/example/MyDelegate.java": "class MyDelegate {}" },
        });
        const readFile = vi.spyOn(workspace, "readFile");

        const result = await locator.resolve("com.example.MyDelegate", "javaClass");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/src/main/java/com/example/MyDelegate.java"],
            readFailures: [],
        });
        // The path is the answer; the file content is irrelevant.
        expect(readFile).not.toHaveBeenCalled();
    });

    it("builds a package-path glob across the JVM source extensions", async () => {
        const { locator, workspace } = createLocator();
        const findFiles = vi.spyOn(workspace, "findFiles");

        await locator.resolve("com.example.MyDelegate", "javaClass");

        expect(findFiles).toHaveBeenCalledWith("**/com/example/MyDelegate.{java,kt,groovy,scala}");
    });

    it("returns empty matches when no class file is found", async () => {
        const { locator } = createLocator();

        const result = await locator.resolve("com.example.Missing", "javaClass");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
    });

    it("returns multiple matches when the class exists under several roots", async () => {
        const { locator } = createLocator({
            files: { "/a/com/example/X.java": "", "/b/com/example/X.kt": "" },
        });

        const result = await locator.resolve("com.example.X", "javaClass");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/a/com/example/X.java", "/b/com/example/X.kt"]);
        }
    });
});

describe("ImplementationLocator — delegateExpression / expression", () => {
    it("finds the implementing class by capitalised bean name", async () => {
        const { locator, workspace } = createLocator({ files: { "/src/MyBean.java": "" } });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolve("${myBean}", "delegateExpression");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/MyBean.java"]);
        }
        expect(findFiles).toHaveBeenCalledWith("**/MyBean.{java,kt,groovy,scala}");
    });

    it("derives the class from the leading id of an expression", async () => {
        const { locator, workspace } = createLocator({ files: { "/src/Svc.java": "" } });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolve("${svc.run()}", "expression");

        expect(result.kind).toBe("matches");
        expect(findFiles).toHaveBeenCalledWith("**/Svc.{java,kt,groovy,scala}");
    });

    it("falls back to a bean-annotation content search when no class file matches", async () => {
        const { locator } = createLocator({
            // No MyBean class file exists; only the source scan finds the annotated class.
            files: {
                "/src/CustomName.java": '@Service("myBean")\nclass CustomName {}',
            },
        });

        const result = await locator.resolve("${myBean}", "delegateExpression");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/src/CustomName.java"],
            readFailures: [],
        });
    });

    it("returns empty matches when the expression has no leading bean id", async () => {
        const { locator, workspace } = createLocator();
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolve("${ 1 + 2 }", "expression");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
        // No bean id → nothing to search for.
        expect(findFiles).not.toHaveBeenCalled();
    });
});

describe("ImplementationLocator — externalTopic / jobType", () => {
    it("finds a job worker by the quoted job type literal", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/src/Worker.java": '@JobWorker(type = "payment-service")\nvoid handle() {}',
                "/src/Other.java": "class Other {}",
            },
        });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolve("payment-service", "jobType");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/src/Worker.java"],
            readFailures: [],
        });
        // Source scan spans JVM + JS/TS worker extensions.
        expect(findFiles).toHaveBeenCalledWith("**/*.{java,kt,groovy,scala,js,ts}");
    });

    it("finds a JS/TS worker by its taskType literal", async () => {
        const { locator } = createLocator({
            files: { "/src/worker.ts": 'createWorker({ taskType: "payment-service" })' },
        });

        const result = await locator.resolve("payment-service", "jobType");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/worker.ts"]);
        }
    });

    it("finds an external-task subscription by topic literal", async () => {
        const { locator } = createLocator({
            files: {
                "/src/Sub.java": '@ExternalTaskSubscription("payment-topic")\nclass Sub {}',
            },
        });

        const result = await locator.resolve("payment-topic", "externalTopic");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/Sub.java"]);
        }
    });

    it("returns multiple matches when several files declare the literal", async () => {
        const { locator } = createLocator({
            files: {
                "/src/A.java": '@JobWorker(type="t")',
                "/src/B.java": 'taskType: "t"',
            },
        });

        const result = await locator.resolve("t", "jobType");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/A.java", "/src/B.java"]);
        }
    });

    it("reports all-unreadable when every candidate read fails", async () => {
        const { locator, workspace } = createLocator({ files: { "/src/A.java": "" } });
        vi.spyOn(workspace, "readFile").mockRejectedValue(new Error("EACCES"));

        const result = await locator.resolve("t", "jobType");

        expect(result.kind).toBe("all-unreadable");
        if (result.kind === "all-unreadable") {
            expect(result.attempted).toBe(1);
            expect(result.failures[0]).toContain("EACCES");
        }
    });

    it("includes partial read failures alongside a successful match", async () => {
        const { locator, workspace } = createLocator({
            files: { "/src/bad.java": "", "/src/good.java": 'type = "t"' },
        });
        vi.spyOn(workspace, "readFile").mockRejectedValueOnce(new Error("EACCES"));

        const result = await locator.resolve("t", "jobType");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/good.java"]);
            expect(result.readFailures).toHaveLength(1);
        }
    });
});

describe("ImplementationLocator — no search scope", () => {
    it("returns no-search-scope when no folder is open and no source uri given", async () => {
        const { locator, workspace } = createLocator({ folders: [] });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolve("com.example.X", "javaClass");

        expect(result).toEqual({ kind: "no-search-scope" });
        expect(findFiles).not.toHaveBeenCalled();
    });
});

describe("ImplementationLocator — resolveMany", () => {
    it("returns an empty map and does no search for an empty entry list", async () => {
        const { locator, workspace } = createLocator();
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolveMany([]);

        expect(result.size).toBe(0);
        expect(findFiles).not.toHaveBeenCalled();
    });

    it("maps every input id, with unresolved references mapping to []", async () => {
        const { locator } = createLocator({ files: { "/src/com/example/Charge.java": "" } });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
            { activityId: "B", kind: "javaClass", reference: "com.example.Missing" },
        ]);

        expect(result.get("A")).toEqual(["/src/com/example/Charge.java"]);
        expect(result.get("B")).toEqual([]);
    });

    it("settles javaClass by path alone — no file reads", async () => {
        const { locator, workspace } = createLocator({
            files: { "/src/com/example/Charge.java": "", "/src/Other.java": "" },
        });
        const readFile = vi.spyOn(workspace, "readFile");

        await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
        ]);

        expect(readFile).not.toHaveBeenCalled();
    });

    it("resolves all kinds in a single candidate scan", async () => {
        const { locator, workspace } = createLocator({
            files: {
                "/src/com/example/Charge.java": "class Charge {}",
                "/src/MyBean.java": "class MyBean {}",
                "/src/Worker.java": '@JobWorker(type = "pay")',
            },
        });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
            { activityId: "B", kind: "delegateExpression", reference: "${myBean}" },
            { activityId: "C", kind: "jobType", reference: "pay" },
        ]);

        expect(result.get("A")).toEqual(["/src/com/example/Charge.java"]);
        expect(result.get("B")).toEqual(["/src/MyBean.java"]);
        expect(result.get("C")).toEqual(["/src/Worker.java"]);
        // One candidate scan, not one per entry.
        expect(findFiles).toHaveBeenCalledTimes(1);
    });

    it("falls back to a bean annotation when the class file name differs", async () => {
        const { locator } = createLocator({
            files: { "/src/Renamed.java": '@Service("myBean")\nclass Renamed {}' },
        });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "delegateExpression", reference: "${myBean}" },
        ]);

        expect(result.get("A")).toEqual(["/src/Renamed.java"]);
    });

    it("reads no files when only path-decidable entries are present", async () => {
        const { locator, workspace } = createLocator({ files: { "/src/MyBean.java": "" } });
        const readFile = vi.spyOn(workspace, "readFile");

        await locator.resolveMany([
            { activityId: "A", kind: "delegateExpression", reference: "${myBean}" },
        ]);

        // MyBean matches by file name, so the content pass is skipped entirely.
        expect(readFile).not.toHaveBeenCalled();
    });

    it("returns all-empty when there is no search scope", async () => {
        const { locator, workspace } = createLocator({ folders: [] });
        const findFiles = vi.spyOn(workspace, "findFiles");

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.X" },
        ]);

        expect(result.get("A")).toEqual([]);
        expect(findFiles).not.toHaveBeenCalled();
    });
});

describe("ImplementationLocator — resolveMany through a shared source index", () => {
    const SOURCES = {
        "/src/com/example/Charge.java": "class Charge {}",
        "/src/MyBean.java": "class MyBean {}",
        "/src/Renamed.java": '@Service("renamedBean")\nclass Renamed {}',
        "/src/Worker.java": '@JobWorker(type = "pay") @JobWorker(type = "pay later")',
    };
    const ENTRIES: ImplementationEntry[] = [
        { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
        { activityId: "B", kind: "delegateExpression", reference: "${myBean}" },
        { activityId: "C", kind: "expression", reference: "${renamedBean.run()}" },
        { activityId: "D", kind: "jobType", reference: "pay" },
        { activityId: "E", kind: "externalTopic", reference: "missing" },
    ];

    function createIndexedLocator() {
        const created = createLocator({ files: SOURCES });
        const index = new SourceIndex(created.workspace, created.notifier);
        const resolveFor = (editorId: string, entries: ImplementationEntry[]) =>
            created.locator.resolveMany(
                entries,
                "/doc.bpmn",
                index.sourcesFor(editorId, "/doc.bpmn"),
            );
        return { ...created, resolveFor };
    }

    it("resolves exactly what a direct search resolves", async () => {
        const direct = createLocator({ files: SOURCES });
        const { resolveFor } = createIndexedLocator();

        const expected = await direct.locator.resolveMany(ENTRIES, "/doc.bpmn");
        const indexed = await resolveFor("editor1", ENTRIES);

        expect(indexed).toEqual(expected);
        expect(indexed.get("C")).toEqual(["/src/Renamed.java"]);
        expect(indexed.get("D")).toEqual(["/src/Worker.java"]);
    });

    it("lets a second editor resolve without listing or reading the workspace again", async () => {
        const { resolveFor, workspace } = createIndexedLocator();

        await resolveFor("editor1", ENTRIES);
        const findFiles = vi.spyOn(workspace, "findFiles");
        const readFile = vi.spyOn(workspace, "readFile");
        const second = await resolveFor("editor2", ENTRIES);

        expect(second.get("D")).toEqual(["/src/Worker.java"]);
        expect(findFiles).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
    });

    it("reads the content again for a literal the indexed facts cannot decide", async () => {
        const { resolveFor, workspace } = createIndexedLocator();
        const spacedTopic: ImplementationEntry[] = [
            { activityId: "F", kind: "jobType", reference: "pay later" },
        ];

        await resolveFor("editor1", ENTRIES);
        const readFile = vi.spyOn(workspace, "readFile");
        const result = await resolveFor("editor2", spacedTopic);

        expect(result.get("F")).toEqual(["/src/Worker.java"]);
        expect(readFile).toHaveBeenCalledTimes(Object.keys(SOURCES).length);
    });
});
