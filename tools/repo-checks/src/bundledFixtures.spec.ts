import { describe, expect, it } from "vitest";

import { bundledFixtures, type RenderedChunk } from "../../../vite.shared";

function chunk(fileName: string, renderedLengths: Record<string, number>): RenderedChunk {
    return {
        fileName,
        modules: Object.fromEntries(
            Object.entries(renderedLengths).map(([id, renderedLength]) => [id, { renderedLength }]),
        ),
    };
}

describe("the fixtures a production bundle carries", () => {
    it("are the modules under a __fixtures__ folder that a chunk renders code of", () => {
        const bundle = [
            chunk("index.js", {
                "/repo/apps/web/src/main.ts": 120,
                "/repo/apps/web/src/__fixtures__/mock-merge.ts": 3100,
            }),
            chunk("chunks/surface.js", { "/repo/libs/x/src/__fixtures__/diagram.ts": 40 }),
        ];

        expect(bundledFixtures(bundle)).toEqual([
            { chunk: "index.js", fixture: "/repo/apps/web/src/__fixtures__/mock-merge.ts" },
            { chunk: "chunks/surface.js", fixture: "/repo/libs/x/src/__fixtures__/diagram.ts" },
        ]);
    });

    it("leave out a fixture module that tree-shaking reduced to nothing", () => {
        const bundle = [chunk("index.js", { "/repo/apps/web/src/__fixtures__/mock-bpmn.ts": 0 })];

        expect(bundledFixtures(bundle)).toEqual([]);
    });

    it("leave out a module whose name only contains the folder's name", () => {
        const bundle = [chunk("index.js", { "/repo/apps/web/src/my__fixtures__.ts": 80 })];

        expect(bundledFixtures(bundle)).toEqual([]);
    });

    it("find a fixture by a Windows path and by a query suffix on its id", () => {
        const bundle = [
            chunk("index.js", {
                "C:\\repo\\apps\\web\\src\\__fixtures__\\mock.ts": 10,
                "/repo/apps/web/src/__fixtures__/samples.json?import": 10,
            }),
        ];

        expect(bundledFixtures(bundle).map(({ fixture }) => fixture)).toEqual([
            "C:\\repo\\apps\\web\\src\\__fixtures__\\mock.ts",
            "/repo/apps/web/src/__fixtures__/samples.json?import",
        ]);
    });
});
