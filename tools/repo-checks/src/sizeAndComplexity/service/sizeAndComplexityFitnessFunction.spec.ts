import { describe, expect, it } from "vitest";

import { measure } from "../../fitness/service/measurement";
import { InMemorySourceMeasures } from "../../sourceFiles/__fixtures__/inMemorySourceMeasures";
import { createSizeAndComplexityFitnessFunction } from "./sizeAndComplexityFitnessFunction";

describe("the size and complexity fitness function", () => {
    it("measures the files of the tree it is given, values included", () => {
        const sources = new InMemorySourceMeasures([
            {
                path: "libs/core/src/a.ts",
                codeLines: 12,
                functions: [{ name: "f", line: 3, complexity: 4 }],
                barrel: false,
            },
        ]);

        const measured = measure(createSizeAndComplexityFitnessFunction({ sources }), {
            repoRoot: "/checkout/c1",
            commit: "c1",
            changeBase: "c1",
        });

        expect(measured).toEqual({
            findings: [
                {
                    key: "libs/core/src/a.ts",
                    path: "libs/core/src/a.ts",
                    line: 3,
                    message: "12 code lines; highest complexity 4 (f)",
                    values: { codeLines: 12, complexity: 4 },
                    group: "files",
                },
            ],
        });
        expect(sources.reads).toEqual(["/checkout/c1"]);
    });
});
