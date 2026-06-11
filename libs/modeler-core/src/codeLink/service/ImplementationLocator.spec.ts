import { posix } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImplementationLocator } from "./ImplementationLocator";

/**
 * `findFiles` is driven per test by a `glob → paths` function so each test
 * controls exactly what the (mocked) workspace search returns for the
 * filename/source globs the locator builds. `readFile` reads from a content map.
 */
function createLocator(opts: {
    findFiles?: (glob: string) => string[];
    fileContents?: Record<string, string>;
    folders?: string[];
}) {
    const fileContents = opts.fileContents ?? {};
    const folders = opts.folders ?? ["/"];
    const vsWorkspace = {
        findFiles: vi
            .fn()
            .mockImplementation((glob: string) =>
                Promise.resolve(opts.findFiles ? opts.findFiles(glob) : []),
            ),
        readFile: vi
            .fn()
            .mockImplementation((path: string) =>
                path in fileContents
                    ? Promise.resolve(fileContents[path])
                    : Promise.reject(new Error("not found")),
            ),
        readDirectory: vi.fn().mockRejectedValue(new Error("ENOENT")),
        findWorkspaceFolderForDocument: vi.fn(() => folders[0]),
        getWorkspaceFolderPaths: vi.fn(() => folders),
        getDocumentDirectory: vi.fn((document: string) => posix.dirname(document)),
    };
    const notifier = { logInfo: vi.fn(), logWarning: vi.fn() };
    const locator = new ImplementationLocator(vsWorkspace as never, notifier as never);
    return { locator, vsWorkspace, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ImplementationLocator — javaClass", () => {
    it("resolves the FQCN to the matching class file without reading content", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/main/java/com/example/MyDelegate.java"],
        });

        const result = await locator.resolve("com.example.MyDelegate", "javaClass");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/src/main/java/com/example/MyDelegate.java"],
            readFailures: [],
        });
        // The path is the answer; the file content is irrelevant.
        expect(vsWorkspace.readFile).not.toHaveBeenCalled();
    });

    it("builds a package-path glob across the JVM source extensions", async () => {
        const { locator, vsWorkspace } = createLocator({ findFiles: () => [] });

        await locator.resolve("com.example.MyDelegate", "javaClass");

        expect(vsWorkspace.findFiles).toHaveBeenCalledWith(
            "**/com/example/MyDelegate.{java,kt,groovy,scala}",
        );
    });

    it("returns empty matches when no class file is found", async () => {
        const { locator } = createLocator({ findFiles: () => [] });

        const result = await locator.resolve("com.example.Missing", "javaClass");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
    });

    it("returns multiple matches when the class exists under several roots", async () => {
        const { locator } = createLocator({
            findFiles: () => ["/a/com/example/X.java", "/b/com/example/X.kt"],
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
        const { locator, vsWorkspace } = createLocator({
            findFiles: (glob) => (glob.includes("MyBean") ? ["/src/MyBean.java"] : []),
        });

        const result = await locator.resolve("${myBean}", "delegateExpression");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/MyBean.java"]);
        }
        expect(vsWorkspace.findFiles).toHaveBeenCalledWith("**/MyBean.{java,kt,groovy,scala}");
    });

    it("derives the class from the leading id of an expression", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: (glob) => (glob.includes("Svc") ? ["/src/Svc.java"] : []),
        });

        const result = await locator.resolve("${svc.run()}", "expression");

        expect(result.kind).toBe("matches");
        expect(vsWorkspace.findFiles).toHaveBeenCalledWith("**/Svc.{java,kt,groovy,scala}");
    });

    it("falls back to a bean-annotation content search when no class file matches", async () => {
        const { locator } = createLocator({
            // Filename glob (contains "MyBean") finds nothing; the source scan does.
            findFiles: (glob) => (glob.includes("MyBean") ? [] : ["/src/CustomName.java"]),
            fileContents: {
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
        const { locator, vsWorkspace } = createLocator({ findFiles: () => [] });

        const result = await locator.resolve("${ 1 + 2 }", "expression");

        expect(result).toEqual({ kind: "matches", paths: [], readFailures: [] });
        // No bean id → nothing to search for.
        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
    });
});

describe("ImplementationLocator — externalTopic / jobType", () => {
    it("finds a job worker by the quoted job type literal", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/Worker.java", "/src/Other.java"],
            fileContents: {
                "/src/Worker.java": '@JobWorker(type = "payment-service")\nvoid handle() {}',
                "/src/Other.java": "class Other {}",
            },
        });

        const result = await locator.resolve("payment-service", "jobType");

        expect(result).toEqual({
            kind: "matches",
            paths: ["/src/Worker.java"],
            readFailures: [],
        });
        // Source scan spans JVM + JS/TS worker extensions.
        expect(vsWorkspace.findFiles).toHaveBeenCalledWith("**/*.{java,kt,groovy,scala,js,ts}");
    });

    it("finds a JS/TS worker by its taskType literal", async () => {
        const { locator } = createLocator({
            findFiles: () => ["/src/worker.ts"],
            fileContents: { "/src/worker.ts": 'createWorker({ taskType: "payment-service" })' },
        });

        const result = await locator.resolve("payment-service", "jobType");

        expect(result.kind).toBe("matches");
        if (result.kind === "matches") {
            expect(result.paths).toEqual(["/src/worker.ts"]);
        }
    });

    it("finds an external-task subscription by topic literal", async () => {
        const { locator } = createLocator({
            findFiles: () => ["/src/Sub.java"],
            fileContents: {
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
            findFiles: () => ["/src/A.java", "/src/B.java"],
            fileContents: {
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
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/A.java"],
        });
        vsWorkspace.readFile.mockRejectedValue(new Error("EACCES"));

        const result = await locator.resolve("t", "jobType");

        expect(result.kind).toBe("all-unreadable");
        if (result.kind === "all-unreadable") {
            expect(result.attempted).toBe(1);
            expect(result.failures[0]).toContain("EACCES");
        }
    });

    it("includes partial read failures alongside a successful match", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/bad.java", "/src/good.java"],
            fileContents: { "/src/good.java": 'type = "t"' },
        });
        vsWorkspace.readFile.mockImplementationOnce(() => Promise.reject(new Error("EACCES")));

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
        const { locator, vsWorkspace } = createLocator({ folders: [], findFiles: () => [] });

        const result = await locator.resolve("com.example.X", "javaClass");

        expect(result).toEqual({ kind: "no-search-scope" });
        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
    });
});

