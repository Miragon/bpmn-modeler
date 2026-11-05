import { describe, expect, it } from "vitest";

import { sizeAndComplexityFindings } from "./sizeAndComplexityFindings";

describe("the size and complexity findings", () => {
    it("give each file its code lines and its highest complexity, at the most complex function", () => {
        expect(
            sizeAndComplexityFindings([
                {
                    path: "libs/core/src/service/Verification.ts",
                    codeLines: 143,
                    functions: [
                        { name: "constructor", line: 12, complexity: 1 },
                        { name: "verifyActive", line: 50, complexity: 23 },
                        { name: "verifyLater", line: 90, complexity: 23 },
                    ],
                },
            ]),
        ).toEqual([
            {
                key: "libs/core/src/service/Verification.ts",
                path: "libs/core/src/service/Verification.ts",
                line: 50,
                message: "143 code lines; highest complexity 23 (verifyActive)",
                values: { codeLines: 143, complexity: 23 },
                group: "files",
            },
        ]);
    });

    it("give a file without a function no complexity and point at its top", () => {
        expect(
            sizeAndComplexityFindings([
                { path: "libs/core/src/types.ts", codeLines: 9, functions: [] },
            ]),
        ).toEqual([
            {
                key: "libs/core/src/types.ts",
                path: "libs/core/src/types.ts",
                line: 1,
                message: "9 code lines; no function",
                values: { codeLines: 9 },
                group: "files",
            },
        ]);
    });
});
