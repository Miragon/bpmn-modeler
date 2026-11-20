import { describe, expect, it } from "vitest";

import { isTestOrDeclarationFile } from "./testFiles";

describe("a test or declaration file", () => {
    it.each([
        { path: "libs/core/src/a.spec.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.browser.spec.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.test.tsx", testOrDeclaration: true },
        { path: "libs/core/src/a.spec.mjs", testOrDeclaration: true },
        { path: "libs/core/src/env.d.ts", testOrDeclaration: true },
        { path: "libs/core/src/env.d.mts", testOrDeclaration: true },
        { path: "libs/core/src/__fixtures__/fake.ts", testOrDeclaration: true },
        { path: "libs/core/src/__tests__/a.ts", testOrDeclaration: true },
        { path: "libs/core/src/test/a.ts", testOrDeclaration: true },
        { path: "libs/core/tests/harness.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.ts", testOrDeclaration: false },
        { path: "libs/core/src/testing/a.ts", testOrDeclaration: false },
        { path: "libs/core/src/test.ts", testOrDeclaration: false },
        { path: "libs/core/src/a.spec.data.ts", testOrDeclaration: false },
        { path: "libs/core/src/a.test.helpers.ts", testOrDeclaration: false },
        { path: "libs/core/vitest.config.ts", testOrDeclaration: false },
    ])(
        "reads $path as a test or declaration file: $testOrDeclaration",
        ({ path, testOrDeclaration }) => {
            expect(isTestOrDeclarationFile(path)).toBe(testOrDeclaration);
        },
    );
});
