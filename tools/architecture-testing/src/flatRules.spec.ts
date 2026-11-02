import { describe, expect, it } from "vitest";

import { FLAT_RULES } from "./flatRules";
import { buildImportGraph } from "./importGraph";

describe("FLAT_RULES", () => {
    it("pass a tree without role folders", () => {
        const graph = buildImportGraph([
            { path: "index.ts", text: 'import "./lib/messages";' },
            { path: "lib/messages.ts", text: "" },
            { path: "features/AppendMenuModule.ts", text: "" },
        ]);

        expect(FLAT_RULES.flatMap(({ violations }) => violations(graph))).toEqual([]);
    });

    it("flag each file in a role folder", () => {
        const graph = buildImportGraph([
            { path: "index.ts", text: "" },
            { path: "lib/service/Fetcher.ts", text: "" },
            { path: "adapter/out/Writer.ts", text: "" },
        ]);

        expect(FLAT_RULES.flatMap(({ violations }) => violations(graph))).toEqual([
            { from: "lib/service/Fetcher.ts", to: "service/" },
            { from: "adapter/out/Writer.ts", to: "adapter/out/" },
        ]);
    });
});