describe("ImplementationLocator — resolveMany", () => {
    it("returns an empty map and does no search for an empty entry list", async () => {
        const { locator, vsWorkspace } = createLocator({ findFiles: () => [] });

        const result = await locator.resolveMany([]);

        expect(result.size).toBe(0);
        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
    });

    it("maps every input id, with unresolved references mapping to []", async () => {
        const { locator } = createLocator({
            findFiles: () => ["/src/com/example/Charge.java"],
        });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
            { activityId: "B", kind: "javaClass", reference: "com.example.Missing" },
        ]);

        expect(result.get("A")).toEqual(["/src/com/example/Charge.java"]);
        expect(result.get("B")).toEqual([]);
    });

    it("settles javaClass by path alone — no file reads", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/com/example/Charge.java", "/src/Other.java"],
        });

        await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
        ]);

        expect(vsWorkspace.readFile).not.toHaveBeenCalled();
    });

    it("resolves all kinds in a single candidate scan", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => [
                "/src/com/example/Charge.java",
                "/src/MyBean.java",
                "/src/Worker.java",
            ],
            fileContents: {
                "/src/com/example/Charge.java": "class Charge {}",
                "/src/MyBean.java": "class MyBean {}",
                "/src/Worker.java": '@JobWorker(type = "pay")',
            },
        });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.Charge" },
            { activityId: "B", kind: "delegateExpression", reference: "${myBean}" },
            { activityId: "C", kind: "jobType", reference: "pay" },
        ]);

        expect(result.get("A")).toEqual(["/src/com/example/Charge.java"]);
        expect(result.get("B")).toEqual(["/src/MyBean.java"]);
        expect(result.get("C")).toEqual(["/src/Worker.java"]);
        // One candidate scan, not one per entry.
        expect(vsWorkspace.findFiles).toHaveBeenCalledTimes(1);
    });

    it("falls back to a bean annotation when the class file name differs", async () => {
        const { locator } = createLocator({
            findFiles: () => ["/src/Renamed.java"],
            fileContents: { "/src/Renamed.java": '@Service("myBean")\nclass Renamed {}' },
        });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "delegateExpression", reference: "${myBean}" },
        ]);

        expect(result.get("A")).toEqual(["/src/Renamed.java"]);
    });

    it("reads no files when only path-decidable entries are present", async () => {
        const { locator, vsWorkspace } = createLocator({
            findFiles: () => ["/src/MyBean.java"],
        });

        await locator.resolveMany([
            { activityId: "A", kind: "delegateExpression", reference: "${myBean}" },
        ]);

        // MyBean matches by file name, so the content pass is skipped entirely.
        expect(vsWorkspace.readFile).not.toHaveBeenCalled();
    });

    it("returns all-empty when there is no search scope", async () => {
        const { locator, vsWorkspace } = createLocator({ folders: [], findFiles: () => [] });

        const result = await locator.resolveMany([
            { activityId: "A", kind: "javaClass", reference: "com.example.X" },
        ]);

        expect(result.get("A")).toEqual([]);
        expect(vsWorkspace.findFiles).not.toHaveBeenCalled();
    });
});
