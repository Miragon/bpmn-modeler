import { describe, expect, it } from "vitest";

import { importBursts, type BundleChunk } from "../../../vite.shared";

function chunk(
    fileName: string,
    imports: string[] = [],
    dynamicImports: string[] = [],
): BundleChunk {
    return { fileName, imports, dynamicImports };
}

describe("the files a webview bundle fetches at once", () => {
    it("are the entry and the chunks it imports on the page's first load", () => {
        const bundle = [
            chunk("index.js", ["shared.js"]),
            chunk("shared.js", ["runtime.js"]),
            chunk("runtime.js"),
        ];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["index.js", "runtime.js", "shared.js"] },
        ]);
    });

    it("are, for a dynamic import, its chunk and the chunks it imports that the entry has not loaded", () => {
        const bundle = [
            chunk("index.js", ["shared.js"], ["surface.js"]),
            chunk("shared.js"),
            chunk("surface.js", ["shared.js", "viewer.js"]),
            chunk("viewer.js", ["engine.js"]),
            chunk("engine.js"),
        ];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["index.js", "shared.js"] },
            { chunk: "surface.js", files: ["engine.js", "surface.js", "viewer.js"] },
        ]);
    });

    it("leave out what the chunk importing it dynamically has loaded already", () => {
        const bundle = [
            chunk("index.js", [], ["mode.js"]),
            chunk("mode.js", ["core.js"], ["lint.js"]),
            chunk("core.js"),
            chunk("lint.js", ["core.js", "rules.js"]),
            chunk("rules.js"),
        ];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["index.js"] },
            { chunk: "mode.js", files: ["core.js", "mode.js"] },
            { chunk: "lint.js", files: ["lint.js", "rules.js"] },
        ]);
    });

    it("name an import once although two chunks reach it", () => {
        const bundle = [
            chunk("index.js", [], ["viewer.js", "diff.js"]),
            chunk("diff.js", ["viewer.js"], []),
            chunk("viewer.js", ["core.js"]),
            chunk("core.js"),
        ];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["index.js"] },
            { chunk: "viewer.js", files: ["core.js", "viewer.js"] },
            { chunk: "diff.js", files: ["core.js", "diff.js", "viewer.js"] },
        ]);
    });

    it("count an import two chains reach from the chain that loaded less of it", () => {
        const bundle = [
            chunk("index.js", [], ["design.js", "merge.js"]),
            chunk("design.js", ["engine.js"], ["lint.js"]),
            chunk("merge.js", [], ["pane.js"]),
            chunk("pane.js", [], ["lint.js"]),
            chunk("lint.js", ["engine.js"]),
            chunk("engine.js"),
        ];

        const lint = importBursts(bundle, "index.js").find(({ chunk }) => chunk === "lint.js");

        expect(lint).toEqual({ chunk: "lint.js", files: ["engine.js", "lint.js"] });
    });

    it("end on a cycle of static imports", () => {
        const bundle = [
            chunk("index.js", [], ["a.js"]),
            chunk("a.js", ["b.js"]),
            chunk("b.js", ["a.js"]),
        ];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["index.js"] },
            { chunk: "a.js", files: ["a.js", "b.js"] },
        ]);
    });

    it("leave out a dynamic import that the entry loads statically too", () => {
        const bundle = [chunk("index.js", ["core.js"], ["core.js"]), chunk("core.js")];

        expect(importBursts(bundle, "index.js")).toEqual([
            { chunk: "index.js", files: ["core.js", "index.js"] },
        ]);
    });
});
