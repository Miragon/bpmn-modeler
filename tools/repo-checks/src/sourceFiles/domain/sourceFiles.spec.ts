import { describe, expect, it } from "vitest";

import { measuredTypeScriptFiles } from "./sourceFiles";

describe("the measured TypeScript files", () => {
    it.each([
        { path: "libs/core/src/a.ts", measured: true },
        { path: "libs/core/src/View.tsx", measured: true },
        { path: "tools/checks/bin/run.mts", measured: true },
        { path: "tools/checks/bin/run.cts", measured: true },
        { path: "libs/core/vitest.config.ts", measured: true },
        { path: "docs/.vitepress/config.ts", measured: true },
        { path: "libs/core/src/a.spec.ts", measured: false },
        { path: "libs/core/src/a.browser.spec.ts", measured: false },
        { path: "libs/core/src/a.test.tsx", measured: false },
        { path: "libs/core/src/env.d.ts", measured: false },
        { path: "libs/core/src/env.d.mts", measured: false },
        { path: "libs/core/src/__fixtures__/fake.ts", measured: false },
        { path: "libs/core/src/__tests__/a.ts", measured: false },
        { path: "libs/core/test/harness.ts", measured: false },
        { path: "libs/core/tests/harness.ts", measured: false },
        { path: "libs/core/src/a.js", measured: false },
        { path: "scripts/perf/gen.ts", measured: false },
        { path: "libs/core-extra/src/a.ts", measured: false },
    ])("measures $path: $measured", ({ path, measured }) => {
        expect(measuredTypeScriptFiles([path], ["libs/core", "tools/checks", "docs"])).toEqual(
            measured ? [path] : [],
        );
    });

    it("reads a test folder name only inside the workspace", () => {
        expect(measuredTypeScriptFiles(["test/app/src/a.ts"], ["test/app"])).toEqual([
            "test/app/src/a.ts",
        ]);
    });
});
